import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { GameService } from './game.service';
import { Room, RoomStatus } from './game.types';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  server: Server;

  constructor(private readonly gameService: GameService) {}

  onModuleInit() {
    this.gameService.setUpdateCallback((room, extra) => {
      this.broadcastRoomUpdate(room);
      if (extra?.event === 'CARD_PLAYED') {
        this.server.to(room.code).emit('CARD_PLAYED', extra.data);
      }
    });
  }

  private broadcastRoomUpdate(room: Room) {
    this.server.to(room.code).emit('ROOM_UPDATED', room);
    
    // If game just started (First round, first turn)
    if (room.status === RoomStatus.PLAYING && room.round === 1 && room.history.length === 0 && room.currentTurnIndex === 0) {
      this.server.to(room.code).emit('GAME_STARTED', room);
      this.server.to(room.code).emit('ROUND_STARTED', room);
    }
    // If round just rolled over (Next rounds)
    else if (room.currentTurnIndex === 0 && room.history.length > 0) {
      const lastResult = room.history[room.history.length - 1];
      this.server.to(room.code).emit('ROUND_RESULT', lastResult);
      
      if (room.status === RoomStatus.FINISHED) {
        this.server.to(room.code).emit('GAME_ENDED', room);
      } else {
        this.server.to(room.code).emit('ROUND_STARTED', room);
      }
    }
  }

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    const code = this.gameService.leaveRoom(client.id);
    if (code) {
      this.server.to(code).emit('ROOM_UPDATED', this.gameService.getRoomByCode(code));
      this.broadcastRoomList();
    }
  }

  @SubscribeMessage('ENTER_USERNAME')
  handleEnterUsername(@ConnectedSocket() client: Socket, @MessageBody() data: { username: string }) {
    // Just acknowledge or store locally if needed. For now, we use it when joining/creating rooms.
    return { success: true };
  }

  @SubscribeMessage('GET_ROOMS')
  handleGetRooms() {
    return this.gameService.getRoomsList();
  }

  @SubscribeMessage('CREATE_ROOM')
  handleCreateRoom(@ConnectedSocket() client: Socket, @MessageBody() data: { username: string; maxPlayers: number }) {
    const room = this.gameService.createRoom(client.id, data.username, data.maxPlayers);
    client.join(room.code);
    this.broadcastRoomList();
    return room;
  }

  @SubscribeMessage('JOIN_ROOM')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { username: string; code: string },
  ) {
    try {
      const room = this.gameService.joinRoom(client.id, data.username, data.code);
      client.join(room.code);
      this.server.to(room.code).emit('ROOM_UPDATED', room);
      this.broadcastRoomList();
      return room;
    } catch (error) {
      return { error: error.message };
    }
  }

  @SubscribeMessage('READY')
  handleReady(@ConnectedSocket() client: Socket, @MessageBody() data: { ready: boolean }) {
    try {
      const room = this.gameService.toggleReady(client.id, data.ready);
      this.broadcastRoomUpdate(room);
    } catch (error) {
      return { error: error.message };
    }
  }

  @SubscribeMessage('START_GAME')
  handleStartGame(@ConnectedSocket() client: Socket) {
    try {
      const room = this.gameService.startGame(client.id);
      this.broadcastRoomUpdate(room);
    } catch (error) {
      return { error: error.message };
    }
  }

  @SubscribeMessage('PLAY_CARD')
  handlePlayCard(@ConnectedSocket() client: Socket, @MessageBody() data: { cardId: string }) {
    try {
      const room = this.gameService.playCard(client.id, data.cardId);
      this.broadcastRoomUpdate(room);
      this.server.to(room.code).emit('CARD_PLAYED', { playerId: client.id });
    } catch (error) {
      return { error: error.message };
    }
  }

  @SubscribeMessage('LEAVE_ROOM')
  handleLeaveRoom(@ConnectedSocket() client: Socket) {
    const code = this.gameService.leaveRoom(client.id);
    if (code) {
      client.leave(code);
      this.broadcastRoomList();
      this.server.to(code).emit('ROOM_UPDATED', this.gameService.getRoomByCode(code));
    }
  }

  @SubscribeMessage('KICK_PLAYER')
  handleKickPlayer(@ConnectedSocket() client: Socket, @MessageBody() data: { targetId: string }) {
    try {
      const room = this.gameService.kickPlayer(client.id, data.targetId);
      this.server.to(data.targetId).emit('KICKED');
      this.broadcastRoomUpdate(room);
    } catch (error) {
      return { error: error.message };
    }
  }

  @SubscribeMessage('BACK_TO_LOBBY')
  handleBackToLobby(@ConnectedSocket() client: Socket) {
    try {
      const room = this.gameService.resetToLobby(client.id);
      this.broadcastRoomUpdate(room);
    } catch (error) {
      return { error: error.message };
    }
  }

  private broadcastRoomList() {
    this.server.emit('ROOM_LIST', this.gameService.getRoomsList());
  }
}
