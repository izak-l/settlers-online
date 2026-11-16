import type { Resources } from "../../types";

export const SHIP_COST: Resources = { wood: 1, sheep: 1 };
export const SHIP_LIMIT = 15;

/** Terrains ships can sail on. Fog counts as water until it's revealed (spec 016). */
export const WATER = new Set(["sea", "fog"]);
