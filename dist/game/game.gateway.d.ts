import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { OnModuleInit } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { GameService } from './game.service';
import { Room, RoomStatus } from './game.types';
export declare class GameGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
    private readonly gameService;
    server: Server;
    constructor(gameService: GameService);
    onModuleInit(): void;
    private broadcastRoomUpdate;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handleEnterUsername(client: Socket, data: {
        username: string;
    }): {
        success: boolean;
    };
    handleGetRooms(): {
        code: string;
        status: RoomStatus;
        playerCount: number;
    }[];
    handleCreateRoom(client: Socket, data: {
        username: string;
        maxPlayers: number;
    }): Room;
    handleJoinRoom(client: Socket, data: {
        username: string;
        code: string;
    }): Room | {
        error: any;
    };
    handleReady(client: Socket, data: {
        ready: boolean;
    }): {
        error: any;
    } | undefined;
    handleStartGame(client: Socket): {
        error: any;
    } | undefined;
    handlePlayCard(client: Socket, data: {
        cardId: string;
    }): {
        error: any;
    } | undefined;
    handleLeaveRoom(client: Socket): void;
    handleKickPlayer(client: Socket, data: {
        targetId: string;
    }): {
        error: any;
    } | undefined;
    handleBackToLobby(client: Socket): {
        error: any;
    } | undefined;
    private broadcastRoomList;
}
