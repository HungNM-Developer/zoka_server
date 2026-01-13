export declare enum Element {
    FIRE = "Fire",
    ICE = "Ice",
    WIND = "Wind",
    EARTH = "Earth",
    ELECTRIC = "Electric",
    WATER = "Water"
}
export declare const COUNTER_CHAIN: {
    Fire: Element;
    Ice: Element;
    Wind: Element;
    Earth: Element;
    Electric: Element;
    Water: Element;
};
export interface Card {
    stars: number;
    element: Element;
    id: string;
}
export interface Player {
    id: string;
    username: string;
    hand: Card[];
    stars: number;
    ready: boolean;
    playedCard?: Card;
    hasPlayed: boolean;
    connected?: boolean;
}
export declare enum RoomStatus {
    WAITING = "WAITING",
    PLAYING = "PLAYING",
    FINISHED = "FINISHED"
}
export interface RoundResult {
    round: number;
    results: {
        playerId: string;
        cardStars: number;
        cardElement: Element;
        change: number;
        newTotal: number;
    }[];
}
export interface Room {
    code: string;
    maxPlayers: number;
    status: RoomStatus;
    players: Record<string, Player>;
    hostId: string;
    round: number;
    turnOrder: string[];
    currentTurnIndex: number;
    history: RoundResult[];
}
