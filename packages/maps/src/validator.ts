import { buildGraph, hexKey, type Hex } from "@settlers/engine";
import { type MapDef, type ResolvedMap, MapDefSchema } from "./schema";

export interface ValidationError {
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

function err(code: string, message: string): ValidationError {
  return { code, message };
}

/** Validate a raw MapDef (pre-generation). Checks schema and pool accounting. */
export function validateMapDef(def: MapDef): ValidationResult {
  const errors: ValidationError[] = [];

  const parsed = MapDefSchema.safeParse(def);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(err("SCHEMA", issue.message));
    }
    return { ok: false, errors };
  }

  // Pool size checks
  const poolLandCount = def.hexes.filter((h) => String(h.terrain) === "pool:land").length;
  if (poolLandCount > 0 && def.pools?.land) {
    const poolSize = Object.values(def.pools.land).reduce((a: number, b) => a + (b ?? 0), 0);
    if (poolSize !== poolLandCount) {
      errors.push(
        err(
          "POOL_SIZE",
          `pools.land has ${poolSize} tiles but map has ${poolLandCount} pool:land hexes`,
        ),
      );
    }
  }

  // A desert never gets a token, whether it is fixed on the map or drawn from the land pool.
  const tokenSlots = def.hexes.filter((h) => h.token === "pool:tokens");
  const fixedDeserts = tokenSlots.filter((h) => h.terrain === "desert").length;
  const poolDeserts = tokenSlots.some((h) => h.terrain === "pool:land")
    ? (def.pools?.land?.desert ?? 0)
    : 0;
  const poolTokenCount = tokenSlots.length - fixedDeserts - poolDeserts;
  if (poolTokenCount > 0 && def.pools?.tokens) {
    if (def.pools.tokens.length !== poolTokenCount) {
      errors.push(
        err(
          "POOL_SIZE",
          `pools.tokens has ${def.pools.tokens.length} tokens but map needs ${poolTokenCount}`,
        ),
      );
    }
  }

  errors.push(...checkScenario(def));

  const poolPortCount = (def.ports ?? []).filter((p) => p.type === "pool:ports").length;
  if (poolPortCount > 0 && def.pools?.ports) {
    const portPoolSize = Object.values(def.pools.ports).reduce((a: number, b) => a + (b ?? 0), 0);
    if (portPoolSize !== poolPortCount) {
      errors.push(
        err(
          "POOL_SIZE",
          `pools.ports has ${portPoolSize} ports but map has ${poolPortCount} pool:ports port entries`,
        ),
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

const isHexKey = (s: string) => /^-?\d+,-?\d+$/.test(s);

/**
 * Seafaring scenario data: only with the seafaring module; every region it names exists; the
 * pirate starts on a sea hex; a robber start given as a hex is a listed land hex.
 */
function checkScenario(def: MapDef): ValidationError[] {
  const errors: ValidationError[] = [];
  const at = new Map(def.hexes.map((h) => [`${h.q},${h.r}`, h]));
  if (def.robberStart !== undefined && isHexKey(def.robberStart)) {
    const hex = at.get(def.robberStart);
    if (!hex || hex.terrain === "sea")
      errors.push(err("ROBBER_START", `Robber start ${def.robberStart} is not a land hex`));
  }
  const usesRegions = def.hexes.some((h) => h.region !== undefined);
  if ((def.scenario || usesRegions) && !def.modules.includes("seafaring")) {
    errors.push(err("SCENARIO", "Scenario settings and regions need the seafaring module"));
  }
  const s = def.scenario;
  if (!s) return errors;
  const regions = new Set(def.hexes.flatMap((h) => (h.region ? [h.region] : [])));
  const named = [...(s.setupRegions ?? []), ...(typeof s.home === "object" ? s.home.regions : [])];
  for (const r of named) {
    if (!regions.has(r)) errors.push(err("UNKNOWN_REGION", `No hex is in region "${r}"`));
  }
  if (
    s.pirateStart !== undefined &&
    s.pirateStart !== "frame" &&
    at.get(s.pirateStart)?.terrain !== "sea"
  ) {
    errors.push(err("PIRATE_START", `Pirate start ${s.pirateStart} is not a sea hex`));
  }
  return errors;
}

/** Validate a fully resolved map. Checks land connectivity and port placement. */
export function validateResolvedMap(map: ResolvedMap): ValidationResult {
  const errors: ValidationError[] = [];

  const landHexes = map.hexes.filter((h) => h.terrain !== "sea");

  if (landHexes.length === 0) {
    errors.push(err("NO_LAND", "Map has no land hexes"));
    return { ok: false, errors };
  }

  // --- Land connectivity: BFS from first land hex ---
  const landSet = new Set(landHexes.map(hexKey));
  const DIRECTIONS: Hex[] = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ];
  const visited = new Set<string>();
  const queue: Hex[] = [landHexes[0]!];
  while (queue.length > 0) {
    const h = queue.shift()!;
    const hk = hexKey(h);
    if (visited.has(hk)) continue;
    visited.add(hk);
    for (const d of DIRECTIONS) {
      const nk = hexKey({ q: h.q + d.q, r: h.r + d.r });
      if (landSet.has(nk) && !visited.has(nk)) {
        queue.push({ q: h.q + d.q, r: h.r + d.r });
      }
    }
  }
  // Seafaring maps may have several islands (ships connect them).
  if (visited.size !== landHexes.length && !map.modules.includes("seafaring")) {
    errors.push(
      err(
        "DISCONNECTED",
        `Land is not fully connected: only ${visited.size}/${landHexes.length} hexes reachable`,
      ),
    );
  }

  // --- Ports must sit on coastal edges ---
  const graph = buildGraph(landHexes);
  for (const port of map.ports) {
    if (!graph.edges.has(port.edgeId)) {
      errors.push(
        err("PORT_NOT_COASTAL", `Port edge ${port.edgeId} is not in the land graph (not coastal)`),
      );
    }
  }

  return { ok: errors.length === 0, errors };
}
