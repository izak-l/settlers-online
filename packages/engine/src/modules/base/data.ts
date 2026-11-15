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
};
