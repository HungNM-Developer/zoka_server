"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameService = void 0;
const common_1 = require("@nestjs/common");
const game_types_1 = require("./game.types");
const uuid_1 = require("uuid");
let GameService = class GameService {
    rooms = new Map();
    socketToRoom = new Map();
    turnTimeouts = new Map();
    onRoomUpdateLink;
    setUpdateCallback(cb) {
        this.onRoomUpdateLink = cb;
    }
    createRoom(hostId, username, maxPlayers = 8) {
        const code = this.generateRoomCode();
        const player = {
            id: hostId,
            username,
            hand: [],
            stars: 55,
            ready: true,
            hasPlayed: false,
        };
        const room = {
            code,
            maxPlayers,
            status: game_types_1.RoomStatus.WAITING,
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
    joinRoom(socketId, username, code) {
        const room = this.rooms.get(code.toUpperCase());
        if (!room)
            throw new Error('Room not found');
        if (room.status !== game_types_1.RoomStatus.WAITING)
            throw new Error('Game already started');
        if (Object.keys(room.players).length >= room.maxPlayers) {
            throw new Error('Room is full');
        }
        const existingPlayerId = Object.keys(room.players).find((id) => room.players[id].username === username);
        if (existingPlayerId) {
            const playerData = room.players[existingPlayerId];
            delete room.players[existingPlayerId];
            room.players[socketId] = { ...playerData, id: socketId };
            this.socketToRoom.delete(existingPlayerId);
            this.socketToRoom.set(socketId, code);
            if (room.hostId === existingPlayerId) {
                room.hostId = socketId;
            }
            if (room.turnOrder) {
                room.turnOrder = room.turnOrder.map(id => id === existingPlayerId ? socketId : id);
            }
        }
        else {
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
    leaveRoom(socketId) {
        const code = this.socketToRoom.get(socketId);
        if (!code)
            return null;
        const room = this.rooms.get(code);
        if (room) {
            delete room.players[socketId];
            this.socketToRoom.delete(socketId);
            if (Object.keys(room.players).length === 0) {
                this.rooms.delete(code);
            }
            else if (room.hostId === socketId) {
                room.hostId = Object.keys(room.players)[0];
            }
        }
        return code;
    }
    toggleReady(socketId, ready) {
        const room = this.getRoomBySocketId(socketId);
        if (!room)
            throw new Error('Room not found');
        room.players[socketId].ready = ready;
        return room;
    }
    startGame(socketId) {
        const room = this.getRoomBySocketId(socketId);
        if (!room)
            throw new Error('Room not found');
        if (room.hostId !== socketId)
            throw new Error('Only host can start');
        const players = Object.values(room.players);
        if (players.length < 4)
            throw new Error('Minimum 4 players required');
        if (players.some(p => !p.ready))
            throw new Error('All players must be ready');
        room.status = game_types_1.RoomStatus.PLAYING;
        room.round = 1;
        players.forEach(player => {
            player.stars = 55;
            player.hand = Array.from({ length: 10 }, (_, i) => ({
                id: (0, uuid_1.v4)(),
                stars: i + 1,
                element: this.getRandomElement(),
            }));
        });
        this.startRound(room);
        return room;
    }
    resetToLobby(socketId) {
        const room = this.getRoomBySocketId(socketId);
        if (!room)
            throw new Error('Room not found');
        if (room.hostId !== socketId)
            throw new Error('Only host can reset');
        if (room.status !== game_types_1.RoomStatus.FINISHED)
            throw new Error('Game not finished');
        room.status = game_types_1.RoomStatus.WAITING;
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
    startRound(room) {
        room.turnOrder = this.shuffle(Object.keys(room.players));
        room.currentTurnIndex = 0;
        Object.values(room.players).forEach(p => {
            p.hasPlayed = false;
            p.playedCard = undefined;
        });
        this.resetTurnTimeout(room);
    }
    resetTurnTimeout(room) {
        const timeoutKey = `room_${room.code}`;
        if (this.turnTimeouts.has(timeoutKey)) {
            clearTimeout(this.turnTimeouts.get(timeoutKey));
        }
        const timeout = setTimeout(() => {
            const roomRef = this.rooms.get(room.code);
            if (!roomRef)
                return;
            const currentPlayerId = room.turnOrder[room.currentTurnIndex];
            const player = room.players[currentPlayerId];
            if (player && player.hand.length > 0) {
                const lowestCardId = [...player.hand].sort((a, b) => a.stars - b.stars)[0].id;
                try {
                    this.playCard(currentPlayerId, lowestCardId);
                    if (this.onRoomUpdateLink) {
                        const updatedRoom = this.rooms.get(room.code);
                        if (updatedRoom) {
                            this.onRoomUpdateLink(updatedRoom, { event: 'CARD_PLAYED', data: { playerId: currentPlayerId } });
                        }
                    }
                }
                catch (e) {
                    console.error('Auto-play failed:', e);
                }
            }
        }, 20000);
        this.turnTimeouts.set(timeoutKey, timeout);
    }
    playCard(socketId, cardId) {
        const room = this.getRoomBySocketId(socketId);
        if (!room)
            throw new Error('Room not found');
        const player = room.players[socketId];
        if (room.turnOrder[room.currentTurnIndex] !== socketId) {
            throw new Error('Not your turn');
        }
        const cardIndex = player.hand.findIndex(c => c.id === cardId);
        if (cardIndex === -1)
            throw new Error('Card not found');
        player.playedCard = player.hand.splice(cardIndex, 1)[0];
        player.hasPlayed = true;
        room.currentTurnIndex++;
        if (room.currentTurnIndex >= room.turnOrder.length) {
            const timeoutKey = `room_${room.code}`;
            clearTimeout(this.turnTimeouts.get(timeoutKey));
            this.turnTimeouts.delete(timeoutKey);
            this.resolveRound(room);
        }
        else {
            this.resetTurnTimeout(room);
        }
        return room;
    }
    resolveRound(room) {
        const players = Object.values(room.players);
        const elementsPresent = [...new Set(players.map(p => p.playedCard.element))];
        const elementTotals = {};
        players.forEach(p => {
            const el = p.playedCard.element;
            elementTotals[el] = (elementTotals[el] || 0) + p.playedCard.stars;
        });
        const playerChanges = {};
        players.forEach(p => playerChanges[p.id] = 0);
        const counterChain = {
            [game_types_1.Element.FIRE]: game_types_1.Element.ICE,
            [game_types_1.Element.ICE]: game_types_1.Element.WIND,
            [game_types_1.Element.WIND]: game_types_1.Element.EARTH,
            [game_types_1.Element.EARTH]: game_types_1.Element.ELECTRIC,
            [game_types_1.Element.ELECTRIC]: game_types_1.Element.WATER,
            [game_types_1.Element.WATER]: game_types_1.Element.FIRE,
        };
        const resolvedPlayerIds = new Set();
        for (const attackerEl of elementsPresent) {
            const defenderEl = counterChain[attackerEl];
            if (elementsPresent.includes(defenderEl)) {
                const attackerTotal = elementTotals[attackerEl];
                const defenderTotal = elementTotals[defenderEl];
                const attackerPlayers = players.filter(p => p.playedCard.element === attackerEl);
                const defenderPlayers = players.filter(p => p.playedCard.element === defenderEl);
                attackerPlayers.forEach(p => resolvedPlayerIds.add(p.id));
                defenderPlayers.forEach(p => resolvedPlayerIds.add(p.id));
                if (defenderTotal > 2 * attackerTotal) {
                    attackerPlayers.forEach(p => playerChanges[p.id] -= p.playedCard.stars);
                    defenderPlayers.forEach(p => playerChanges[p.id] += p.playedCard.stars);
                }
                else if (defenderTotal === 2 * attackerTotal) {
                }
                else {
                    attackerPlayers.forEach(p => playerChanges[p.id] += p.playedCard.stars);
                    defenderPlayers.forEach(p => playerChanges[p.id] -= p.playedCard.stars);
                }
            }
        }
        const remainingPlayers = players.filter(p => !resolvedPlayerIds.has(p.id));
        const remainingElements = [...new Set(remainingPlayers.map(p => p.playedCard.element))];
        if (remainingElements.length > 1) {
            let maxTotal = -1;
            let winnersEls = [];
            remainingElements.forEach(el => {
                const total = elementTotals[el];
                if (total > maxTotal) {
                    maxTotal = total;
                    winnersEls = [el];
                }
                else if (total === maxTotal) {
                    winnersEls.push(el);
                }
            });
            if (winnersEls.length < remainingElements.length) {
                remainingPlayers.forEach(p => {
                    const el = p.playedCard.element;
                    if (winnersEls.includes(el)) {
                        playerChanges[p.id] += p.playedCard.stars;
                    }
                    else {
                        playerChanges[p.id] -= p.playedCard.stars;
                    }
                });
            }
        }
        else if (remainingElements.length === 1 && elementsPresent.length === 1) {
            const allPlayers = players;
            let maxStars = -1;
            allPlayers.forEach(p => {
                if (p.playedCard.stars > maxStars)
                    maxStars = p.playedCard.stars;
            });
            const winners = allPlayers.filter(p => p.playedCard.stars === maxStars);
            if (winners.length < allPlayers.length) {
                allPlayers.forEach(p => {
                    if (p.playedCard.stars === maxStars) {
                        playerChanges[p.id] += p.playedCard.stars;
                    }
                    else {
                        playerChanges[p.id] -= p.playedCard.stars;
                    }
                });
            }
        }
        const roundResult = {
            round: room.round,
            results: players.map(p => {
                p.stars += playerChanges[p.id];
                return {
                    playerId: p.id,
                    cardStars: p.playedCard.stars,
                    cardElement: p.playedCard.element,
                    change: playerChanges[p.id],
                    newTotal: p.stars,
                };
            }),
        };
        room.history.push(roundResult);
        if (room.round >= 10) {
            room.status = game_types_1.RoomStatus.FINISHED;
        }
        else {
            room.round++;
            this.startRound(room);
        }
    }
    getRoomBySocketId(socketId) {
        const code = this.socketToRoom.get(socketId);
        return code ? this.rooms.get(code) : undefined;
    }
    getRoomByCode(code) {
        return this.rooms.get(code.toUpperCase());
    }
    getRoomsList() {
        return Array.from(this.rooms.values()).map(r => ({
            code: r.code,
            status: r.status,
            playerCount: Object.keys(r.players).length,
        }));
    }
    kickPlayer(kickerId, targetId) {
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
        delete room.players[targetId];
        room.turnOrder = room.turnOrder.filter(id => id !== targetId);
        this.socketToRoom.delete(targetId);
        if (room.turnOrder[room.currentTurnIndex] === targetId) {
            if (room.currentTurnIndex >= room.turnOrder.length) {
                room.currentTurnIndex = 0;
            }
            this.resetTurnTimeout(room);
        }
        else if (room.currentTurnIndex > 0 && room.currentTurnIndex >= room.turnOrder.length) {
            room.currentTurnIndex = 0;
            this.resetTurnTimeout(room);
        }
        if (Object.keys(room.players).length === 0) {
            this.rooms.delete(room.code);
            const timeoutKey = `room_${room.code}`;
            if (this.turnTimeouts.has(timeoutKey)) {
                clearTimeout(this.turnTimeouts.get(timeoutKey));
                this.turnTimeouts.delete(timeoutKey);
            }
            throw new Error('Room is empty and has been deleted.');
        }
        return room;
    }
    generateRoomCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }
    getRandomElement() {
        const elements = Object.values(game_types_1.Element);
        return elements[Math.floor(Math.random() * elements.length)];
    }
    shuffle(array) {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
};
exports.GameService = GameService;
exports.GameService = GameService = __decorate([
    (0, common_1.Injectable)()
], GameService);
//# sourceMappingURL=game.service.js.map