import { MapDefSchema, type MapDef } from "./schema";
import newHorizons3p from "../scenarios/new-horizons/3p-fixed.json" with { type: "json" };
import newHorizons4p from "../scenarios/new-horizons/4p-fixed.json" with { type: "json" };
import fourIsles3p from "../scenarios/four-isles/3p-fixed.json" with { type: "json" };
import fourIsles4p from "../scenarios/four-isles/4p-fixed.json" with { type: "json" };
import acrossTheSands3p from "../scenarios/across-the-sands/3p-fixed.json" with { type: "json" };
import acrossTheSands4p from "../scenarios/across-the-sands/4p-fixed.json" with { type: "json" };
import mistyPassage3p from "../scenarios/misty-passage/3p-fixed.json" with { type: "json" };
import mistyPassage4p from "../scenarios/misty-passage/4p-fixed.json" with { type: "json" };
import mistyPassage3pV from "../scenarios/misty-passage/3p-variable.json" with { type: "json" };
import mistyPassage4pV from "../scenarios/misty-passage/4p-variable.json" with { type: "json" };
import newHorizons3pV from "../scenarios/new-horizons/3p-variable.json" with { type: "json" };
import newHorizons4pV from "../scenarios/new-horizons/4p-variable.json" with { type: "json" };
import fourIsles3pV from "../scenarios/four-isles/3p-variable.json" with { type: "json" };
import fourIsles4pV from "../scenarios/four-isles/4p-variable.json" with { type: "json" };
import acrossTheSands3pV from "../scenarios/across-the-sands/3p-variable.json" with { type: "json" };
import acrossTheSands4pV from "../scenarios/across-the-sands/4p-variable.json" with { type: "json" };
import lostSettlers3p from "../scenarios/lost-settlers/3p-fixed.json" with { type: "json" };
import lostSettlers4p from "../scenarios/lost-settlers/4p-fixed.json" with { type: "json" };
import lostSettlers3pV from "../scenarios/lost-settlers/3p-variable.json" with { type: "json" };
import lostSettlers4pV from "../scenarios/lost-settlers/4p-variable.json" with { type: "json" };
import weaversIsles3p from "../scenarios/weavers-isles/3p-fixed.json" with { type: "json" };
import weaversIsles4p from "../scenarios/weavers-isles/4p-fixed.json" with { type: "json" };
import weaversIsles3pV from "../scenarios/weavers-isles/3p-variable.json" with { type: "json" };
import weaversIsles4pV from "../scenarios/weavers-isles/4p-variable.json" with { type: "json" };

/** Fixed: the rulebook's map. Variable: random within its areas (spec 017). */
export type SetupMode = "fixed" | "variable";
/** The rulebook gives each scenario a 3-player and a 4-player map. */
export type PlayerSize = "3p" | "4p";

/**
 * A seafaring scenario (spec 015): one rule set, several maps. Each map is a normal map JSON in
 * `packages/maps/scenarios/<id>/<size>-<setup>.json`, built by `scenarios/build.ts`.
 */
export interface CatalogScenario {
  id: string;
  /** Rulebook order, for listing. */
  order: number;
  name: string;
  description: string;
  vpToWin: number;
  maps: Partial<Record<`${PlayerSize}-${SetupMode}`, MapDef>>;
}

function scenario(order: number, ...raws: unknown[]): CatalogScenario {
  const defs = raws.map((raw) => MapDefSchema.parse(raw));
  const first = defs[0]!;
  const id = first.id.replace(/-(3p|4p)-(fixed|variable)$/, "");
  const maps: CatalogScenario["maps"] = {};
  for (const def of defs) {
    const variant = def.id.slice(id.length + 1) as keyof CatalogScenario["maps"];
    if (!def.name || !def.description) throw new Error(`Scenario map ${def.id} needs a name`);
    maps[variant] = def;
  }
  return {
    id,
    order,
    name: first.name!,
    description: first.description!,
    vpToWin: first.vpToWin,
    maps,
  };
}

/** Every seafaring scenario, in rulebook order. Ids never change once shipped. */
export const SCENARIO_CATALOG: readonly CatalogScenario[] = [
  scenario(1, newHorizons3p, newHorizons4p, newHorizons3pV, newHorizons4pV),
  scenario(2, fourIsles3p, fourIsles4p, fourIsles3pV, fourIsles4pV),
  scenario(3, mistyPassage3p, mistyPassage4p, mistyPassage3pV, mistyPassage4pV),
  scenario(4, acrossTheSands3p, acrossTheSands4p, acrossTheSands3pV, acrossTheSands4pV),
  scenario(5, lostSettlers3p, lostSettlers4p, lostSettlers3pV, lostSettlers4pV),
  scenario(6, weaversIsles3p, weaversIsles4p, weaversIsles3pV, weaversIsles4pV),
];

export function findScenario(id: string): CatalogScenario | undefined {
  return SCENARIO_CATALOG.find((s) => s.id === id);
}

/** 1–3 seats play the 3-player map; 4 seats the 4-player map. */
export const sizeForSeats = (seats: number): PlayerSize => (seats <= 3 ? "3p" : "4p");

/** The map a lobby with `seats` players gets for a scenario and setup mode, if there is one. */
export function scenarioMap(id: string, seats: number, setup: SetupMode): MapDef | undefined {
  return findScenario(id)?.maps[`${sizeForSeats(seats)}-${setup}`];
}

/** A scenario map by its id (e.g. "new-horizons-4p-fixed"). */
export function findScenarioMap(mapId: string): MapDef | undefined {
  const found = scenarioOfMap(mapId);
  if (!found) return undefined;
  return Object.values(found.scenario.maps).find((m) => m?.id === mapId);
}

/** Which scenario (and setup mode) a scenario map id belongs to. */
export function scenarioOfMap(
  mapId: string,
): { scenario: CatalogScenario; setup: SetupMode } | undefined {
  const m = /^(.*)-(3p|4p)-(fixed|variable)$/.exec(mapId);
  const scenario = m ? findScenario(m[1]!) : undefined;
  return scenario ? { scenario, setup: m![3] as SetupMode } : undefined;
}
