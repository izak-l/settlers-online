import { describe, expect, it } from "vitest";
import { buildTiles } from "./buildTiles";

const base = { legal: [], hasShips: false, devCards: true };

describe("buildTiles (spec 232)", () => {
  it("shows pieces left and the dev deck count", () => {
    const tiles = buildTiles({
      ...base,
      piecesLeft: { road: 13, settlement: 3, city: 4 },
      devDeck: 22,
    });
    expect(tiles.map((t) => [t.label, t.left])).toEqual([
      ["Road", 13],
      ["Settlement", 3],
      ["City", 4],
      ["Dev card", 22],
    ]);
  });

  it("enables only legal builds", () => {
    const tiles = buildTiles({ ...base, legal: ["BUILD_ROAD", "BUY_DEV_CARD"] });
    expect(tiles.filter((t) => t.enabled).map((t) => t.label)).toEqual(["Road", "Dev card"]);
  });

  it("adds ship tiles with seafaring, and drops dev cards when switched off", () => {
    const tiles = buildTiles({
      ...base,
      hasShips: true,
      devCards: false,
      piecesLeft: { road: 15, settlement: 5, city: 4, ship: 0 },
    });
    expect(tiles.map((t) => t.label)).toEqual(["Road", "Settlement", "City", "Ship", "Move ship"]);
    expect(tiles.find((t) => t.label === "Ship")!.left).toBe(0);
    expect(tiles.find((t) => t.label === "Move ship")!.left).toBeUndefined();
  });

  it("shows no badges without counts (older servers)", () => {
    expect(buildTiles(base).every((t) => t.left === undefined)).toBe(true);
  });
});
