import { z } from "zod";

const TerrainValue = z.enum([
  "forest",
  "pasture",
  "fields",
  "hills",
  "mountains",
  "desert",
  "sea",
  "gold",
  "fog",
]);

const TerrainField = z.union([TerrainValue, z.string().startsWith("pool:")]);

const TokenField = z.union([z.number().int().min(2).max(12), z.string().startsWith("pool:")]);

/**
 * Limits for maps people upload (M8b), counting sea hexes. The largest draft (an island map)
 * has 408 hexes and reaches coordinate 25.
 */
export const MAP_LIMITS = { hexes: 600, coord: 32, name: 40, description: 200 } as const;

const Coord = z.number().int().min(-MAP_LIMITS.coord).max(MAP_LIMITS.coord);

export const HexDefSchema = z.object({
  q: Coord,
  r: Coord,
  terrain: TerrainField,
  token: TokenField.optional(),
  hidden: z.boolean().optional(),
  /** A labelled area of the map (seafaring: islands and regions, spec 015). */
  region: z.string().min(1).max(24).optional(),
});

const PortType = z.enum(["any3to1", "wood2to1", "brick2to1", "sheep2to1", "wheat2to1", "ore2to1"]);

export const PortDefSchema = z.object({
  edge: z.union([z.string(), z.literal("auto")]),
  type: z.union([PortType, z.string().startsWith("pool:")]),
});

/** "q,r": a hex on this map. */
const HexKeyString = z.string().regex(/^-?\d+,-?\d+$/, "a hex as q,r");

/**
 * Something on the board at the start, read by a scenario module: a VP token, a face-down
 * development card, or a harbor (with its type, fixed or drawn from a port pool) lying on a sea
 * edge (spec 018); or a village on a corner, with its number token (spec 019).
 */
export const MarkerDefSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,32}$/, "a marker id: lowercase, digits, -"),
    kind: z.enum(["vp-token", "dev-card", "harbor", "village"]),
    at: z.union([
      z.object({ edge: z.string().min(1).max(64) }).strict(),
      z.object({ vertex: z.string().min(1).max(64) }).strict(),
      z.object({ hex: HexKeyString }).strict(),
    ]),
    data: z
      .object({
        port: z.union([PortType, z.string().startsWith("pool:")]),
        token: z.number().int().min(2).max(12),
      })
      .partial()
      .strict()
      .optional(),
  })
  .strict();

export const LandPoolSchema = z.record(TerrainValue, z.number().int().nonnegative());

export const PortPoolSchema = z.record(PortType, z.number().int().nonnegative());

const PoolName = z.string().regex(/^[a-z][a-z0-9-]{0,23}$/, "a pool name: lowercase, digits, -");

/**
 * Named pools (spec 017). A hex's `"pool:<name>"` terrain draws from `terrain[name]`, its
 * `"pool:<name>"` token from `tokens[name]`, and a port's `"pool:<name>"` type from `ports[name]`.
 * Each pool is drawn only into its own hexes, so a map can have a main-island pool and an
 * islands pool. Most maps use one of each: `land`, `tokens` and `ports`.
 */
export const PoolsSchema = z.object({
  terrain: z.record(PoolName, LandPoolSchema).optional(),
  tokens: z.record(PoolName, z.array(z.number().int().min(2).max(12))).optional(),
  ports: z.record(PoolName, PortPoolSchema).optional(),
});

/**
 * Rules the generator keeps when it draws tokens (it reshuffles until they hold):
 * no 6/8 next to each other; no 6/8 on gold; no 2, 3, 11 or 12 on forest or pasture.
 */
const ConstraintName = z.enum([
  "no-adjacent-red-tokens",
  "no-red-on-gold",
  "no-low-tokens-on-forest-pasture",
]);

/** None of these tokens on the listed hexes (scenario 5: no 5, 6, 8 or 9 on three marked hexes). */
const TokensOffHexes = z
  .object({
    rule: z.literal("no-tokens-on-hexes"),
    tokens: z.array(z.number().int().min(2).max(12)).min(1),
    hexes: z.array(HexKeyString).min(1),
  })
  .strict();

export const ConstraintSchema = z.union([ConstraintName, TokensOffHexes]);
const RegionName = z.string().min(1).max(24);

/**
 * Scenario settings read by the seafaring module (spec 015). Strict, so a typo fails validation
 * instead of silently using a default.
 */
export const ScenarioSchema = z
  .object({
    /** VP for a player's first settlement in each region that isn't one of their home regions. */
    islandBonus: z.number().int().min(0).max(2),
    /** Home regions for everyone, or "setup": where each player places starting settlements. */
    home: z.union([z.literal("setup"), z.object({ regions: z.array(RegionName).min(1) }).strict()]),
    /** Starting settlements must touch one of these regions. */
    setupRegions: z.array(RegionName).min(1),
    /** Where the pirate starts (a sea hex). Omitted: no pirate. */
    pirateStart: z.union([HexKeyString, z.literal("frame")]),
    /** Fog (spec 016): the face-down stacks drawn as fog hexes are revealed. */
    fog: z
      .object({
        terrain: z.record(TerrainValue, z.number().int().nonnegative()),
        tokens: z.array(z.number().int().min(2).max(12)),
      })
      .strict(),
    /** A newly revealed land hex gives one card of what it produces. */
    discoveryReward: z.boolean(),
  })
  .partial()
  .strict();

/** Base-game feature switches (spec 014); omitted ones stay on. */
export const FeaturesSchema = z
  .object({
    devCards: z.boolean(),
    robber: z.boolean(),
    longestRoad: z.boolean(),
    largestArmy: z.boolean(),
    ports: z.boolean(),
  })
  .partial()
  .strict();

export const MapDefSchema = z.object({
  id: z.string().min(1).max(64),
  /** Display name and one-line description, in our own words. Required for catalog maps. */
  name: z.string().min(1).max(MAP_LIMITS.name).optional(),
  description: z.string().max(MAP_LIMITS.description).optional(),
  version: z.number().int().positive(),
  players: z.object({ min: z.number().int(), max: z.number().int() }),
  vpToWin: z.number().int().positive(),
  hexes: z
    .array(HexDefSchema)
    .max(MAP_LIMITS.hexes)
    .superRefine((hexes, ctx) => {
      const seen = new Set<string>();
      for (const h of hexes) {
        const key = `${h.q},${h.r}`;
        if (seen.has(key)) ctx.addIssue({ code: "custom", message: `Hex ${key} appears twice` });
        seen.add(key);
      }
    }),
  pools: PoolsSchema.optional(),
  ports: z.array(PortDefSchema).max(MAP_LIMITS.hexes).optional(),
  robberStart: z.string().optional(),
  constraints: z.array(ConstraintSchema).optional(),
  features: FeaturesSchema.optional(),
  scenario: ScenarioSchema.optional(),
  markers: z.array(MarkerDefSchema).max(MAP_LIMITS.hexes).optional(),
  modules: z.array(z.string()),
});

export type TerrainType = z.infer<typeof TerrainValue>;
export type HexDef = z.infer<typeof HexDefSchema>;
export type PortDef = z.infer<typeof PortDefSchema>;
export type MapDef = z.infer<typeof MapDefSchema>;
export type MarkerDef = z.infer<typeof MarkerDefSchema>;
export type Constraint = z.infer<typeof ConstraintSchema>;

/** A hex with all pool references resolved to concrete values. */
export interface ResolvedHex {
  q: number;
  r: number;
  terrain: TerrainType;
  token?: number;
  hidden?: boolean;
  region?: string;
}

/** A port with its edge resolved to a concrete hex-pair key. */
export interface ResolvedPort {
  edgeId: string;
  type: Exclude<z.infer<typeof PortDefSchema>["type"], `pool:${string}`>;
}

export interface ResolvedMap {
  id: string;
  version: number;
  players: { min: number; max: number };
  vpToWin: number;
  hexes: ResolvedHex[];
  ports: ResolvedPort[];
  robberStart?: string;
  features?: z.infer<typeof FeaturesSchema>;
  scenario?: z.infer<typeof ScenarioSchema>;
  /** Markers with every pool resolved (a harbor's `data.port` is a concrete port type). */
  markers?: ResolvedMarker[];
  modules: string[];
}

export interface ResolvedMarker extends Omit<MarkerDef, "data"> {
  data?: { port?: ResolvedPort["type"] | undefined; token?: number | undefined };
}
