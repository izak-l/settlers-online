import { describe, expect, it } from "vitest";
import type { Action } from "../actions";
import { apply, computeVP, createGame, legalActions } from "../engine";
import type { GameState, MapInput, PlayerId } from "../types";
import {
  act,
  e,
  give,
  giveDev,
  h,
  inMainPhase,
  inRollPhase,
  runSetup,
  setHand,
  topActor,
  v,
  withPiece,
} from "./testkit";

// ---------------------------------------------------------------------------
// Fixture: a 7-hex main island ("main") and a 2-hex east island ("east", gold + pasture),
// two sea hexes apart, inside a radius-4 sea.
// ---------------------------------------------------------------------------

const MAIN: MapInput["hexes"] = [
  { q: 0, r: 0, terrain: "desert", region: "main" },
  { q: 1, r: 0, terrain: "forest", token: 6, region: "main" },
  { q: 1, r: -1, terrain: "hills", token: 8, region: "main" },
  { q: 0, r: -1, terrain: "pasture", token: 5, region: "main" },
  { q: -1, r: 0, terrain: "fields", token: 4, region: "main" },
  { q: -1, r: 1, terrain: "mountains", token: 10, region: "main" },
  { q: 0, r: 1, terrain: "forest", token: 11, region: "main" },
];
const EAST: MapInput["hexes"] = [
  { q: 4, r: -1, terrain: "gold", token: 9, region: "east" },
  { q: 4, r: 0, terrain: "pasture", token: 3, region: "east" },
];

function islandsMap(
  scenario: Record<string, unknown> = {},
  extra: MapInput["hexes"] = [],
): MapInput {
  const listed = new Set([...MAIN, ...EAST, ...extra].map((x) => `${x.q},${x.r}`));
  const sea: MapInput["hexes"] = [];
  for (let q = -4; q <= 4; q++)
    for (let r = -4; r <= 4; r++)
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 4 && !listed.has(`${q},${r}`))
        sea.push({ q, r, terrain: "sea" });
  return {
    id: "islands",
    vpToWin: 14,
    hexes: [...MAIN, ...EAST, ...extra, ...sea],
    ports: [],
    robberStart: "desert",
    scenario: {
      islandBonus: 2,
      home: { regions: ["main"] },
      setupRegions: ["main"],
      pirateStart: "-3,0",
      ...scenario,
    },
  };
}

const SEATS = ["p0", "p1"];
function game(scenario: Record<string, unknown> = {}, seed = "sea", extra: MapInput["hexes"] = []) {
  return createGame(islandsMap(scenario, extra), { modules: ["base", "seafaring"] }, SEATS, seed);
}

// Corners and edges along the way from the main island to the east island.
const COAST = v(h(1, 0), h(2, 0), h(2, -1)); // main island's east tip (forest only)
const C2 = v(h(2, -1), h(2, 0), h(3, -1));
const C3 = v(h(2, 0), h(3, -1), h(3, 0));
const EAST_CORNER = v(h(3, -1), h(3, 0), h(4, -1)); // touches the gold hex
const S1 = e(h(2, -1), h(2, 0)); // COAST–C2
const S2 = e(h(2, 0), h(3, -1)); // C2–C3
const S3 = e(h(3, -1), h(3, 0)); // C3–EAST_CORNER

/** p0 in the main step with a settlement on the east tip and ships S1..S{n}. */
function withLine(n: number, s: GameState = inMainPhase(game())): GameState {
  let out = withPiece(s, "settlement", "p0", { vertex: COAST });
  for (const edge of [S1, S2, S3].slice(0, n)) out = withPiece(out, "ship", "p0", { edge });
  return out;
}

const types = (s: GameState, p: PlayerId = "p0") => legalActions(s, p).map((a) => a.type);
const expectCode = (s: GameState, p: PlayerId, a: Action, code: string) =>
  expect(apply(s, p, a)).toMatchObject({ ok: false, code });

/** A seed whose first roll in this game totals `total`. */
function seedRolling(total: number, scenario: Record<string, unknown> = {}): string {
  for (let i = 0; i < 5000; i++) {
    const seed = `sea-roll-${total}-${i}`;
    const res = apply(inRollPhase(game(scenario, seed)), "p0", { type: "ROLL" });
    if (res.ok && res.events[0]!.data!["total"] === total) return seed;
  }
  throw new Error(`no seed rolls ${total}`);
}

// ---------------------------------------------------------------------------

describe("setup", () => {
  it("starting settlements only on the home island", () => {
    const spots = legalActions(game(), "p0").filter((a) => a.type === "PLACE_SETTLEMENT");
    expect(spots.length).toBeGreaterThan(0);
    for (const a of spots) {
      const vertex = (a as { vertex: string }).vertex;
      expect(vertex.split("|").some((k) => MAIN.some((m) => `${m.q},${m.r}` === k))).toBe(true);
    }
    expectCode(
      game(),
      "p0",
      { type: "PLACE_SETTLEMENT", vertex: EAST_CORNER },
      "ILLEGAL_PLACEMENT",
    );
  });

  it("a coastal starting settlement may take a ship instead of the road", () => {
    let s = act(game(), "p0", { type: "PLACE_SETTLEMENT", vertex: COAST });
    const legal = legalActions(s, "p0");
    expect(legal).toContainEqual({ type: "PLACE_SHIP", edge: S1 });
    expect(legal.some((a) => a.type === "PLACE_ROAD")).toBe(true);
    // A ship can't go on the land edge, nor a road on open sea.
    expectCode(s, "p0", { type: "PLACE_SHIP", edge: e(h(1, 0), h(1, -1)) }, "ILLEGAL_PLACEMENT");
    expectCode(s, "p0", { type: "PLACE_ROAD", edge: S1 }, "ILLEGAL_PLACEMENT");
    s = act(s, "p0", { type: "PLACE_SHIP", edge: S1 });
    expect(s.decisions.at(-1)!.kind).toBe("PLACE_SETTLEMENT");
    expect(Object.values(s.pieces).filter((x) => x.type === "ship")).toHaveLength(1);
  });

  it("a second starting settlement next to gold earns a pick (custom maps)", () => {
    // No setup restriction, so p0 may start on the east island next to the gold hex.
    let s = game({ setupRegions: undefined, home: "setup" });
    s = act(s, "p0", { type: "PLACE_SETTLEMENT", vertex: v(h(0, -1), h(0, -2), h(1, -2)) });
    s = act(
      s,
      "p0",
      legalActions(s, "p0").find((a) => a.type === "PLACE_ROAD")!,
    );
    s = act(s, "p1", { type: "PLACE_SETTLEMENT", vertex: v(h(-1, 1), h(-2, 1), h(-2, 2)) });
    s = act(
      s,
      "p1",
      legalActions(s, "p1").find((a) => a.type === "PLACE_ROAD")!,
    );
    s = act(s, "p1", { type: "PLACE_SETTLEMENT", vertex: v(h(-1, 0), h(-2, 0), h(-2, 1)) });
    s = act(
      s,
      "p1",
      legalActions(s, "p1").find((a) => a.type === "PLACE_ROAD")!,
    );
    s = act(s, "p0", { type: "PLACE_SETTLEMENT", vertex: EAST_CORNER });
    expect(s.decisions.at(-1)!.kind).toBe("GOLD_CHOICE");
    expectCode(s, "p0", { type: "CHOOSE_GOLD", resources: { ore: 2 } }, "INVALID_CHOICE");
    s = act(s, "p0", { type: "CHOOSE_GOLD", resources: { ore: 1 } });
    expect(s.zones["hand-p0"]!.contents["ore"]).toBe(1);
    expect(s.decisions.at(-1)!.kind).toBe("PLACE_ROAD");
  });

  it("plays a whole setup with legal moves only", () => {
    const s = runSetup(game());
    expect(s.decisions.at(-1)!.kind).toBe("ROLL");
  });
});

describe("building ships", () => {
  it("costs wood and sheep, and connects to your building or ship", () => {
    let s = withLine(0);
    expectCode(s, "p0", { type: "BUILD_SHIP", edge: S1 }, "CANNOT_AFFORD");
    s = give(s, "p0", { wood: 2, sheep: 2 });
    expect(legalActions(s, "p0")).toContainEqual({ type: "BUILD_SHIP", edge: S1 });
    expectCode(s, "p0", { type: "BUILD_SHIP", edge: S2 }, "ILLEGAL_PLACEMENT"); // not connected
    s = act(s, "p0", { type: "BUILD_SHIP", edge: S1 });
    expect(s.zones["hand-p0"]!.contents).toMatchObject({ wood: 1, sheep: 1 });
    s = act(s, "p0", { type: "BUILD_SHIP", edge: S2 }); // extends the ship
    expect(s.pieces["ship-p0-1"]!.at).toEqual({ edge: S2 });
  });

  it("never connects directly to a road", () => {
    let s = inMainPhase(game());
    s = withPiece(s, "settlement", "p0", { vertex: v(h(0, 0), h(1, 0), h(1, -1)) });
    s = withPiece(s, "road", "p0", { edge: e(h(1, 0), h(1, -1)) });
    s = withPiece(s, "road", "p0", { edge: e(h(1, -1), h(2, -1)) });
    s = give(s, "p0", { wood: 1, sheep: 1 });
    // The road ends on the coast, at a corner with no building: no ship may continue it.
    const roadEnd = v(h(1, -1), h(2, -1), h(2, -2));
    const seaEdge = e(h(2, -1), h(2, -2));
    expect(s.graph.edges.get(seaEdge)!.vertices).toContain(roadEnd);
    expectCode(s, "p0", { type: "BUILD_SHIP", edge: seaEdge }, "ILLEGAL_PLACEMENT");
  });

  it("can't go past an opponent's building or on an occupied edge", () => {
    let s = withLine(1);
    s = withPiece(s, "settlement", "p1", { vertex: C2 });
    s = give(s, "p0", { wood: 1, sheep: 1 });
    expectCode(s, "p0", { type: "BUILD_SHIP", edge: S2 }, "ILLEGAL_PLACEMENT");
    expectCode(s, "p0", { type: "BUILD_SHIP", edge: S1 }, "ILLEGAL_PLACEMENT");
  });

  it("the pirate blocks the edges of its hex", () => {
    let s = withLine(1);
    s = {
      ...s,
      pieces: { ...s.pieces, pirate: { id: "pirate", type: "pirate", at: { hex: "3,-1" } } },
    };
    s = give(s, "p0", { wood: 1, sheep: 1 });
    expect(apply(s, "p0", { type: "BUILD_SHIP", edge: S2 })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/pirate/) as unknown,
    });
  });

  it("may sail along the map's outer border; stops at 15 ships", () => {
    let s = inMainPhase(game());
    const border = [...s.graph.edges.values()].find((x) => x.hexes.length === 1)!;
    s = withPiece(s, "settlement", "p1", { vertex: border.vertices[0] });
    s = give(s, "p1", { wood: 1, sheep: 1 });
    s = { ...s, decisions: [{ ...s.decisions[0]!, actors: ["p1"], pendingFrom: ["p1"] }] };
    expect(legalActions(s, "p1")).toContainEqual({ type: "BUILD_SHIP", edge: border.id });

    let full = withLine(0);
    const seaEdges = [...full.graph.edges.keys()].filter((x) => !x.includes("0,0")).slice(0, 15);
    for (const edge of seaEdges) full = withPiece(full, "ship", "p0", { edge });
    full = give(full, "p0", { wood: 1, sheep: 1 });
    expectCode(full, "p0", { type: "BUILD_SHIP", edge: S1 }, "PIECE_LIMIT");
  });
});

describe("islands", () => {
  it("a settlement at the end of a ship line on another island earns the bonus once per island", () => {
    let s = withLine(3);
    expect(computeVP(s, "p0")).toBe(1);
    s = give(s, "p0", { wood: 1, brick: 1, sheep: 1, wheat: 1 });
    s = act(s, "p0", { type: "BUILD_SETTLEMENT", vertex: EAST_CORNER });
    expect(computeVP(s, "p0")).toBe(1 + 1 + 2);
    // A second settlement on the same island earns nothing extra.
    s = withPiece(s, "settlement", "p0", { vertex: v(h(4, 0), h(5, -1), h(5, 0)) });
    expect(computeVP(s, "p0")).toBe(1 + 1 + 2 + 1);
  });

  it("home islands from setup: unlabelled landmasses, each player's own", () => {
    const unlabel = (hx: MapInput["hexes"][number]) => {
      const { region: _r, ...rest } = hx;
      return rest;
    };
    let s = createGame(
      {
        ...islandsMap({ home: "setup", setupRegions: undefined }),
        hexes: islandsMap().hexes.map(unlabel),
      },
      { modules: ["base", "seafaring"] },
      SEATS,
      "home",
    );
    s = act(s, "p0", { type: "PLACE_SETTLEMENT", vertex: EAST_CORNER });
    const regions = (s.moduleState["seafaring"] as { home: Record<string, string[]> }).home;
    expect(regions["p0"]).toEqual(["island:4,-1"]);
    expect(regions["p1"]).toEqual([]);
    // p0's home is the east island, so a settlement on the main island would be a bonus.
    s = inMainPhase(s);
    s = withPiece(s, "settlement", "p0", { vertex: COAST });
    expect(computeVP(s, "p0")).toBe(2 + 2);
  });
});

describe("moving ships", () => {
  it("moves the open end of a line once per turn, not one built this turn", () => {
    let s = withLine(2);
    // S2 is the open end (C3 has nothing of p0's); S1 sits between the settlement and S2.
    const beside = e(h(2, -1), h(3, -1)); // also at C2, the end of S1
    expect(legalActions(s, "p0")).toContainEqual({ type: "MOVE_SHIP", from: S2, to: beside });
    // S2 can't hang off itself: S3 only touches S2's own corner.
    expectCode(s, "p0", { type: "MOVE_SHIP", from: S2, to: S3 }, "ILLEGAL_PLACEMENT");
    expectCode(s, "p0", { type: "MOVE_SHIP", from: S1, to: S3 }, "INVALID_CHOICE");
    s = act(s, "p0", { type: "MOVE_SHIP", from: S2, to: e(h(2, -1), h(3, -1)) });
    expect(types(s).includes("MOVE_SHIP")).toBe(false); // once per turn
    s = act(s, "p0", { type: "END_TURN" });

    let t = withLine(0);
    t = give(t, "p0", { wood: 1, sheep: 1 });
    t = act(t, "p0", { type: "BUILD_SHIP", edge: S1 });
    expectCode(
      t,
      "p0",
      { type: "MOVE_SHIP", from: S1, to: e(h(2, -1), h(1, -1)) },
      "INVALID_CHOICE",
    );
  });

  it("a line joining two of your buildings never moves, even if an opponent builds on it", () => {
    let s = withLine(3);
    s = withPiece(s, "settlement", "p0", { vertex: EAST_CORNER });
    for (const from of [S1, S2, S3])
      expectCode(s, "p0", { type: "MOVE_SHIP", from, to: e(h(2, -1), h(3, -2)) }, "INVALID_CHOICE");
    s = withPiece(s, "settlement", "p1", { vertex: C3 });
    for (const from of [S1, S2, S3])
      expectCode(s, "p0", { type: "MOVE_SHIP", from, to: e(h(2, -1), h(3, -2)) }, "INVALID_CHOICE");
  });

  it("not from or to an edge of the pirate's hex", () => {
    let s = withLine(2);
    s = {
      ...s,
      pieces: { ...s.pieces, pirate: { id: "pirate", type: "pirate", at: { hex: "3,0" } } },
    };
    expectCode(s, "p0", { type: "MOVE_SHIP", from: S2, to: S3 }, "ILLEGAL_PLACEMENT");
    s = {
      ...s,
      pieces: { ...s.pieces, pirate: { id: "pirate", type: "pirate", at: { hex: "3,-1" } } },
    };
    expectCode(s, "p0", { type: "MOVE_SHIP", from: S2, to: e(h(2, 0), h(2, 1)) }, "INVALID_CHOICE");
  });
});

describe("gold", () => {
  it("everyone on a rolled gold hex picks at once; cities pick two", () => {
    const seed = seedRolling(9);
    let s = inRollPhase(game({}, seed));
    s = withPiece(s, "settlement", "p0", { vertex: EAST_CORNER });
    s = withPiece(s, "city", "p1", { vertex: v(h(4, -1), h(5, -2), h(5, -1)) });
    s = act(s, "p0", { type: "ROLL" });
    const top = s.decisions.at(-1)!;
    expect(top.kind).toBe("GOLD_CHOICE");
    expect(top.data!["amounts"]).toEqual({ p0: 1, p1: 2 });
    s = act(s, "p1", { type: "CHOOSE_GOLD", resources: { ore: 1, brick: 1 } });
    s = act(s, "p0", { type: "CHOOSE_GOLD", resources: { wheat: 1 } });
    expect(s.decisions.at(-1)!.kind).toBe("MAIN");
    expect(s.zones["hand-p1"]!.contents).toMatchObject({ ore: 1, brick: 1 });
  });

  it("the robber blocks a gold hex; a short bank limits the pick", () => {
    const seed = seedRolling(9);
    let s = inRollPhase(game({}, seed));
    s = withPiece(s, "settlement", "p0", { vertex: EAST_CORNER });
    s = {
      ...s,
      pieces: { ...s.pieces, robber: { id: "robber", type: "robber", at: { hex: "4,-1" } } },
    };
    expect(act(s, "p0", { type: "ROLL" }).decisions.at(-1)!.kind).toBe("MAIN");

    let t = inRollPhase(game({}, seed));
    t = withPiece(t, "city", "p0", { vertex: EAST_CORNER });
    // Empty the bank except for one wheat.
    for (const r of ["wood", "brick", "sheep", "ore"]) t = give(t, "p1", { [r]: 19 });
    t = give(t, "p1", { wheat: 18 });
    t = act(t, "p0", { type: "ROLL" });
    expectCode(t, "p0", { type: "CHOOSE_GOLD", resources: { wheat: 2 } }, "INVALID_CHOICE");
    t = act(t, "p0", { type: "CHOOSE_GOLD", resources: { wheat: 1 } });
    expect(t.decisions.at(-1)!.kind).toBe("MAIN");
  });
});

describe("the pirate", () => {
  it("starts where the scenario says; a 7 moves the robber or the pirate", () => {
    let s = inRollPhase(game({}, seedRolling(7)));
    expect(s.pieces["pirate"]!.at).toEqual({ hex: "-3,0" });
    s = act(s, "p0", { type: "ROLL" });
    const legal = types(s);
    expect(legal).toContain("MOVE_ROBBER");
    expect(legal).toContain("MOVE_PIRATE");
    expectCode(s, "p0", { type: "MOVE_PIRATE", hex: "0,0" }, "ILLEGAL_PLACEMENT"); // land
    expectCode(s, "p0", { type: "MOVE_PIRATE", hex: "-3,0" }, "ILLEGAL_PLACEMENT"); // same hex
    expectCode(s, "p0", { type: "MOVE_ROBBER", hex: "2,0" }, "ILLEGAL_PLACEMENT"); // robber on sea
  });

  it("steals from a player with a ship on its hex", () => {
    let s = inRollPhase(game({}, seedRolling(7)));
    s = withPiece(s, "ship", "p1", { edge: S2 });
    s = setHand(s, "p1", { ore: 1 });
    s = act(s, "p0", { type: "ROLL" });
    s = act(s, "p0", { type: "MOVE_PIRATE", hex: "3,-1" });
    expect(s.zones["hand-p0"]!.contents["ore"]).toBe(1);
    expect(s.decisions.at(-1)!.kind).toBe("MAIN");
  });

  it("can be parked on the frame, where it blocks nothing; a Knight moves it too", () => {
    let s = withLine(1);
    s = giveDev(s, "p0", { knight: 1 });
    s = act(s, "p0", { type: "PLAY_KNIGHT" });
    s = act(s, "p0", { type: "MOVE_PIRATE", hex: null });
    expect(s.pieces["pirate"]).toBeUndefined();
    expect(s.decisions.at(-1)!.kind).toBe("MAIN");
  });

  it("isn't in play when the scenario has no pirate start", () => {
    let s = inRollPhase(
      game({ pirateStart: undefined }, seedRolling(7, { pirateStart: undefined })),
    );
    expect(s.pieces["pirate"]).toBeUndefined();
    s = act(s, "p0", { type: "ROLL" });
    expect(types(s)).not.toContain("MOVE_PIRATE");
  });
});

describe("Road Crew and the Longest Trade Route", () => {
  it("Road Crew places roads, ships or one of each", () => {
    let s = withLine(1);
    s = withPiece(s, "road", "p0", { edge: e(h(1, 0), h(2, -1)) });
    s = giveDev(s, "p0", { roadBuilding: 1 });
    s = act(s, "p0", { type: "PLAY_ROAD_BUILDING" });
    const legal = types(s);
    expect(legal).toContain("PLACE_FREE_ROAD");
    expect(legal).toContain("PLACE_FREE_SHIP");
    s = act(s, "p0", { type: "PLACE_FREE_SHIP", edge: S2 });
    s = act(
      s,
      "p0",
      legalActions(s, "p0").find((a) => a.type === "PLACE_FREE_ROAD")!,
    );
    expect(s.decisions.at(-1)!.kind).toBe("MAIN");
  });

  it("roads and ships count together, joined at your building", () => {
    let s = withLine(3);
    // Two roads inland from the coastal settlement: 2 roads + 3 ships through the settlement.
    s = withPiece(s, "road", "p0", { edge: e(h(1, 0), h(2, -1)) });
    s = give(s, "p0", { wood: 1, brick: 1 });
    const road = legalActions(s, "p0").find(
      (a) => a.type === "BUILD_ROAD" && (a as { edge: string }).edge === e(h(1, -1), h(2, -1)),
    )!;
    const res = apply(s, "p0", road);
    if (!res.ok) throw new Error(res.message);
    expect((res.state.moduleState["base"] as { longestRoad: string }).longestRoad).toBe("p0");
    expect(res.events.map((x) => x.text).join()).toMatch(/Longest Trade Route \(5\)/);
  });
});

describe("timeouts", () => {
  it("a gold pick has a default the engine accepts", async () => {
    const { defaultAction } = await import("../engine");
    const seed = seedRolling(9);
    let s = inRollPhase(game({}, seed));
    s = withPiece(s, "settlement", "p0", { vertex: EAST_CORNER });
    s = act(s, "p0", { type: "ROLL" });
    const p = topActor(s);
    s = act(s, "system", defaultAction(s, p));
    expect(s.decisions.at(-1)!.kind).toBe("MAIN");
  });
});
