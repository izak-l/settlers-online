import { describe, expect, it } from "vitest";
import { apply, computeVP, legalActions } from "../engine";
import { awardHolder, longestRoad } from "../modules/base/awards";
import type { GameState } from "../types";
import {
  act,
  give,
  giveDev,
  h,
  inMainPhase,
  inRollPhase,
  newGame,
  pathFrom,
  v,
  withPiece,
} from "./testkit";

const START = v(h(-2, 2), h(-1, 2), h(-1, 1)); // south-west of the fixture
const awards = (s: GameState) =>
  s.moduleState["base"] as { longestRoad: string | null; largestArmy: string | null };

function roads(s: GameState, owner: string, edges: string[]): GameState {
  for (const edge of edges) s = withPiece(s, "road", owner, { edge });
  return s;
}

describe("awardHolder (the shared rule for both awards)", () => {
  it("needs the threshold", () => {
    expect(awardHolder(null, { p0: 4, p1: 2 }, 5)).toBeNull();
    expect(awardHolder(null, { p0: 5, p1: 2 }, 5)).toBe("p0");
  });
  it("a tie keeps the current holder", () => {
    expect(awardHolder("p0", { p0: 6, p1: 6 }, 5)).toBe("p0");
  });
  it("a challenger must exceed the holder", () => {
    expect(awardHolder("p0", { p0: 6, p1: 7 }, 5)).toBe("p1");
  });
  it("if the holder drops and others tie for the lead, nobody holds it", () => {
    expect(awardHolder("p0", { p0: 3, p1: 5, p2: 5 }, 5)).toBeNull();
  });
  it("if the holder drops below the threshold and nobody else qualifies, nobody holds it", () => {
    expect(awardHolder("p0", { p0: 4, p1: 2 }, 5)).toBeNull();
  });
  it("nobody gets it on a first-time tie", () => {
    expect(awardHolder(null, { p0: 5, p1: 5 }, 5)).toBeNull();
  });
});

describe("longestRoad", () => {
  it("counts a straight chain", () => {
    let s = inMainPhase(newGame());
    s = roads(s, "p0", pathFrom(s, START, 5).edges);
    expect(longestRoad(s, "p0")).toBe(5);
    expect(longestRoad(s, "p1")).toBe(0);
  });

  it("counts only the longest branch of a fork", () => {
    let s = inMainPhase(newGame());
    const main = pathFrom(s, START, 4);
    s = roads(s, "p0", main.edges);
    // a 1-edge spur off the middle vertex
    const mid = main.vertices[2]!;
    const spur = s.graph.vertices.get(mid)!.edges.find((ed) => !main.edges.includes(ed))!;
    s = roads(s, "p0", [spur]);
    expect(longestRoad(s, "p0")).toBe(4);
  });

  it("counts every edge of a loop", () => {
    let s = inMainPhase(newGame());
    s = roads(s, "p0", s.graph.hexEdges.get("0,0")!);
    expect(longestRoad(s, "p0")).toBe(6);
  });

  it("is broken by an opponent's building in the middle, not by your own", () => {
    let s = inMainPhase(newGame());
    const path = pathFrom(s, START, 6);
    s = roads(s, "p0", path.edges);
    const own = withPiece(s, "settlement", "p0", { vertex: path.vertices[3]! });
    expect(longestRoad(own, "p0")).toBe(6);
    const theirs = withPiece(s, "settlement", "p1", { vertex: path.vertices[3]! });
    expect(longestRoad(theirs, "p0")).toBe(3);
  });
});

describe("Longest Road award in play", () => {
  it("goes to the first player to build a 5th connected road, worth 2 VP", () => {
    let s = inMainPhase(newGame());
    const path = pathFrom(s, START, 5);
    s = withPiece(s, "settlement", "p0", { vertex: START });
    s = roads(s, "p0", path.edges.slice(0, 4));
    s = give(s, "p0", { wood: 1, brick: 1 });
    expect(computeVP(s, "p0")).toBe(1);
    const res = apply(s, "p0", { type: "BUILD_ROAD", edge: path.edges[4]! });
    if (!res.ok) throw new Error(res.code);
    expect(awards(res.state).longestRoad).toBe("p0");
    expect(computeVP(res.state, "p0")).toBe(3);
    expect(res.events.some((ev) => ev.type === "AWARD")).toBe(true);
  });

  it("is lost when an opponent's settlement breaks the road and they tie for the lead", () => {
    // p0: 6-road chain (holder). p1 and p2: 5-road chains elsewhere. p1 settles in the middle of p0's.
    let s = inMainPhase(newGame(), "p1");
    const a = pathFrom(s, START, 6);
    const b = pathFrom(s, v(h(2, -2), h(1, -2), h(2, -3)), 5, new Set(a.vertices));
    const c = pathFrom(
      s,
      v(h(2, 0), h(3, -1), h(2, -1)),
      5,
      new Set([...a.vertices, ...b.vertices]),
    );
    s = roads(roads(roads(s, "p0", a.edges), "p1", b.edges), "p2", c.edges);
    (s.moduleState["base"] as { longestRoad: string | null }).longestRoad = "p0";
    // p1 needs a road touching the spot it settles on: the spot is a[2], next to a road of p1's.
    const spot = a.vertices[3]!;
    const touch = s.graph.vertices.get(spot)!.edges.find((ed) => !a.edges.includes(ed))!;
    s = withPiece(s, "road", "p1", { edge: touch });
    s = give(s, "p1", { wood: 1, brick: 1, sheep: 1, wheat: 1 });
    const res = apply(s, "p1", { type: "BUILD_SETTLEMENT", vertex: spot });
    if (!res.ok) throw new Error(`${res.code}: ${res.message}`);
    expect(longestRoad(res.state, "p0")).toBe(3);
    expect(awards(res.state).longestRoad).toBeNull();
  });
});

describe("Largest Army", () => {
  function armyGame(knights: Record<string, number>, holder: string | null = null) {
    let s = inMainPhase(newGame());
    for (const [p, n] of Object.entries(knights)) s = giveDev(s, p, { knight: n }, "played");
    (s.moduleState["base"] as { largestArmy: string | null }).largestArmy = holder;
    return giveDev(s, "p0", { knight: 1 });
  }

  it("goes to the first player with 3 knights played, worth 2 VP", () => {
    let s = armyGame({ p0: 2 });
    s = act(s, "p0", { type: "PLAY_KNIGHT" });
    expect(awards(s).largestArmy).toBe("p0");
    expect(computeVP(s, "p0")).toBe(2);
  });

  it("a challenger must exceed the holder", () => {
    let s = armyGame({ p0: 2, p1: 3 }, "p1");
    s = act(s, "p0", { type: "PLAY_KNIGHT" });
    expect(awards(s).largestArmy).toBe("p1"); // 3 vs 3
    const s2 = armyGame({ p0: 3, p1: 3 }, "p1");
    expect(awards(act(s2, "p0", { type: "PLAY_KNIGHT" })).largestArmy).toBe("p0"); // 4 vs 3
  });
});

describe("winning", () => {
  /** p0 has 4 cities and a settlement (9 VP) with roads to build one more settlement. */
  function nineVP(s: GameState, owner = "p0"): { s: GameState; spot: string } {
    // Far (north and east) from START, where the extra settlement goes.
    const spots = [
      v(h(2, -2), h(1, -2), h(2, -3)),
      v(h(2, 0), h(3, -1), h(2, -1)),
      v(h(0, -2), h(-1, -1), h(0, -1)),
      v(h(1, 1), h(0, 2), h(1, 2)),
    ];
    for (const vertex of spots) s = withPiece(s, "city", owner, { vertex });
    const path = pathFrom(s, START, 2);
    s = withPiece(s, "settlement", owner, { vertex: START });
    s = roads(s, owner, path.edges);
    return { s, spot: path.vertices[2]! };
  }

  it("the active player wins on reaching 10 VP, and the game stops", () => {
    let { s, spot } = nineVP(inMainPhase(newGame()));
    s = give(s, "p0", { wood: 1, brick: 1, sheep: 1, wheat: 1 });
    const res = apply(s, "p0", { type: "BUILD_SETTLEMENT", vertex: spot });
    if (!res.ok) throw new Error(`${res.code}: ${res.message}`);
    expect(res.state.winner).toBe("p0");
    expect(res.state.decisions).toEqual([]);
    expect(res.events.at(-1)!.type).toBe("GAME_WON");
    expect(legalActions(res.state, "p0")).toEqual([]);
    const after = apply(res.state, "p0", { type: "END_TURN" });
    expect(after.ok || after.code).toBe("GAME_OVER");
  });

  it("hidden VP cards count toward the win, and are revealed in everyone's score after", () => {
    let { s } = nineVP(inRollPhase(newGame()));
    s = giveDev(s, "p0", { victoryPoint: 1 });
    expect(computeVP(s, "p0", "p1")).toBe(9);
    s = act(s, "p0", { type: "ROLL" });
    expect(s.winner).toBe("p0");
    expect(computeVP(s, "p0", "p1")).toBe(10);
  });

  it("a player with 10 VP on someone else's turn wins when their own turn starts", () => {
    let { s } = nineVP(inMainPhase(newGame()), "p1");
    s = giveDev(s, "p1", { victoryPoint: 1 });
    expect(s.winner).toBeUndefined();
    s = act(s, "p0", { type: "END_TURN" });
    expect(s.winner).toBe("p1");
  });
});
