export enum Element {
  FIRE = 'Fire',
  ICE = 'Ice',
  WIND = 'Wind',
  EARTH = 'Earth',
  ELECTRIC = 'Electric',
  WATER = 'Water',
}

export const COUNTER_CHAIN = {
  [Element.FIRE]: Element.ICE,
  [Element.ICE]: Element.WIND,
  [Element.WIND]: Element.EARTH,
  [Element.EARTH]: Element.ELECTRIC,
  [Element.ELECTRIC]: Element.WATER,
  [Element.WATER]: Element.FIRE,
};

export interface Card {
  stars: number;
  element: Element;
  id: string;
}

export interface Player {
  id: string; // Socket ID
  username: string;
  hand: Card[];
  stars: number; // Current match stars
  ready: boolean;
  playedCard?: Card;
  hasPlayed: boolean;
}

export enum RoomStatus {
  WAITING = 'WAITING',
  PLAYING = 'PLAYING',
  FINISHED = 'FINISHED',
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
  players: Record<string, Player>; // Map by socket ID
  hostId: string;
  round: number;
  turnOrder: string[]; // Array of socket IDs
  currentTurnIndex: number;
  history: RoundResult[];
}
