import { MapDefSchema, type MapDef } from "./schema";
import { findScenarioMap, scenarioOfMap } from "./scenarios";
import baseRaw from "../maps/base-4p.json" with { type: "json" };
import grandDiamondRaw from "../maps/grand-diamond.json" with { type: "json" };

/** A built-in map: a JSON file in `packages/maps/maps/`, checked in CI. */
export interface CatalogMap {
  id: string;
  name: string;
  description: string;
  def: MapDef;
}

function entry(raw: unknown): CatalogMap {
  const def = MapDefSchema.parse(raw);
  if (!def.name || !def.description) throw new Error(`Map ${def.id} needs a name and description`);
  return { id: def.id, name: def.name, description: def.description, def };
}

/**
 * Every built-in map, default first. To add one, put its JSON file in `maps/` and import it
 * here; `catalog.test.ts` fails if a file is missing from this list. Ids never change once
 * shipped.
 */
export const MAP_CATALOG: readonly CatalogMap[] = [entry(baseRaw), entry(grandDiamondRaw)];

export const DEFAULT_MAP_ID = "base-4p";

export function findMap(id: string): CatalogMap | undefined {
  return MAP_CATALOG.find((m) => m.id === id);
}

/** Any built-in map by id: a catalog map or a seafaring scenario's map. */
export function findAnyMap(id: string): MapDef | undefined {
  return findMap(id)?.def ?? findScenarioMap(id);
}

/** Built-in maps whose player range includes `seats`. */
export function mapsForSeats(seats: number): CatalogMap[] {
  return MAP_CATALOG.filter((m) => seats >= m.def.players.min && seats <= m.def.players.max);
}

/**
 * A built-in map's display name (a scenario map shows its scenario's name), or the id itself for
 * a map no longer in the catalog.
 */
export function mapName(id: string): string {
  return findMap(id)?.name ?? scenarioOfMap(id)?.scenario.name ?? id;
}

/** The default map's definition (the random base board). */
export const DEFAULT_MAP_DEF: MapDef = findMap(DEFAULT_MAP_ID)!.def;
