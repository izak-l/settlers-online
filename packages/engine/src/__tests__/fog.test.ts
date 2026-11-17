import { describe, expect, it } from "vitest";
import { apply, createGame, legalActions, viewFor } from "../engine";
import type { GameState, MapInput } from "../types";
import { act, e, give, h, inMainPhase, v, withPiece } from "./testkit";

// A 7-hex main island with two face-down hexes off its east tip, inside a radius-3 sea.
const MAIN: MapInput["hexes"] = [
  { q: 0, r: 0, terrain: "desert", region: "main" },
  { q: 1, r: 0, terrain: "forest", token: 6, region: "main" },
  { q: 1, r: -1, terrain: "hills", token: 8, region: "main" },
  { q: 0, r: -1, terrain: "pasture", token: 5, region: "main" },
  { q: -1, r: 0, terrain: "fields", token: 4, region: "main" },
  { q: -1, r: 1, terrain: "mountains", token: 10, region: "main" },
  { q: 0, r: 1, terrain: "forest", token: 11, region: "main" },
];
const FOGGED: MapInput["hexes"] = [
  { q: 2, r: -1, terrain: "fog" },
  { q: 2, r: 0, terrain: "fog" },
];

function fogMap(
  fog: { terrain: Record<string, number>; tokens: number[] },
  reward = true,
): MapInput {
  const listed = new Set([...MAIN, ...FOGGED].map((x) => `${x.q},${x.r}`));
  const sea: MapInput["hexes"] = [];
  for (let q = -3; q <= 3; q++)
    for (let r = -3; r <= 3; r++)
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 3 && !listed.has(`${q},${r}`))
        sea.push({ q, r, terrain: "sea" });
  return {
    id: "fog",
    vpToWin: 12,
    hexes: [...MAIN, ...FOGGED, ...sea],
    ports: [],
    robberStart: "desert",
    scenario: { home: "setup", fog, ...(reward ? { discoveryReward: true } : {}) },
  };
}

type FogStack = { terrain: Record<string, number>; tokens: number[] };
const game = (fog: FogStack = { terrain: { pasture: 1, sea: 1 }, tokens: [9] }, seed = "fog") =>
  inMainPhase(createGame(fogMap(fog), { modules: ["base", "seafaring"] }, ["p0", "p1"], seed));

const TIP = v(h(1, 0), h(2, 0), h(2, -1)); // forest + both fog hexes
const NORTH = v(h(1, 0), h(1, -1), h(2, -1)); // forest, hills + one fog hex
const SHIP_EDGE = e(h(1, 0), h(2, -1)); // forest | fog: its corners are TIP and NORTH
const FOG_EDGE = e(h(2, -1), h(2, 0)); // between the two fog hexes

const terrainOf = (s: GameState, q: number, r: number) =>
  s.map.hexes.find((x) => x.q === q && x.r === r)!;

describe("fog", () => {
  it("keeps the face-down stacks out of every view", () => {
    const s = game();
    expect(s.zones["fog-terrain"]!.contents).toEqual({ pasture: 1, sea: 1 });
    for (const viewer of ["p0", "p1", "spectator"] as const) {
      const view = viewFor(s, viewer);
      expect(view.zones["fog-terrain"]!.contents).toBeUndefined();
      expect(view.zones["fog-terrain"]!.count).toBe(2);
      expect(view.zones["fog-tokens"]!.contents).toBeUndefined();
      expect(view.map.hexes.filter((x) => x.terrain === "fog")).toHaveLength(2);
    }
  });

  it("counts as sea until revealed: ships may use it, roads, settlements and the robber may not", () => {
    let s = withPiece(game(), "settlement", "p0", { vertex: TIP });
    s = give(s, "p0", { wood: 2, brick: 1, sheep: 1 });
    expect(apply(s, "p0", { type: "BUILD_ROAD", edge: FOG_EDGE })).toMatchObject({
      ok: false,
      code: "ILLEGAL_PLACEMENT",
    });
    expect(legalActions(s, "p0")).toContainEqual({ type: "BUILD_SHIP", edge: FOG_EDGE });
    // A corner whose only land is fog takes no settlement.
    const fogCorner = v(h(2, -1), h(2, 0), h(3, -1));
    expect(legalActions(game(), "p0").some((a) => "vertex" in a && a.vertex === fogCorner)).toBe(
      false,
    );
    let r = {
      ...s,
      decisions: [
        ...s.decisions,
        { ...s.decisions[0]!, kind: "MOVE_ROBBER", allowed: ["MOVE_ROBBER"] },
      ],
    };
    r = r as GameState;
    expect(apply(r, "p0", { type: "MOVE_ROBBER", hex: "2,0" })).toMatchObject({ ok: false });
  });

  it("a ship reaching a fog corner reveals it, with a token and a discovery card", () => {
    let s = withPiece(game(), "settlement", "p0", { vertex: NORTH });
    s = give(s, "p0", { wood: 1, sheep: 1 });
    const res = apply(s, "p0", { type: "BUILD_SHIP", edge: SHIP_EDGE });
    if (!res.ok) throw new Error(res.message);
    s = res.state;
    // Both fog hexes touch the ship's corners: both are revealed, one pasture (9) and one sea.
    const revealed = [terrainOf(s, 2, -1), terrainOf(s, 2, 0)];
    expect(revealed.map((x) => x.terrain).sort()).toEqual(["pasture", "sea"]);
    const pasture = revealed.find((x) => x.terrain === "pasture")!;
    expect(pasture.token).toBe(9);
    expect(s.zones["fog-terrain"]!.contents).toEqual({ pasture: 0, sea: 0 });
    expect(s.zones["hand-p0"]!.contents["sheep"]).toBe(1);
    expect(res.events.filter((x) => x.type === "REVEALED")).toHaveLength(2);
    // The new land joins the main island's region.
    const regions = (s.moduleState["seafaring"] as { regionOf: Record<string, string> }).regionOf;
    expect(regions[`${pasture.q},${pasture.r}`]).toBe("main");
  });

  it("a revealed gold hex lets the player pick the reward", () => {
    let s = game({ terrain: { gold: 2 }, tokens: [4, 10] });
    s = withPiece(s, "settlement", "p0", { vertex: NORTH });
    s = give(s, "p0", { wood: 1, sheep: 1 });
    s = act(s, "p0", { type: "BUILD_SHIP", edge: SHIP_EDGE });
    expect(s.decisions.at(-1)!.kind).toBe("GOLD_CHOICE");
    expect(s.decisions.at(-1)!.data!["amounts"]).toEqual({ p0: 1 });
  });

  it("the same seed reveals the same hexes", () => {
    const run = (seed: string) => {
      let s = withPiece(
        game({ terrain: { pasture: 1, hills: 1 }, tokens: [3, 9] }, seed),
        "settlement",
        "p0",
        { vertex: NORTH },
      );
      s = give(s, "p0", { wood: 1, sheep: 1 });
      s = act(s, "p0", { type: "BUILD_SHIP", edge: SHIP_EDGE });
      return [terrainOf(s, 2, -1), terrainOf(s, 2, 0)];
    };
    expect(run("a")).toEqual(run("a"));
  });
});
