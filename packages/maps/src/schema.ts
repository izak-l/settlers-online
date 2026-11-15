import { z } from "zod";

const TerrainValue = z.enum([
  "forest", "pasture", "fields", "hills", "mountains", "desert", "sea", "gold", "fog",
]);

const TerrainField = z.union([TerrainValue, z.string().startsWith("pool:")]);

const TokenField = z.union([z.number().int().min(2).max(12), z.string().startsWith("pool:")]);

export const HexDefSchema = z.object({
  q: z.number().int(),
  r: z.number().int(),
  terrain: TerrainField,
  token: TokenField.optional(),
  hidden: z.boolean().optional(),
});

export const PortDefSchema = z.object({
  edge: z.union([z.string(), z.literal("auto")]),
  type: z.union([
    z.enum(["any3to1", "wood2to1", "brick2to1", "sheep2to1", "wheat2to1", "ore2to1"]),
    z.string().startsWith("pool:"),
  ]),
});

export const LandPoolSchema = z.record(TerrainValue, z.number().int().nonnegative());

export const PortPoolSchema = z.record(
  z.enum(["any3to1", "wood2to1", "brick2to1", "sheep2to1", "wheat2to1", "ore2to1"]),
  z.number().int().nonnegative(),
);

export const PoolsSchema = z.object({
  land: LandPoolSchema.optional(),
  tokens: z.array(z.number().int().min(2).max(12)).optional(),
  ports: PortPoolSchema.optional(),
});

const ConstraintName = z.enum(["no-adjacent-red-tokens"]);

export const MapDefSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  players: z.object({ min: z.number().int(), max: z.number().int() }),
  vpToWin: z.number().int().positive(),
  hexes: z.array(HexDefSchema),
  pools: PoolsSchema.optional(),
  ports: z.array(PortDefSchema).optional(),
  robberStart: z.string().optional(),
  constraints: z.array(ConstraintName).optional(),
  modules: z.array(z.string()),
});

export type TerrainType = z.infer<typeof TerrainValue>;
export type HexDef = z.infer<typeof HexDefSchema>;
export type PortDef = z.infer<typeof PortDefSchema>;
export type MapDef = z.infer<typeof MapDefSchema>;

/** A hex with all pool references resolved to concrete values. */
export interface ResolvedHex {
  q: number;
  r: number;
  terrain: TerrainType;
  token?: number;
  hidden?: boolean;
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
  modules: string[];
}
