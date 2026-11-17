import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { seedFromString } from "@settlers/engine";
import { generateMap } from "../generator";
import { validateMapDef } from "../validator";
import { MAP_LIMITS, MapDefSchema, type MapDef } from "../schema";
import { BASE_4P } from "../definitions";

const here = dirname(fileURLToPath(import.meta.url));

function load(rel: string): MapDef {
  return MapDefSchema.parse(JSON.parse(readFileSync(join(here, "../../maps", rel), "utf-8")));
}

function codes(def: MapDef): string[] {
  return validateMapDef(def).errors.map((e) => e.code);
}

describe("validateMapDef: token accounting", () => {
  it("accepts the base map (its one desert comes from the land pool)", () => {
    expect(validateMapDef(BASE_4P)).toEqual({ ok: true, errors: [] });
  });

  it("accepts Grand Diamond (three deserts in the land pool)", () => {
    expect(validateMapDef(load("grand-diamond.json")).ok).toBe(true);
  });

  it("rejects a token pool one short", () => {
    const tokens = BASE_4P.pools!.tokens!["tokens"]!;
    const def = { ...BASE_4P, pools: { ...BASE_4P.pools, tokens: { tokens: tokens.slice(1) } } };
    expect(codes(def)).toContain("POOL_SIZE");
  });

  it("rejects a token pool one long", () => {
    const tokens = BASE_4P.pools!.tokens!["tokens"]!;
    const def = { ...BASE_4P, pools: { ...BASE_4P.pools, tokens: { tokens: [...tokens, 5] } } };
    expect(codes(def)).toContain("POOL_SIZE");
  });

  it("does not count a literal desert hex that asks for a pool token", () => {
    // Turn one random land hex into a fixed desert and drop the pool's desert to match.
    const hexes = BASE_4P.hexes.slice();
    const i = hexes.findIndex((h) => h.terrain === "pool:land");
    hexes[i] = { ...hexes[i]!, terrain: "desert" };
    const land = { ...BASE_4P.pools!.terrain!["land"]!, desert: 0 };
    const def: MapDef = { ...BASE_4P, hexes, pools: { ...BASE_4P.pools, terrain: { land } } };
    expect(validateMapDef(def)).toEqual({ ok: true, errors: [] });
  });
});

describe("named pools (spec 017)", () => {
  // Two areas: the base map's centre ring is its own pool with its own tokens.
  const ring = new Set(["1,0", "1,-1", "0,-1", "-1,0", "-1,1", "0,1"]);
  function twoPools(): MapDef {
    const centre = BASE_4P.hexes.filter((h) => ring.has(`${h.q},${h.r}`));
    const hexes = BASE_4P.hexes.map((h) =>
      ring.has(`${h.q},${h.r}`) ? { ...h, terrain: "pool:inner", token: "pool:inner" } : h,
    );
    const land = { ...BASE_4P.pools!.terrain!["land"]! };
    land.forest! -= 2;
    land.pasture! -= 2;
    land.fields! -= 2;
    const tokens = [...BASE_4P.pools!.tokens!["tokens"]!];
    const inner = [6, 8, 4, 5, 9, 10];
    for (const t of inner) tokens.splice(tokens.indexOf(t), 1);
    expect(centre).toHaveLength(6);
    return {
      ...BASE_4P,
      hexes,
      pools: {
        ...BASE_4P.pools,
        terrain: { land, inner: { forest: 2, pasture: 2, fields: 2 } },
        tokens: { tokens, inner },
      },
    };
  }

  it("counts each pool against its own hexes", () => {
    expect(validateMapDef(twoPools())).toEqual({ ok: true, errors: [] });
    const short = twoPools();
    short.pools!.tokens!["inner"] = [6, 8];
    expect(codes(short)).toContain("POOL_SIZE");
    const missing = twoPools();
    delete missing.pools!.terrain!["inner"];
    expect(codes(missing)).toContain("POOL_MISSING");
  });

  it("draws each pool only into its own hexes, and keeps the constraints", () => {
    const def = { ...twoPools(), constraints: ["no-low-tokens-on-forest-pasture" as const] };
    for (let i = 0; i < 200; i++) {
      const { map } = generateMap(def, seedFromString(`pools-${i}`));
      for (const h of map.hexes) {
        if (ring.has(`${h.q},${h.r}`)) {
          expect(["forest", "pasture", "fields"]).toContain(h.terrain);
          expect([6, 8, 4, 5, 9, 10]).toContain(h.token);
        }
        if (h.terrain === "forest" || h.terrain === "pasture")
          expect([2, 3, 11, 12]).not.toContain(h.token);
      }
    }
  });

  it("starts the robber on the hex with a given token", () => {
    const { map } = generateMap({ ...BASE_4P, robberStart: "token:12" }, seedFromString("r"));
    const hex = map.hexes.find((h) => h.token === 12)!;
    expect(map.robberStart).toBe(`${hex.q},${hex.r}`);
  });
});

describe("MapDefSchema: size limits for uploaded maps", () => {
  const ok = (def: unknown) => MapDefSchema.safeParse(def).success;

  it("accepts the base map with an optional name and description", () => {
    expect(ok({ ...BASE_4P, name: "Isle", description: "A small isle." })).toBe(true);
  });

  it("rejects more than MAP_LIMITS.hexes hexes", () => {
    const hexes = Array.from({ length: MAP_LIMITS.hexes + 1 }, (_, i) => ({
      q: (i % 30) - 15,
      r: Math.floor(i / 30) - 15,
      terrain: "sea",
    }));
    expect(ok({ ...BASE_4P, hexes })).toBe(false);
  });

  it("rejects coordinates beyond ±MAP_LIMITS.coord", () => {
    expect(
      ok({
        ...BASE_4P,
        hexes: [...BASE_4P.hexes, { q: MAP_LIMITS.coord + 1, r: 0, terrain: "sea" }],
      }),
    ).toBe(false);
  });

  it("rejects the same hex twice", () => {
    expect(ok({ ...BASE_4P, hexes: [...BASE_4P.hexes, BASE_4P.hexes[0]] })).toBe(false);
  });

  it("accepts every draft, island maps included", () => {
    const dir = join(here, "../../maps/drafts");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const raw = JSON.parse(readFileSync(join(dir, f), "utf-8")) as unknown;
      expect(ok(raw), f).toBe(true);
    }
  });

  it("rejects a long name or description", () => {
    expect(ok({ ...BASE_4P, name: "x".repeat(41) })).toBe(false);
    expect(ok({ ...BASE_4P, description: "x".repeat(201) })).toBe(false);
  });
});

describe("validateMapDef: markers (spec 018)", () => {
  // A one-hex island in a ring of sea, with things lying on its edges.
  const island = (markers: unknown[], extra: Partial<MapDef> = {}): MapDef =>
    ({
      id: "marker-test",
      version: 1,
      players: { min: 1, max: 4 },
      vpToWin: 10,
      hexes: [
        { q: 0, r: 0, terrain: "forest", token: 6 },
        { q: 1, r: 0, terrain: "sea" },
        { q: 0, r: 1, terrain: "hills", token: 8 },
      ],
      modules: ["base", "seafaring"],
      markers,
      ...extra,
    }) as MapDef;

  it("accepts tokens, cards and harbors on sea edges, with a port pool for the harbors", () => {
    const def = island(
      [
        { id: "vp-1", kind: "vp-token", at: { edge: "0,0|1,0" } },
        { id: "dev-1", kind: "dev-card", at: { edge: "0,0|0,-1" } },
        { id: "harbor-1", kind: "harbor", at: { edge: "0,1|1,0" }, data: { port: "pool:h" } },
      ],
      { pools: { ports: { h: { ore2to1: 1 } } } },
    );
    expect(validateMapDef(def)).toEqual({ ok: true, errors: [] });
    const { map } = generateMap(def, seedFromString("m"));
    expect(map.markers).toContainEqual({
      id: "harbor-1",
      kind: "harbor",
      at: { edge: "0,1|1,0" },
      data: { port: "ore2to1" },
    });
  });

  it("rejects a marker between two land hexes, off the map, repeated, or a harbor with no type", () => {
    expect(codes(island([{ id: "a", kind: "vp-token", at: { edge: "0,0|0,1" } }]))).toContain(
      "MARKER",
    );
    expect(codes(island([{ id: "a", kind: "vp-token", at: { edge: "5,5|5,6" } }]))).toContain(
      "MARKER",
    );
    const twice = { id: "a", kind: "vp-token", at: { edge: "0,0|1,0" } };
    expect(codes(island([twice, twice]))).toContain("MARKER");
    expect(codes(island([{ id: "h", kind: "harbor", at: { edge: "0,0|1,0" } }]))).toContain(
      "MARKER",
    );
  });

  it("accepts a village on a corner with a token; rejects one on an edge or without a token", () => {
    expect(
      validateMapDef(
        island([{ id: "v", kind: "village", at: { vertex: "0,0|0,1|1,0" }, data: { token: 8 } }]),
      ).ok,
    ).toBe(true);
    expect(
      codes(island([{ id: "v", kind: "village", at: { edge: "0,0|1,0" }, data: { token: 8 } }])),
    ).toContain("MARKER");
    expect(codes(island([{ id: "v", kind: "village", at: { vertex: "0,0|0,1|1,0" } }]))).toContain(
      "MARKER",
    );
  });

  it("counts harbors against their port pool", () => {
    const def = island(
      [{ id: "harbor-1", kind: "harbor", at: { edge: "0,1|1,0" }, data: { port: "pool:h" } }],
      { pools: { ports: { h: { ore2to1: 2 } } } },
    );
    expect(codes(def)).toContain("POOL_SIZE");
  });
});
