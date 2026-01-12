import { Room, RoomStatus } from './game.types';
export declare class GameService {
    private rooms;
    private socketToRoom;
    private turnTimeouts;
    private onRoomUpdateLink;
    setUpdateCallback(cb: (room: Room, extra?: {
        event: string;
        data?: any;
    }) => void): void;
    createRoom(hostId: string, username: string, maxPlayers?: number): Room;
    joinRoom(socketId: string, username: string, code: string): Room;
    leaveRoom(socketId: string): string | null;
    toggleReady(socketId: string, ready: boolean): Room;
    startGame(socketId: string): Room;
    resetToLobby(socketId: string): Room;
    startRound(room: Room): void;
    private resetTurnTimeout;
    playCard(socketId: string, cardId: string): Room;
    private resolveRound;
    getRoomBySocketId(socketId: string): Room | undefined;
    getRoomByCode(code: string): Room | undefined;
    getRoomsList(): {
        code: string;
        status: RoomStatus;
        playerCount: number;
    }[];
    kickPlayer(kickerId: string, targetId: string): Room;
    private generateRoomCode;
    private getRandomElement;
    private shuffle;
}
