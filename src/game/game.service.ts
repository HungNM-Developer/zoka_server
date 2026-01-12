import { Injectable } from '@nestjs/common';
import { Card, Element, Player, Room, RoomStatus, RoundResult } from './game.types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class GameService {
  private rooms: Map<string, Room> = new Map();
  private socketToRoom: Map<string, string> = new Map();
  private turnTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private onRoomUpdateLink: (room: Room, extra?: { event: string; data?: any }) => void;

  setUpdateCallback(cb: (room: Room, extra?: { event: string; data?: any }) => void) {
    this.onRoomUpdateLink = cb;
  }

  createRoom(hostId: string, username: string, maxPlayers: number = 8): Room {
    const code = this.generateRoomCode();
    const player: Player = {
      id: hostId,
      username,
      hand: [],
      stars: 55, // Starting stars
      ready: false, // Host does not need to be ready
      hasPlayed: false,
    };

    const room: Room = {
      code,
      maxPlayers,
      status: RoomStatus.WAITING,
      players: { [hostId]: player },
      hostId,
      round: 0,
      turnOrder: [],
      currentTurnIndex: 0,
      history: [],
    };

    this.rooms.set(code, room);
    this.socketToRoom.set(hostId, code);
    return room;
  }

  joinRoom(socketId: string, username: string, code: string): Room {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) throw new Error('Room not found');
    if (room.status !== RoomStatus.WAITING) throw new Error('Game already started');

    // Check if room is full
    if (Object.keys(room.players).length >= room.maxPlayers) {
      throw new Error('Room is full');
    }

    // Check if player with same username already exists (for rejoining on refresh)
    const existingPlayerId = Object.keys(room.players).find(
      (id) => room.players[id].username === username
    );

    if (existingPlayerId) {
      // Transfer state to new socket ID
      const playerData = room.players[existingPlayerId];
      delete room.players[existingPlayerId];
      room.players[socketId] = { ...playerData, id: socketId };
      this.socketToRoom.delete(existingPlayerId);
      this.socketToRoom.set(socketId, code);

      // If the old ID was the host, update hostId
      if (room.hostId === existingPlayerId) {
        room.hostId = socketId;
      }

      // Update turn order if in middle of game
      if (room.turnOrder) {
        room.turnOrder = room.turnOrder.map(id => id === existingPlayerId ? socketId : id);
      }
    } else {
      // Check if username is already taken in this room
      const isNameTaken = Object.values(room.players).some(p => p.username.toLowerCase() === username.toLowerCase());
      if (isNameTaken) {
        throw new Error('Username already taken in this room');
      }

      room.players[socketId] = {
        id: socketId,
        username,
        hand: [],
        stars: 55,
        ready: false,
        hasPlayed: false,
      };
      this.socketToRoom.set(socketId, code);
    }

    return room;
  }

  leaveRoom(socketId: string): string | null {
    const code = this.socketToRoom.get(socketId);
    if (!code) return null;

    const room = this.rooms.get(code);
    if (room) {
      delete room.players[socketId];
      this.socketToRoom.delete(socketId);

      if (Object.keys(room.players).length === 0) {
        this.rooms.delete(code);
      } else if (room.hostId === socketId) {
        room.hostId = Object.keys(room.players)[0];
      }
    }
    return code;
  }


  toggleReady(socketId: string, ready: boolean): Room {
    const room = this.getRoomBySocketId(socketId);
    if (!room) throw new Error('Room not found');
    room.players[socketId].ready = ready;
    return room;
  }

  startGame(socketId: string): Room {
    const room = this.getRoomBySocketId(socketId);
    if (!room) throw new Error('Room not found');
    if (room.hostId !== socketId) throw new Error('Only host can start');

    const players = Object.values(room.players);
    if (players.length < 4) throw new Error('Minimum 4 players required');
    if (players.some(p => p.id !== room.hostId && !p.ready)) throw new Error('All other players must be ready');

    room.status = RoomStatus.PLAYING;
    room.round = 1;

    // Initialize hands for all players
    players.forEach(player => {
      player.stars = 55; // Reset stars to 55
      player.hand = Array.from({ length: 10 }, (_, i) => ({
        id: uuidv4(),
        stars: i + 1,
        element: this.getRandomElement(),
      }));
    });

    this.startRound(room);
    return room;
  }

  resetToLobby(socketId: string) {
    const room = this.getRoomBySocketId(socketId);
    if (!room) throw new Error('Room not found');
    if (room.hostId !== socketId) throw new Error('Only host can reset');
    if (room.status !== RoomStatus.FINISHED) throw new Error('Game not finished');

    room.status = RoomStatus.WAITING;
    room.round = 0;
    room.history = [];
    Object.values(room.players).forEach(p => {
      p.ready = false;
      p.hasPlayed = false;
      p.playedCard = undefined;
      p.hand = [];
    });

    return room;
  }

  startRound(room: Room) {
    room.turnOrder = this.shuffle(Object.keys(room.players));
    room.currentTurnIndex = 0;
    Object.values(room.players).forEach(p => {
      p.hasPlayed = false;
      p.playedCard = undefined;
    });
    this.resetTurnTimeout(room);
  }

  private resetTurnTimeout(room: Room) {
    const timeoutKey = `room_${room.code}`;
    if (this.turnTimeouts.has(timeoutKey)) {
      clearTimeout(this.turnTimeouts.get(timeoutKey));
    }

    const timeout = setTimeout(() => {
      const roomRef = this.rooms.get(room.code);
      if (!roomRef) return;

      const currentPlayerId = room.turnOrder[room.currentTurnIndex];
      const player = room.players[currentPlayerId];
      if (player && player.hand.length > 0) {
        // Auto-play lowest star card
        const lowestCardId = [...player.hand].sort((a, b) => a.stars - b.stars)[0].id;
        try {
          this.playCard(currentPlayerId, lowestCardId);
          if (this.onRoomUpdateLink) {
            const updatedRoom = this.rooms.get(room.code);
            if (updatedRoom) {
              this.onRoomUpdateLink(updatedRoom, { event: 'CARD_PLAYED', data: { playerId: currentPlayerId } });
            }
          }
        } catch (e) {
          console.error('Auto-play failed:', e);
        }
      }
    }, 20000); // 20 seconds

    this.turnTimeouts.set(timeoutKey, timeout);
  }

  playCard(socketId: string, cardId: string): Room {
    const room = this.getRoomBySocketId(socketId);
    if (!room) throw new Error('Room not found');

    const player = room.players[socketId];
    if (room.turnOrder[room.currentTurnIndex] !== socketId) {
      throw new Error('Not your turn');
    }

    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) throw new Error('Card not found');

    player.playedCard = player.hand.splice(cardIndex, 1)[0];
    player.hasPlayed = true;
    room.currentTurnIndex++;

    if (room.currentTurnIndex >= room.turnOrder.length) {
      const timeoutKey = `room_${room.code}`;
      clearTimeout(this.turnTimeouts.get(timeoutKey));
      this.turnTimeouts.delete(timeoutKey);
      this.resolveRound(room);
    } else {
      this.resetTurnTimeout(room);
    }

    return room;
  }

  private resolveRound(room: Room) {
    const players = Object.values(room.players);
    const elementsPresent = [...new Set(players.map(p => p.playedCard!.element))];

    // Calculate merged stars per element
    const elementTotals: Partial<Record<Element, number>> = {};
    players.forEach(p => {
      const el = p.playedCard!.element;
      elementTotals[el] = (elementTotals[el] || 0) + p.playedCard!.stars;
    });

    const playerChanges: Record<string, number> = {};
    players.forEach(p => playerChanges[p.id] = 0);

    const counterChain: Record<Element, Element> = {
      [Element.FIRE]: Element.ICE,
      [Element.ICE]: Element.WIND,
      [Element.WIND]: Element.EARTH,
      [Element.EARTH]: Element.ELECTRIC,
      [Element.ELECTRIC]: Element.WATER,
      [Element.WATER]: Element.FIRE,
    };

    const resolvedPlayerIds = new Set<string>();

    // 1. Resolve direct counters (Rule 5.1 & 5.2)
    for (const attackerEl of elementsPresent) {
      const defenderEl = counterChain[attackerEl];
      if (elementsPresent.includes(defenderEl)) {
        const attackerTotal = elementTotals[attackerEl]!;
        const defenderTotal = elementTotals[defenderEl]!;

        const attackerPlayers = players.filter(p => p.playedCard!.element === attackerEl);
        const defenderPlayers = players.filter(p => p.playedCard!.element === defenderEl);

        attackerPlayers.forEach(p => resolvedPlayerIds.add(p.id));
        defenderPlayers.forEach(p => resolvedPlayerIds.add(p.id));

        if (defenderTotal > 2 * attackerTotal) {
          // Disadvantaged element overcomes with significant power (Rule 5.2 update)
          attackerPlayers.forEach(p => playerChanges[p.id] -= p.playedCard!.stars);
          defenderPlayers.forEach(p => playerChanges[p.id] += p.playedCard!.stars);
        } else if (defenderTotal === 2 * attackerTotal) {
          // Draw (Rule 5.1 update: 2:1 ratio results in draw)
        } else {
          // Advantaged element wins (Standard win or defender didn't have enough power)
          attackerPlayers.forEach(p => playerChanges[p.id] += p.playedCard!.stars);
          defenderPlayers.forEach(p => playerChanges[p.id] -= p.playedCard!.stars);
        }
      }
    }

    // 2. Resolve no counter relationship (Rule 5.3)
    const remainingPlayers = players.filter(p => !resolvedPlayerIds.has(p.id));
    const remainingElements = [...new Set(remainingPlayers.map(p => p.playedCard!.element))];

    if (remainingElements.length > 1) {
      // Compare total stars of all remaining elements
      let maxTotal = -1;
      let winnersEls: Element[] = [];
      remainingElements.forEach(el => {
        const total = elementTotals[el]!;
        if (total > maxTotal) {
          maxTotal = total;
          winnersEls = [el];
        } else if (total === maxTotal) {
          winnersEls.push(el);
        }
      });

      // If there are losers (i.e. not everyone tied for max), apply changes
      if (winnersEls.length < remainingElements.length) {
        remainingPlayers.forEach(p => {
          const el = p.playedCard!.element;
          if (winnersEls.includes(el)) {
            playerChanges[p.id] += p.playedCard!.stars;
          } else {
            playerChanges[p.id] -= p.playedCard!.stars;
          }
        });
      }
    } else if (remainingElements.length === 1 && elementsPresent.length === 1) {
      // Rule 5.4: All cards same element - Compare stars
      const allPlayers = players; // Everyone is same element
      let maxStars = -1;
      allPlayers.forEach(p => {
        if (p.playedCard!.stars > maxStars) maxStars = p.playedCard!.stars;
      });

      const winners = allPlayers.filter(p => p.playedCard!.stars === maxStars);

      // Only apply if there's at least one loser (not everyone tied)
      if (winners.length < allPlayers.length) {
        allPlayers.forEach(p => {
          if (p.playedCard!.stars === maxStars) {
            playerChanges[p.id] += p.playedCard!.stars;
          } else {
            playerChanges[p.id] -= p.playedCard!.stars;
          }
        });
      }
    }
    // Rule 5.5: Players not involved in any counter (already handled by remainingElements.length === 1 check above)

    // Update stars and record history
    const roundResult: RoundResult = {
      round: room.round,
      results: players.map(p => {
        p.stars += playerChanges[p.id];
        return {
          playerId: p.id,
          cardStars: p.playedCard!.stars,
          cardElement: p.playedCard!.element,
          change: playerChanges[p.id],
          newTotal: p.stars,
        };
      }),
    };
    room.history.push(roundResult);

    // Next round or finish
    if (room.round >= 10) {
      room.status = RoomStatus.FINISHED;
    } else {
      room.round++;
      this.startRound(room);
    }
  }

  getRoomBySocketId(socketId: string): Room | undefined {
    const code = this.socketToRoom.get(socketId);
    return code ? this.rooms.get(code) : undefined;
  }

  getRoomByCode(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  getRoomsList() {
    return Array.from(this.rooms.values()).map(r => ({
      code: r.code,
      status: r.status,
      playerCount: Object.keys(r.players).length,
    }));
  }

  kickPlayer(kickerId: string, targetId: string): Room {
    const room = this.getRoomBySocketId(kickerId);
    if (!room) {
      throw new Error('Room not found for kicker');
    }

    if (room.hostId !== kickerId) {
      throw new Error('Only the host can kick players');
    }

    if (kickerId === targetId) {
      throw new Error('You cannot kick yourself');
    }

    if (!room.players[targetId]) {
      throw new Error('Target player not found in room');
    }

    // Remove player from room.players
    delete room.players[targetId];
    // Remove player from turnOrder if present
    room.turnOrder = room.turnOrder.filter(id => id !== targetId);
    // Remove from socketToRoom mapping
    this.socketToRoom.delete(targetId);

    // If the kicked player was the current turn, advance turn
    if (room.turnOrder[room.currentTurnIndex] === targetId) {
      // If the kicked player was the last in turn order, reset to 0
      if (room.currentTurnIndex >= room.turnOrder.length) {
        room.currentTurnIndex = 0;
      }
      // Reset turn timeout for the new current player
      this.resetTurnTimeout(room);
    } else if (room.currentTurnIndex > 0 && room.currentTurnIndex >= room.turnOrder.length) {
      // If currentTurnIndex is now out of bounds because a player before it was kicked
      room.currentTurnIndex = 0;
      this.resetTurnTimeout(room);
    }

    // If the room becomes empty, delete it
    if (Object.keys(room.players).length === 0) {
      this.rooms.delete(room.code);
      // Clear any pending timeouts for this room
      const timeoutKey = `room_${room.code}`;
      if (this.turnTimeouts.has(timeoutKey)) {
        clearTimeout(this.turnTimeouts.get(timeoutKey));
        this.turnTimeouts.delete(timeoutKey);
      }
      throw new Error('Room is empty and has been deleted.'); // Or handle this differently
    }

    return room;
  }

  private generateRoomCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  private getRandomElement(): Element {
    const elements = Object.values(Element);
    return elements[Math.floor(Math.random() * elements.length)];
  }

  private shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
