import { describe, it, expect } from "vitest";
import { createGame, piecesLeft } from "../engine";
import { h, newGame, runSetup, v, withPiece } from "./testkit";

describe("piecesLeft (spec 232)", () => {
  it("starts with the base supply", () => {
    expect(piecesLeft(newGame(), "p0")).toEqual({ road: 15, settlement: 5, city: 4 });
  });

  it("counts down after setup, per player", () => {
    const s = runSetup(newGame());
    expect(piecesLeft(s, "p0")).toEqual({ road: 13, settlement: 3, city: 4 });
    expect(piecesLeft(s, "p1")).toEqual({ road: 13, settlement: 3, city: 4 });
  });

  it("a city uses a city piece and gives back the settlement", () => {
    const s = runSetup(newGame());
    const settlement = Object.values(s.pieces).find(
      (p) => p.owner === "p0" && p.type === "settlement",
    )!;
    const upgraded = structuredClone(s);
    delete upgraded.pieces[settlement.id];
    const withCity = withPiece(upgraded, "city", "p0", settlement.at);
    expect(piecesLeft(withCity, "p0")).toEqual({ road: 13, settlement: 4, city: 3 });
  });

  it("seafaring adds ships", () => {
    const s = withPiece(newGame(), "settlement", "p0", { vertex: v(h(0, 0), h(1, 0), h(1, -1)) });
    expect(piecesLeft(s, "p0")["settlement"]).toBe(4);
    const sea = createGame(
      {
        id: "sea",
        vpToWin: 10,
        hexes: [
          { q: 0, r: 0, terrain: "forest", token: 6 },
          { q: 1, r: 0, terrain: "sea" },
          { q: 0, r: 1, terrain: "sea" },
        ],
        ports: [],
        robberStart: "0,0",
      },
      { modules: ["base", "seafaring"] },
      ["p0", "p1"],
      "seed",
    );
    expect(piecesLeft(sea, "p0")).toEqual({ road: 15, settlement: 5, city: 4, ship: 15 });
  });
});
