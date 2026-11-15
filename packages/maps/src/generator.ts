import { type RngState, shuffle, buildGraph, edgeId, hexKey, type Hex } from "@settlers/engine";
import {
  type MapDef,
  type ResolvedHex,
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

export function generateMap(def: MapDef, rng: RngState): { map: ResolvedMap; rng: RngState } {
  const fixedLandDefs = def.hexes.filter(
    (h) => h.terrain !== "sea" && !String(h.terrain).startsWith("pool:"),
  );
  const poolLandDefs = def.hexes.filter((h) => String(h.terrain) === "pool:land");
  const seaDefs = def.hexes.filter((h) => h.terrain === "sea");

  // --- Terrain ---
  let r = rng;
  let shuffledTerrain: TerrainType[] = [];
  if (poolLandDefs.length > 0) {
    if (!def.pools?.land) throw new Error("Map uses pool:land but defines no pools.land");
    const landPool = expandPool<TerrainType>(
      def.pools.land as Partial<Record<TerrainType, number>>,
    );
    if (landPool.length !== poolLandDefs.length) {
      throw new Error(
        `pools.land has ${landPool.length} tiles but map has ${poolLandDefs.length} pool:land hexes`,
      );
    }
    ({ result: shuffledTerrain, rng: r } = shuffle(landPool, r));
  }

  const landHexes: ResolvedHex[] = [
    ...fixedLandDefs.map((h) => ({ q: h.q, r: h.r, terrain: h.terrain as TerrainType })),
    ...poolLandDefs.map((h, i) => ({ q: h.q, r: h.r, terrain: shuffledTerrain[i]! })),
  ];
  const seaHexes: ResolvedHex[] = seaDefs.map((h) => ({
    q: h.q,
    r: h.r,
    terrain: "sea" as TerrainType,
  }));

  const graph = buildGraph(landHexes);

  // --- Tokens (with red-token constraint retry) ---
  const tokenPool: number[] = def.pools?.tokens?.slice() ?? [];
  const needsToken = landHexes.filter((h) => {
    if (h.terrain === "desert") return false;
    const orig = def.hexes.find((d) => d.q === h.q && d.r === h.r);
    return orig?.token === "pool:tokens";
  });

  if (needsToken.length > 0) {
    if (tokenPool.length !== needsToken.length) {
      throw new Error(
        `pools.tokens has ${tokenPool.length} tokens but map needs ${needsToken.length}`,
      );
    }
    const checkConstraint = def.constraints?.includes("no-adjacent-red-tokens") ?? false;
    let attempts = 0;
    let shuffledTokens: number[];
    do {
      if (attempts > MAX_RETRIES) {
        throw new Error(
          `Could not satisfy no-adjacent-red-tokens constraint after ${MAX_RETRIES} attempts`,
        );
      }
      ({ result: shuffledTokens, rng: r } = shuffle(tokenPool, r));
      let idx = 0;
      for (const h of needsToken) {
        h.token = shuffledTokens[idx++]!;
      }
      attempts++;
    } while (checkConstraint && hasRedTokenViolation(landHexes, graph));
  }

  // Apply fixed tokens (non-pool)
  for (const h of landHexes) {
    const orig = def.hexes.find((d) => d.q === h.q && d.r === h.r);
    if (typeof orig?.token === "number") h.token = orig.token;
  }

  // --- Ports ---
  type PortType = ResolvedPort["type"];
  const coastal = coastalEdgeIds(landHexes);
  let shuffledCoastal: string[];
  ({ result: shuffledCoastal, rng: r } = shuffle(coastal, r));

  const portPoolEntries = expandPool<PortType>(
    (def.pools?.ports ?? {}) as Partial<Record<PortType, number>>,
  );
  let shuffledPortTypes: PortType[];
  ({ result: shuffledPortTypes, rng: r } = shuffle(portPoolEntries, r));

  const ports: ResolvedPort[] = (def.ports ?? []).map((p, i) => ({
    edgeId: shuffledCoastal[i % shuffledCoastal.length]!,
    type:
      p.type === "pool:ports"
        ? (shuffledPortTypes[i % shuffledPortTypes.length] ?? "any3to1")
        : (p.type as PortType),
  }));

  return {
    map: {
      id: def.id,
      version: def.version,
      players: def.players,
      vpToWin: def.vpToWin,
      hexes: [...landHexes, ...seaHexes],
      ports,
      ...(def.robberStart !== undefined ? { robberStart: def.robberStart } : {}),
      modules: def.modules,
    },
    rng: r,
  };
}
