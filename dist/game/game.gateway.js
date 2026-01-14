"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const game_service_1 = require("./game.service");
const game_types_1 = require("./game.types");
let GameGateway = class GameGateway {
    gameService;
    server;
    constructor(gameService) {
        this.gameService = gameService;
    }
    onModuleInit() {
        this.gameService.setUpdateCallback((room, extra) => {
            this.broadcastRoomUpdate(room);
            if (extra?.event === 'CARD_PLAYED') {
                this.server.to(room.code).emit('CARD_PLAYED', extra.data);
            }
        });
    }
    broadcastRoomUpdate(room) {
        this.server.to(room.code).emit('ROOM_UPDATED', room);
        if (room.status === game_types_1.RoomStatus.PLAYING &&
            room.round === 1 &&
            room.history.length === 0 &&
            room.currentTurnIndex === 0) {
            this.server.to(room.code).emit('GAME_STARTED', room);
            this.server.to(room.code).emit('ROUND_STARTED', room);
        }
        else if (room.currentTurnIndex === 0 && room.history.length > 0) {
            const lastResult = room.history[room.history.length - 1];
            this.server.to(room.code).emit('ROUND_RESULT', lastResult);
            if (room.status === game_types_1.RoomStatus.FINISHED) {
                this.server.to(room.code).emit('GAME_ENDED', room);
            }
            else {
                this.server.to(room.code).emit('ROUND_STARTED', room);
            }
        }
    }
    handleConnection(client) {
        console.log(`Client connected: ${client.id}`);
    }
    handleDisconnect(client) {
        console.log(`Client disconnected: ${client.id}`);
        const code = this.gameService.markDisconnected(client.id);
        if (code) {
            this.server
                .to(code)
                .emit('ROOM_UPDATED', this.gameService.getRoomByCode(code));
            this.broadcastRoomList();
        }
    }
    handleEnterUsername(client, data) {
        return { success: true };
    }
    handleGetRooms() {
        return this.gameService.getRoomsList();
    }
    handleCreateRoom(client, data) {
        const room = this.gameService.createRoom(client.id, data.username, data.maxPlayers);
        client.join(room.code);
        this.broadcastRoomList();
        return room;
    }
    handleJoinRoom(client, data) {
        try {
            const room = this.gameService.joinRoom(client.id, data.username, data.code);
            client.join(room.code);
            this.server.to(room.code).emit('ROOM_UPDATED', room);
            this.broadcastRoomList();
            return room;
        }
        catch (error) {
            return { error: error.message };
        }
    }
    handleReady(client, data) {
        try {
            const room = this.gameService.toggleReady(client.id, data.ready);
            this.broadcastRoomUpdate(room);
        }
        catch (error) {
            return { error: error.message };
        }
    }
    handleStartGame(client) {
        try {
            const room = this.gameService.startGame(client.id);
            this.broadcastRoomUpdate(room);
        }
        catch (error) {
            return { error: error.message };
        }
    }
    handlePlayCard(client, data) {
        try {
            const room = this.gameService.playCard(client.id, data.cardId);
            this.broadcastRoomUpdate(room);
            this.server.to(room.code).emit('CARD_PLAYED', { playerId: client.id });
        }
        catch (error) {
            return { error: error.message };
        }
    }
    handleLeaveRoom(client) {
        const code = this.gameService.leaveRoom(client.id);
        if (code) {
            client.leave(code);
            this.broadcastRoomList();
            this.server
                .to(code)
                .emit('ROOM_UPDATED', this.gameService.getRoomByCode(code));
        }
    }
    handleKickPlayer(client, data) {
        try {
            const room = this.gameService.kickPlayer(client.id, data.targetId);
            this.server.to(data.targetId).emit('KICKED');
            this.broadcastRoomUpdate(room);
        }
        catch (error) {
            return { error: error.message };
        }
    }
    handleBackToLobby(client) {
        try {
            const room = this.gameService.resetToLobby(client.id);
            this.broadcastRoomUpdate(room);
        }
        catch (error) {
            return { error: error.message };
        }
    }
    broadcastRoomList() {
        this.server.emit('ROOM_LIST', this.gameService.getRoomsList());
    }
};
exports.GameGateway = GameGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], GameGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('ENTER_USERNAME'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], GameGateway.prototype, "handleEnterUsername", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('GET_ROOMS'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], GameGateway.prototype, "handleGetRooms", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('CREATE_ROOM'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], GameGateway.prototype, "handleCreateRoom", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('JOIN_ROOM'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], GameGateway.prototype, "handleJoinRoom", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('READY'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], GameGateway.prototype, "handleReady", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('START_GAME'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], GameGateway.prototype, "handleStartGame", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('PLAY_CARD'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], GameGateway.prototype, "handlePlayCard", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('LEAVE_ROOM'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], GameGateway.prototype, "handleLeaveRoom", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('KICK_PLAYER'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], GameGateway.prototype, "handleKickPlayer", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('BACK_TO_LOBBY'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], GameGateway.prototype, "handleBackToLobby", null);
exports.GameGateway = GameGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: { origin: '*' },
    }),
    __metadata("design:paramtypes", [game_service_1.GameService])
], GameGateway);
//# sourceMappingURL=game.gateway.js.map