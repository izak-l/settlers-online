import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { validateMapDef } from "../validator";
import { MapDefSchema, type MapDef } from "../schema";
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
    const def = {
      ...BASE_4P,
      pools: { ...BASE_4P.pools, tokens: BASE_4P.pools!.tokens!.slice(1) },
    };
    expect(codes(def)).toContain("POOL_SIZE");
  });

  it("rejects a token pool one long", () => {
    const def = { ...BASE_4P, pools: { ...BASE_4P.pools, tokens: [...BASE_4P.pools!.tokens!, 5] } };
    expect(codes(def)).toContain("POOL_SIZE");
  });

  it("does not count a literal desert hex that asks for a pool token", () => {
    // Turn one random land hex into a fixed desert and drop the pool's desert to match.
    const hexes = BASE_4P.hexes.slice();
    const i = hexes.findIndex((h) => h.terrain === "pool:land");
    hexes[i] = { ...hexes[i]!, terrain: "desert" };
    const land = { ...BASE_4P.pools!.land!, desert: 0 };
    const def: MapDef = { ...BASE_4P, hexes, pools: { ...BASE_4P.pools, land } };
    expect(validateMapDef(def)).toEqual({ ok: true, errors: [] });
  });
});
