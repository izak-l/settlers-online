import type { MapDef } from "@settlers/maps";

/**
 * How one hex of an unresolved map is drawn: sea, fixed land, or land drawn at random when the
 * game starts. Tokens are a fixed number, "random" (drawn from the pool), or absent.
 */
export type PreviewTile =
  | { q: number; r: number; kind: "sea" }
  | { q: number; r: number; kind: "fixed"; terrain: string; token?: number | "random" }
  | { q: number; r: number; kind: "random"; token?: number | "random" };

function tokenOf(token: number | string | undefined): number | "random" | undefined {
  if (token === undefined) return undefined;
  return typeof token === "number" ? token : "random";
}

export function previewTiles(def: MapDef): PreviewTile[] {
  return def.hexes.map((h): PreviewTile => {
    if (h.terrain === "sea") return { q: h.q, r: h.r, kind: "sea" };
    const token = tokenOf(h.token);
    const extra = token === undefined ? {} : { token };
    if (h.terrain.startsWith("pool:")) return { q: h.q, r: h.r, kind: "random", ...extra };
    return { q: h.q, r: h.r, kind: "fixed", terrain: h.terrain, ...extra };
  });
}

export interface MapFacts {
  land: number;
  randomLand: number;
  ports: number;
}

export function mapFacts(def: MapDef): MapFacts {
  const land = def.hexes.filter((h) => h.terrain !== "sea");
  return {
    land: land.length,
    randomLand: land.filter((h) => h.terrain.startsWith("pool:")).length,
    ports: def.ports?.length ?? 0,
  };
}
