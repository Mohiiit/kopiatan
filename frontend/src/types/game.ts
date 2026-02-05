// Type definitions matching Rust structures

export type PlayerId = number;

export interface HexCoord {
  q: number;
  r: number;
}

export interface VertexCoord {
  hex: HexCoord;
  direction: "North" | "South";
}

export interface EdgeCoord {
  hex: HexCoord;
  direction: "NorthEast" | "East" | "SouthEast" | "SouthWest" | "West" | "NorthWest";
}

export type Resource = "Brick" | "Lumber" | "Ore" | "Grain" | "Wool";

export type TileType =
  | { Resource: Resource }
  | "Desert"
  | "Ocean";

export interface Tile {
  coord: HexCoord;
  tile_type: TileType;
  dice_number: number | null;
  has_robber: boolean;
  label: string | null;
}

export type VertexBuilding =
  | "Empty"
  | { Settlement: PlayerId }
  | { City: PlayerId };

export type EdgeBuilding =
  | "Empty"
  | { Road: PlayerId };

export interface Harbor {
  edge: EdgeCoord;
  harbor_type: "Generic" | { Specific: Resource };
}

export interface ResourceHand {
  brick: number;
  lumber: number;
  ore: number;
  grain: number;
  wool: number;
}

export interface Player {
  id: PlayerId;
  name: string;
  color: "Red" | "Blue" | "Orange" | "White";
  resources: ResourceHand;
  dev_cards: DevelopmentCard[];
  dev_cards_bought_this_turn: DevelopmentCard[];
  played_knights: number;
  has_longest_road: boolean;
  has_largest_army: boolean;
  settlements_remaining: number;
  cities_remaining: number;
  roads_remaining: number;
}

export type DevelopmentCard =
  | "Knight"
  | "VictoryPoint"
  | "RoadBuilding"
  | "YearOfPlenty"
  | "Monopoly";

export type GamePhase =
  | { Setup: { round: number; placing: "Settlement" | "Road" } }
  | "PreRoll"
  | "RobberMoveRequired"
  | { RobberSteal: { target_hex: HexCoord; victims: PlayerId[] } }
  | { DiscardRequired: { players_remaining: PlayerId[] } }
  | "MainPhase"
  | { RoadBuildingInProgress: { roads_remaining: number } }
  | { Finished: { winner: PlayerId } };

export type GameAction =
  | { PlaceInitialSettlement: VertexCoord }
  | { PlaceInitialRoad: EdgeCoord }
  | "RollDice"
  | { MoveRobber: HexCoord }
  | { StealFrom: PlayerId }
  | { DiscardCards: ResourceHand }
  | { BuildRoad: EdgeCoord }
  | { BuildSettlement: VertexCoord }
  | { BuildCity: VertexCoord }
  | "BuyDevelopmentCard"
  | "PlayKnight"
  | { PlayRoadBuilding: [EdgeCoord, EdgeCoord] }
  | { PlayYearOfPlenty: [Resource, Resource] }
  | { PlayMonopoly: Resource }
  | { ProposeTrade: TradeOffer }
  | "AcceptTrade"
  | "RejectTrade"
  | { CounterTrade: TradeOffer }
  | "CancelTrade"
  | { MaritimeTrade: { give: Resource; give_count: number; receive: Resource } }
  | "EndTurn";

export interface TradeOffer {
  from: PlayerId;
  to: PlayerId | null;
  offering: ResourceHand;
  requesting: ResourceHand;
}

// Helper to get resource color
export function getResourceColor(resource: Resource): number {
  const colors: Record<Resource, number> = {
    Brick: 0xc9302c,
    Lumber: 0x228b22,
    Ore: 0x708090,
    Grain: 0xffd700,
    Wool: 0x98fb98,
  };
  return colors[resource];
}

// Helper to get resource Singapore name
export function getResourceSingaporeName(resource: Resource): string {
  const names: Record<Resource, string> = {
    Brick: "HDB Estate",
    Lumber: "Botanic Gardens",
    Ore: "Jurong Industrial",
    Grain: "Hawker Center",
    Wool: "Sentosa Resort",
  };
  return names[resource];
}

// Helper to get tile color
export function getTileColor(tileType: TileType): number {
  if (tileType === "Desert") return 0xf4a460;
  if (tileType === "Ocean") return 0x1e90ff;
  if (typeof tileType === "object" && "Resource" in tileType) {
    return getResourceColor(tileType.Resource);
  }
  return 0xffffff;
}

// Helper to get player color
export function getPlayerColor(color: Player["color"]): number {
  const colors: Record<Player["color"], number> = {
    Red: 0xe74c3c,
    Blue: 0x3498db,
    Orange: 0xe67e22,
    White: 0xecf0f1,
  };
  return colors[color];
}
