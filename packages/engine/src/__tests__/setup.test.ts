import { describe, it, expect } from "vitest";
import { apply, legalActions } from "../engine";
import { act, e, h, hand, newGame, topActor, v } from "./testkit";

// Six settlement spots far enough apart for a scripted 3-player setup.
const A = v(h(0, 0), h(1, 0), h(1, -1)); // desert, forest(1,0), hills(1,-1)
const V_A = v(h(-2, 2), h(-1, 2), h(-1, 1));
const V_B = v(h(0, -2), h(-1, -1), h(0, -1));
const V_C = v(h(2, 0), h(3, -1), h(2, -1));
const V_D = v(h(-2, 0), h(-2, 1), h(-1, 0));
const V_E = v(h(0, 2), h(1, 1), h(0, 1)); // pasture, fields, forest

describe("createGame", () => {
  const s = newGame();

  it("fills the bank with 19 of each resource and leaves hands empty", () => {
    expect(s.zones["bank"]!.contents).toEqual({
      wood: 19,
      brick: 19,
      sheep: 19,
      wheat: 19,
      ore: 19,
    });
    for (const p of s.players) expect(Object.values(hand(s, p)).every((n) => n === 0)).toBe(true);
  });

  it("starts the robber on the desert", () => {
    const robber = Object.values(s.pieces).find((p) => p.type === "robber");
    expect(robber?.at).toEqual({ hex: "0,0" });
  });

  it("asks p0 to place a settlement first", () => {
    const top = s.decisions.at(-1)!;
    expect(top.kind).toBe("PLACE_SETTLEMENT");
    expect(top.pendingFrom).toEqual(["p0"]);
    expect(s.turn.activePlayer).toBe("p0");
  });
});

describe("setup", () => {
  it("runs in snake order: settlement + road each, 1→N then N→1, then p0 rolls", () => {
    let s = newGame();
    const order: string[] = [];
    while (s.decisions.at(-1)!.kind !== "ROLL") {
      const p = topActor(s);
      order.push(`${p}:${s.decisions.at(-1)!.kind}`);
      s = act(s, p, legalActions(s, p)[0]!);
    }
    expect(order).toEqual([
      "p0:PLACE_SETTLEMENT",
      "p0:PLACE_ROAD",
      "p1:PLACE_SETTLEMENT",
      "p1:PLACE_ROAD",
      "p2:PLACE_SETTLEMENT",
      "p2:PLACE_ROAD",
      "p2:PLACE_SETTLEMENT",
      "p2:PLACE_ROAD",
      "p1:PLACE_SETTLEMENT",
      "p1:PLACE_ROAD",
      "p0:PLACE_SETTLEMENT",
      "p0:PLACE_ROAD",
    ]);
    expect(s.decisions.at(-1)!.pendingFrom).toEqual(["p0"]);
    expect(s.turn).toEqual({ number: 1, activePlayer: "p0" });
  });

  it("second settlement grants one resource per adjacent producing hex; first grants none", () => {
    let s = newGame();
    const script: [string, string][] = [
      ["p0", V_A],
      ["p1", V_B],
      ["p2", V_C],
      ["p2", V_D],
      ["p1", V_E],
      ["p0", A],
    ];
    for (const [p, vertex] of script) {
      s = act(s, p, { type: "PLACE_SETTLEMENT", vertex });
      s = act(s, p, legalActions(s, p)[0]!); // any legal road
    }
    // p0's second settlement touches desert (nothing), forest and hills
    expect(hand(s, "p0")).toMatchObject({ wood: 1, brick: 1, sheep: 0, wheat: 0, ore: 0 });
    // p1's second settlement touches pasture, fields and forest
    expect(hand(s, "p1")).toMatchObject({ wood: 1, brick: 0, sheep: 1, wheat: 1, ore: 0 });
    expect(s.zones["bank"]!.contents["wood"]).toBe(17);
  });

  it("enforces the distance rule", () => {
    let s = newGame();
    s = act(s, "p0", { type: "PLACE_SETTLEMENT", vertex: A });
    s = act(s, "p0", legalActions(s, "p0")[0]!);
    const neighbour = v(h(0, 0), h(1, -1), h(0, -1)); // shares an edge with A
    const res = apply(s, "p1", { type: "PLACE_SETTLEMENT", vertex: neighbour });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("ILLEGAL_PLACEMENT");
  });

  it("requires the setup road to touch the settlement just placed", () => {
    let s = newGame();
    s = act(s, "p0", { type: "PLACE_SETTLEMENT", vertex: A });
    const far = e(h(-2, 2), h(-1, 2));
    const res = apply(s, "p0", { type: "PLACE_ROAD", edge: far });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("ILLEGAL_PLACEMENT");
    for (const a of legalActions(s, "p0")) {
      expect(a.type).toBe("PLACE_ROAD");
      if (a.type === "PLACE_ROAD") expect(s.graph.edges.get(a.edge)!.vertices).toContain(A);
    }
  });

  it("rejects a player acting out of turn", () => {
    const res = apply(newGame(), "p1", { type: "PLACE_SETTLEMENT", vertex: A });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NOT_YOUR_TURN");
  });

  it("rejects an action the top decision doesn't allow", () => {
    const res = apply(newGame(), "p0", { type: "ROLL" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("WRONG_DECISION");
  });

  it("rejects a vertex that isn't on the board", () => {
    const res = apply(newGame(), "p0", { type: "PLACE_SETTLEMENT", vertex: "nope" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("ILLEGAL_PLACEMENT");
  });
});
