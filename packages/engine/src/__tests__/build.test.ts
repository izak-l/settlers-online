import { describe, it, expect } from "vitest";
import { apply } from "../engine";
import type { GameState } from "../types";
import { act, countPieces, give, h, hand, inMainPhase, newGame, v, withPiece } from "./testkit";

const X = v(h(0, 0), h(1, 0), h(1, -1)); // interior vertex with three edges
const ROAD_COST = { wood: 1, brick: 1 };
const SETTLEMENT_COST = { wood: 1, brick: 1, sheep: 1, wheat: 1 };
const CITY_COST = { wheat: 2, ore: 3 };

function edgesOf(s: GameState, vertex: string): string[] {
  return s.graph.vertices.get(vertex)!.edges;
}
function otherEnd(s: GameState, edge: string, vertex: string): string {
  const [a, b] = s.graph.edges.get(edge)!.vertices;
  return a === vertex ? b : a;
}
function expectReject(s: GameState, action: Parameters<typeof apply>[2], code: string): void {
  const res = apply(s, "p0", action);
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.code).toBe(code);
}

/** p0 owns a settlement at X, in their main step. */
function base(): GameState {
  return withPiece(inMainPhase(newGame()), "settlement", "p0", { vertex: X });
}

describe("BUILD_ROAD", () => {
  it("builds next to your settlement and pays the bank", () => {
    let s = give(base(), "p0", ROAD_COST);
    s = act(s, "p0", { type: "BUILD_ROAD", edge: edgesOf(s, X)[0]! });
    expect(countPieces(s, "p0", "road")).toBe(1);
    expect(hand(s, "p0")).toMatchObject({ wood: 0, brick: 0 });
    expect(s.zones["bank"]!.contents).toMatchObject({ wood: 19, brick: 19 });
  });

  it("extends from your own road", () => {
    let s = give(base(), "p0", { wood: 2, brick: 2 });
    const first = edgesOf(s, X)[0]!;
    s = act(s, "p0", { type: "BUILD_ROAD", edge: first });
    const y = otherEnd(s, first, X);
    const next = edgesOf(s, y).find((ed) => ed !== first)!;
    s = act(s, "p0", { type: "BUILD_ROAD", edge: next });
    expect(countPieces(s, "p0", "road")).toBe(2);
  });

  it("rejects a road that connects to nothing of yours", () => {
    const s = give(base(), "p0", ROAD_COST);
    const far = v(h(-2, 2), h(-1, 2), h(-1, 1));
    expectReject(s, { type: "BUILD_ROAD", edge: edgesOf(s, far)[0]! }, "ILLEGAL_PLACEMENT");
  });

  it("rejects building without the resources", () => {
    expectReject(base(), { type: "BUILD_ROAD", edge: edgesOf(base(), X)[0]! }, "CANNOT_AFFORD");
  });

  it("rejects building on an occupied edge", () => {
    let s = give(base(), "p0", ROAD_COST);
    const edge = edgesOf(s, X)[0]!;
    s = withPiece(s, "road", "p1", { edge });
    expectReject(s, { type: "BUILD_ROAD", edge }, "ILLEGAL_PLACEMENT");
  });

  it("an opponent's settlement blocks continuing a road through that vertex", () => {
    // p0 has a lone road ending at X (no p0 building there); p1 settles on X.
    let s = inMainPhase(newGame());
    const [e1, e2] = edgesOf(s, X);
    s = withPiece(s, "road", "p0", { edge: e1! });
    s = give(s, "p0", ROAD_COST);
    expect(apply(s, "p0", { type: "BUILD_ROAD", edge: e2! }).ok).toBe(true);
    s = withPiece(s, "settlement", "p1", { vertex: X });
    expectReject(s, { type: "BUILD_ROAD", edge: e2! }, "ILLEGAL_PLACEMENT");
  });

  it("stops at 15 roads", () => {
    let s = give(base(), "p0", ROAD_COST);
    const all = [...s.graph.edges.keys()];
    for (let i = 0; i < 15; i++) s = withPiece(s, "road", "p0", { edge: all[i + 20]! });
    expectReject(s, { type: "BUILD_ROAD", edge: edgesOf(s, X)[0]! }, "PIECE_LIMIT");
  });
});

describe("BUILD_SETTLEMENT", () => {
  /** p0 has roads X→Y→Z, so Z is two edges from X. */
  function withTwoRoads(): { s: GameState; z: string; y: string } {
    let s = base();
    const e1 = edgesOf(s, X)[0]!;
    const y = otherEnd(s, e1, X);
    const e2 = edgesOf(s, y).find((ed) => ed !== e1)!;
    const z = otherEnd(s, e2, y);
    s = withPiece(s, "road", "p0", { edge: e1 });
    s = withPiece(s, "road", "p0", { edge: e2 });
    return { s: give(s, "p0", SETTLEMENT_COST), z, y };
  }

  it("builds at the end of your road", () => {
    const { s, z } = withTwoRoads();
    const after = act(s, "p0", { type: "BUILD_SETTLEMENT", vertex: z });
    expect(countPieces(after, "p0", "settlement")).toBe(2);
    expect(hand(after, "p0")).toMatchObject({ wood: 0, brick: 0, sheep: 0, wheat: 0 });
  });

  it("enforces the distance rule after setup", () => {
    const { s, y } = withTwoRoads();
    expectReject(s, { type: "BUILD_SETTLEMENT", vertex: y }, "ILLEGAL_PLACEMENT");
  });

  it("requires one of your roads to touch the vertex", () => {
    const s = give(base(), "p0", SETTLEMENT_COST);
    const far = v(h(-2, 2), h(-1, 2), h(-1, 1));
    expectReject(s, { type: "BUILD_SETTLEMENT", vertex: far }, "ILLEGAL_PLACEMENT");
  });

  it("stops at 5 settlements", () => {
    let { s, z } = withTwoRoads();
    const spots = [
      v(h(-2, 2), h(-1, 2), h(-1, 1)),
      v(h(0, -2), h(-1, -1), h(0, -1)),
      v(h(-2, 0), h(-2, 1), h(-1, 0)),
      v(h(0, 2), h(1, 1), h(0, 1)),
    ];
    for (const vertex of spots) s = withPiece(s, "settlement", "p0", { vertex });
    expectReject(s, { type: "BUILD_SETTLEMENT", vertex: z }, "PIECE_LIMIT");
  });
});

describe("BUILD_CITY", () => {
  it("replaces your settlement, returns it to supply and pays the bank", () => {
    let s = give(base(), "p0", CITY_COST);
    s = act(s, "p0", { type: "BUILD_CITY", vertex: X });
    expect(countPieces(s, "p0", "settlement")).toBe(0);
    expect(countPieces(s, "p0", "city")).toBe(1);
    expect(hand(s, "p0")).toMatchObject({ wheat: 0, ore: 0 });
  });

  it("rejects upgrading a vertex without your settlement", () => {
    let s = give(base(), "p0", CITY_COST);
    const other = v(h(-2, 2), h(-1, 2), h(-1, 1));
    expectReject(s, { type: "BUILD_CITY", vertex: other }, "ILLEGAL_PLACEMENT");
    s = withPiece(s, "settlement", "p1", { vertex: other });
    expectReject(s, { type: "BUILD_CITY", vertex: other }, "ILLEGAL_PLACEMENT");
  });

  it("rejects upgrading without the resources", () => {
    expectReject(base(), { type: "BUILD_CITY", vertex: X }, "CANNOT_AFFORD");
  });
});

describe("turn flow", () => {
  it("END_TURN passes play to the next seat, who must roll", () => {
    const s = act(inMainPhase(newGame()), "p0", { type: "END_TURN" });
    expect(s.turn).toEqual({ number: 2, activePlayer: "p1" });
    expect(s.decisions.at(-1)!).toMatchObject({ kind: "ROLL", pendingFrom: ["p1"] });
  });

  it("the last seat passes back to the first", () => {
    const s = act(inMainPhase(newGame(), "p2"), "p2", { type: "END_TURN" });
    expect(s.turn.activePlayer).toBe("p0");
  });

  it("ROLL moves to the main step and can't be repeated", () => {
    let s = act(inMainPhase(newGame()), "p0", { type: "END_TURN" });
    s = act(s, "p1", { type: "ROLL" });
    expect(s.decisions.at(-1)!.kind).toBe("MAIN");
    const res = apply(s, "p1", { type: "ROLL" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("WRONG_DECISION");
  });

  it("other players can't build during someone else's turn", () => {
    const s = give(base(), "p1", ROAD_COST);
    const res = apply(s, "p1", { type: "BUILD_ROAD", edge: edgesOf(s, X)[0]! });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NOT_YOUR_TURN");
  });
});
