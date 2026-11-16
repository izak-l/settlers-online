import { describe, expect, it } from "vitest";
import { BASE_4P, findMap, type MapDef } from "@settlers/maps";
import { mapFacts, previewTiles } from "./mapTiles";

describe("map tiles", () => {
  it("draws random land and random tokens as unknowns", () => {
    const tiles = previewTiles(BASE_4P);
    const land = tiles.filter((t) => t.kind !== "sea");
    expect(land).toHaveLength(19);
    expect(land.every((t) => t.kind === "random" && t.token === "random")).toBe(true);
    expect(tiles.filter((t) => t.kind === "sea")).toHaveLength(18);
  });

  it("keeps fixed terrain and fixed tokens", () => {
    const def: MapDef = {
      ...BASE_4P,
      hexes: [
        { q: 0, r: 0, terrain: "forest", token: 6 },
        { q: 1, r: 0, terrain: "desert" },
        { q: 2, r: 0, terrain: "sea" },
      ],
    };
    expect(previewTiles(def)).toEqual([
      { q: 0, r: 0, kind: "fixed", terrain: "forest", token: 6 },
      { q: 1, r: 0, kind: "fixed", terrain: "desert" },
      { q: 2, r: 0, kind: "sea" },
    ]);
  });

  it("summarises land, random tiles and ports", () => {
    expect(mapFacts(BASE_4P)).toEqual({ land: 19, randomLand: 19, ports: 9 });
    expect(mapFacts(findMap("grand-diamond")!.def).land).toBe(49);
  });
});
