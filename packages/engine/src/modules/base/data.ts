import type { Resources } from "../../types";

export const BASE_RESOURCES = ["wood", "brick", "sheep", "wheat", "ore"] as const;
export const BANK_START = 19;

export const TERRAIN_RESOURCE: Record<string, string> = {
  forest: "wood",
  hills: "brick",
  pasture: "sheep",
  fields: "wheat",
  mountains: "ore",
};

export const PIECE_LIMITS: Record<string, number> = { road: 15, settlement: 5, city: 4 };

export const COSTS: Record<string, Resources> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  devCard: { sheep: 1, wheat: 1, ore: 1 },
};

export const DEV_DECK: Record<string, number> = {
  knight: 14,
  victoryPoint: 5,
  roadBuilding: 2,
  yearOfPlenty: 2,
  monopoly: 2,
};

/** Display names are our own wording; the ids above are internal. */
export const DEV_CARD_NAMES: Record<string, string> = {
  knight: "Knight",
  victoryPoint: "Victory Point",
  roadBuilding: "Road Crew",
  yearOfPlenty: "Bounty",
  monopoly: "Monopoly",
};
