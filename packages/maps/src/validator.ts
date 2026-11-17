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

  errors.push(...checkPools(def));
  errors.push(...checkScenario(def));

  return { ok: errors.length === 0, errors };
}

const poolOf = (v: unknown): string | undefined =>
  typeof v === "string" && v.startsWith("pool:") ? v.slice("pool:".length) : undefined;
const total = (counts: Record<string, number | undefined>) =>
  Object.values(counts).reduce((a: number, b) => a + (b ?? 0), 0);

/**
 * Every named pool holds exactly as many items as the hexes (or ports) that draw from it, and
 * every pool a hex names exists (spec 017). A desert never takes a token, whether fixed on the map
 * or drawn from a terrain pool; so a terrain pool's deserts are taken off the token pool its hexes
 * draw from, which must then be a single token pool.
 */
function checkPools(def: MapDef): ValidationError[] {
  const errors: ValidationError[] = [];
  const pools = def.pools ?? {};

  for (const name of new Set(def.hexes.flatMap((h) => poolOf(h.terrain) ?? []))) {
    const slots = def.hexes.filter((h) => poolOf(h.terrain) === name).length;
    const pool = pools.terrain?.[name];
    if (!pool) errors.push(err("POOL_MISSING", `No terrain pool "${name}"`));
    else if (total(pool) !== slots)
      errors.push(
        err("POOL_SIZE", `Terrain pool ${name} has ${total(pool)} tiles but ${slots} hexes use it`),
      );
  }

  const needed = new Map<string, number>();
  for (const h of def.hexes) {
    const name = poolOf(h.token);
    if (!name || h.terrain === "desert") continue;
    needed.set(name, (needed.get(name) ?? 0) + 1);
  }
  for (const [terrainPool, counts] of Object.entries(pools.terrain ?? {})) {
    const deserts = counts.desert ?? 0;
    if (deserts === 0) continue;
    const tokenPools = new Set(
      def.hexes.filter((h) => poolOf(h.terrain) === terrainPool).map((h) => poolOf(h.token)),
    );
    if (tokenPools.size > 1) {
      errors.push(
        err("POOL_MIXED", `Hexes of terrain pool ${terrainPool} draw from several token pools`),
      );
      continue;
    }
    const [tokenPool] = [...tokenPools];
    if (tokenPool) needed.set(tokenPool, (needed.get(tokenPool) ?? 0) - deserts);
  }
  for (const [name, need] of needed) {
    const pool = pools.tokens?.[name];
    if (!pool) errors.push(err("POOL_MISSING", `No token pool "${name}"`));
    else if (pool.length !== need)
      errors.push(
        err("POOL_SIZE", `Token pool ${name} has ${pool.length} tokens but the map needs ${need}`),
      );
  }

  for (const name of new Set((def.ports ?? []).flatMap((p) => poolOf(p.type) ?? []))) {
    const slots = (def.ports ?? []).filter((p) => poolOf(p.type) === name).length;
    const pool = pools.ports?.[name];
    if (!pool) errors.push(err("POOL_MISSING", `No port pool "${name}"`));
    else if (total(pool) !== slots)
      errors.push(
        err("POOL_SIZE", `Port pool ${name} has ${total(pool)} ports but ${slots} ports use it`),
      );
  }
  return errors;
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
  const fogHexes = def.hexes.filter((h) => h.terrain === "fog").length;
  if (fogHexes > 0 && !def.modules.includes("seafaring"))
    errors.push(err("FOG", "Fog hexes need the seafaring module"));
  const s = def.scenario;
  if (!s) {
    if (fogHexes > 0) errors.push(err("FOG", "Fog hexes need a scenario.fog stack"));
    return errors;
  }
  if (fogHexes > 0 || s.fog) {
    const stack = Object.values(s.fog?.terrain ?? {}).reduce((a, b) => a + b, 0);
    if (stack !== fogHexes)
      errors.push(
        err("FOG", `The fog stack has ${stack} hexes but the map has ${fogHexes} fog hexes`),
      );
    const land = Object.entries(s.fog?.terrain ?? {})
      .filter(([t]) => t !== "sea" && t !== "desert")
      .reduce((a, [, n]) => a + n, 0);
    if ((s.fog?.tokens.length ?? 0) !== land)
      errors.push(
        err(
          "FOG",
          `The fog stack has ${land} producing hexes but ${s.fog?.tokens.length ?? 0} tokens`,
        ),
      );
  }
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
