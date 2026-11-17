import {
  type RngState,
  shuffle,
  nextInt,
  buildGraph,
  edgeId,
  hexKey,
  type Hex,
} from "@settlers/engine";
import {
  type Constraint,
  type MapDef,
  type ResolvedHex,
  type ResolvedMarker,
  type ResolvedMap,
  type TerrainType,
  type ResolvedPort,
} from "./schema";

const RED_TOKENS = new Set([6, 8]);
const MAX_RETRIES = 1000;

const DIRECTIONS: Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

function expandPool<T extends string>(pool: Partial<Record<T, number>>): T[] {
  const result: T[] = [];
  for (const [key, count] of Object.entries(pool) as [T, number][]) {
    for (let i = 0; i < count; i++) result.push(key);
  }
  return result;
}

function hasRedTokenViolation(hexes: ResolvedHex[], graph: ReturnType<typeof buildGraph>): boolean {
  for (const e of graph.edges.values()) {
    if (e.hexes.length < 2) continue;
    const h0 = hexes.find((h) => hexKey(h) === e.hexes[0]);
    const h1 = hexes.find((h) => hexKey(h) === e.hexes[1]);
    if (
      h0?.token !== undefined &&
      h1?.token !== undefined &&
      RED_TOKENS.has(h0.token) &&
      RED_TOKENS.has(h1.token)
    ) {
      return true;
    }
  }
  return false;
}

/** Coastal edges sorted by angle around the board's centre, so neighbours in the list are neighbours on the coast. */
function coastalEdgesAroundBoard(landHexes: ResolvedHex[]): string[] {
  const px = (q: number, r: number) => Math.sqrt(3) * (q + r / 2);
  const py = (_q: number, r: number) => 1.5 * r;
  const cx = landHexes.reduce((a, h) => a + px(h.q, h.r), 0) / landHexes.length;
  const cy = landHexes.reduce((a, h) => a + py(h.q, h.r), 0) / landHexes.length;
  const angle = (eid: string) => {
    const hexes = eid.split("|").map((k) => k.split(",").map(Number) as [number, number]);
    const mx = hexes.reduce((a, [q, r]) => a + px(q, r), 0) / 2;
    const my = hexes.reduce((a, [q, r]) => a + py(q, r), 0) / 2;
    return Math.atan2(my - cy, mx - cx);
  };
  return coastalEdgeIds(landHexes)
    .map((eid) => ({ eid, a: angle(eid) }))
    .sort((x, y) => x.a - y.a || (x.eid < y.eid ? -1 : 1))
    .map((x) => x.eid);
}

function coastalEdgeIds(landHexes: ResolvedHex[]): string[] {
  const landSet = new Set(landHexes.map(hexKey));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const h of landHexes) {
    for (const d of DIRECTIONS) {
      const neighbor: Hex = { q: h.q + d.q, r: h.r + d.r };
      if (!landSet.has(hexKey(neighbor))) {
        const eid = edgeId(h, neighbor);
        if (!seen.has(eid)) {
          seen.add(eid);
          result.push(eid);
        }
      }
    }
  }
  return result;
}

/** "pool:<name>" → name; anything else → undefined. */
const poolName = (v: unknown): string | undefined =>
  typeof v === "string" && v.startsWith("pool:") ? v.slice("pool:".length) : undefined;

const LOW_TOKENS = new Set([2, 3, 11, 12]);

/** Does the board break one of the map's token rules? */
function breaksConstraint(
  constraint: Constraint,
  hexes: ResolvedHex[],
  graph: ReturnType<typeof buildGraph>,
): boolean {
  if (typeof constraint === "object") {
    // "no-tokens-on-hexes": none of the listed tokens on the listed hexes.
    const listed = new Set(constraint.hexes);
    return hexes.some(
      (h) => listed.has(hexKey(h)) && h.token !== undefined && constraint.tokens.includes(h.token),
    );
  }
  switch (constraint) {
    case "no-adjacent-red-tokens":
      return hasRedTokenViolation(hexes, graph);
    case "no-red-on-gold":
      return hexes.some(
        (h) => h.terrain === "gold" && h.token !== undefined && RED_TOKENS.has(h.token),
      );
    case "no-low-tokens-on-forest-pasture":
      return hexes.some(
        (h) =>
          (h.terrain === "forest" || h.terrain === "pasture") &&
          h.token !== undefined &&
          LOW_TOKENS.has(h.token),
      );
    default:
      return false;
  }
}

/**
 * Resolve a map definition into a concrete board with the game RNG: draw each terrain pool into
 * its own hexes, then each token pool (reshuffling every token pool until the map's constraints
 * hold), then ports. Pools are drawn in name order, so a map with one pool of each kind uses the
 * RNG exactly as before named pools existed (spec 017).
 */
export function generateMap(def: MapDef, rng: RngState): { map: ResolvedMap; rng: RngState } {
  let r = rng;

  // --- Terrain ---
  const terrainOf = new Map<string, TerrainType>();
  for (const h of def.hexes) {
    if (!poolName(h.terrain)) terrainOf.set(hexKey(h), h.terrain as TerrainType);
  }
  for (const name of Object.keys(def.pools?.terrain ?? {}).sort()) {
    const slots = def.hexes.filter((h) => poolName(h.terrain) === name);
    if (slots.length === 0) continue;
    const pool = expandPool<TerrainType>(
      def.pools!.terrain![name] as Partial<Record<TerrainType, number>>,
    );
    if (pool.length !== slots.length) {
      throw new Error(
        `terrain pool ${name} has ${pool.length} tiles but ${slots.length} hexes use it`,
      );
    }
    let shuffled: TerrainType[];
    ({ result: shuffled, rng: r } = shuffle(pool, r));
    slots.forEach((h, i) => terrainOf.set(hexKey(h), shuffled[i]!));
  }
  for (const h of def.hexes) {
    if (!terrainOf.has(hexKey(h))) throw new Error(`No terrain pool for hex ${hexKey(h)}`);
  }

  const resolved = (h: { q: number; r: number }) => terrainOf.get(hexKey(h))!;
  // Land in a fixed order: fixed hexes first, then each terrain pool's hexes (pools by name), each
  // in the order the map lists them. Tokens are dealt in this order too.
  const fixedFirst = [
    ...def.hexes.filter((h) => !poolName(h.terrain)),
    ...Object.keys(def.pools?.terrain ?? {})
      .sort()
      .flatMap((name) => def.hexes.filter((h) => poolName(h.terrain) === name)),
  ];
  const landDefs = fixedFirst.filter((h) => resolved(h) !== "sea");
  const landHexes: ResolvedHex[] = landDefs.map((h) => ({ q: h.q, r: h.r, terrain: resolved(h) }));
  const seaHexes: ResolvedHex[] = def.hexes
    .filter((h) => resolved(h) === "sea")
    .map((h) => ({ q: h.q, r: h.r, terrain: "sea" as TerrainType }));
  const graph = buildGraph(landHexes);

  // --- Tokens (reshuffled until the constraints hold) ---
  // A desert never takes a token, even on a hex that asks for one from a pool.
  const tokenSlots = new Map<string, ResolvedHex[]>();
  for (const [i, h] of landDefs.entries()) {
    const name = poolName(h.token);
    if (!name || landHexes[i]!.terrain === "desert") continue;
    tokenSlots.set(name, [...(tokenSlots.get(name) ?? []), landHexes[i]!]);
  }
  const tokenPools = [...tokenSlots.keys()].sort();
  for (const name of tokenPools) {
    const pool = def.pools?.tokens?.[name] ?? [];
    const need = tokenSlots.get(name)!.length;
    if (pool.length !== need) {
      throw new Error(`token pool ${name} has ${pool.length} tokens but the map needs ${need}`);
    }
  }
  // Fixed tokens first, so constraints see the whole board.
  for (const [i, h] of landDefs.entries()) {
    if (typeof h.token === "number") landHexes[i]!.token = h.token;
  }
  if (tokenPools.length > 0) {
    const constraints = def.constraints ?? [];
    let attempts = 0;
    do {
      if (attempts > MAX_RETRIES) {
        throw new Error(
          `Could not satisfy ${constraints.map((c) => (typeof c === "string" ? c : c.rule)).join(", ")} after ${MAX_RETRIES} attempts`,
        );
      }
      for (const name of tokenPools) {
        let shuffled: number[];
        ({ result: shuffled, rng: r } = shuffle(def.pools!.tokens![name]!, r));
        tokenSlots.get(name)!.forEach((h, i) => (h.token = shuffled[i]!));
      }
      attempts++;
    } while (constraints.some((c) => breaksConstraint(c, landHexes, graph)));
  }

  // Region labels
  for (const [i, h] of landDefs.entries()) {
    if (h.region !== undefined) landHexes[i]!.region = h.region;
  }

  // --- Ports ---
  // "auto" ports are spread evenly around the coast, starting from a random offset (ASSUMPTIONS A2).
  type PortType = ResolvedPort["type"];
  const coastal = coastalEdgesAroundBoard(landHexes);
  const portDefs = def.ports ?? [];
  const autoCount = portDefs.filter((p) => p.edge === "auto").length;
  let offset = 0;
  if (autoCount > 0 && coastal.length > 0) {
    let pick: number;
    ({ value: pick, rng: r } = nextInt(r, coastal.length));
    offset = pick;
  }

  const shuffledPorts = new Map<string, PortType[]>();
  for (const name of Object.keys(def.pools?.ports ?? {}).sort()) {
    let shuffled: PortType[];
    ({ result: shuffled, rng: r } = shuffle(
      expandPool<PortType>(def.pools!.ports![name] as Partial<Record<PortType, number>>),
      r,
    ));
    shuffledPorts.set(name, shuffled);
  }

  let autoIndex = 0;
  const used = new Map<string, number>();
  /** The next port from a pool, in its shuffled order. */
  const drawPort = (name: string): PortType => {
    const pool = shuffledPorts.get(name) ?? [];
    const i = used.get(name) ?? 0;
    used.set(name, i + 1);
    return pool.length > 0 ? pool[i % pool.length]! : "any3to1";
  };
  const ports: ResolvedPort[] = portDefs.map((p) => {
    let edge = p.edge;
    if (edge === "auto") {
      const slot = Math.floor((autoIndex * coastal.length) / autoCount) + offset;
      edge = coastal[slot % coastal.length]!;
      autoIndex++;
    }
    const name = poolName(p.type);
    return { edgeId: edge, type: name ? drawPort(name) : (p.type as PortType) };
  });

  // Markers (spec 018): a harbor lying on the water takes its type from a port pool too.
  const markers: ResolvedMarker[] | undefined = def.markers?.map((m) => {
    const { data, ...rest } = m;
    if (!data) return rest;
    const { port, ...other } = data;
    if (port === undefined) return { ...rest, data: other };
    const name = poolName(port);
    return { ...rest, data: { ...other, port: name ? drawPort(name) : (port as PortType) } };
  });

  // The robber starts on a terrain ("desert"), a hex ("q,r"), or the hex with a token ("token:12").
  let robberStart = def.robberStart;
  const tokenStart = /^token:(\d+)$/.exec(robberStart ?? "");
  if (tokenStart) {
    const hex = landHexes.find((h) => h.token === Number(tokenStart[1]));
    robberStart = hex ? hexKey(hex) : undefined;
  }

  return {
    map: {
      id: def.id,
      version: def.version,
      players: def.players,
      vpToWin: def.vpToWin,
      hexes: [...landHexes, ...seaHexes],
      ports,
      ...(robberStart !== undefined ? { robberStart } : {}),
      ...(def.features !== undefined ? { features: def.features } : {}),
      ...(def.discardLimit !== undefined ? { discardLimit: def.discardLimit } : {}),
      ...(def.scenario !== undefined ? { scenario: def.scenario } : {}),
      ...(markers !== undefined ? { markers } : {}),
      modules: def.modules,
    },
    rng: r,
  };
}
