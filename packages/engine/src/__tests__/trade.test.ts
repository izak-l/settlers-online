import { describe, expect, it } from "vitest";
import { apply, defaultAction, legalActions } from "../engine";
import type { GameState } from "../types";
import { act, give, h, hand, inMainPhase, inRollPhase, newGame, v, withPiece } from "./testkit";

const X = v(h(0, 0), h(1, 0), h(1, -1));

function expectReject(
  s: GameState,
  player: string,
  action: Parameters<typeof apply>[2],
  code: string,
) {
  const res = apply(s, player, action);
  expect(res.ok, `${action.type} should be rejected`).toBe(false);
  if (!res.ok) expect(res.code).toBe(code);
}

/** p0 owns a settlement at X, and one of X's edges is a port of `type`. */
function withPort(type: string): GameState {
  let s = withPiece(inMainPhase(newGame()), "settlement", "p0", { vertex: X });
  s = { ...s, map: { ...s.map, ports: [{ edgeId: s.graph.vertices.get(X)!.edges[0]!, type }] } };
  return s;
}

describe("trading with the bank", () => {
  it("is 4:1 by default", () => {
    let s = give(inMainPhase(newGame()), "p0", { wood: 4 });
    s = act(s, "p0", { type: "BANK_TRADE", give: "wood", get: "ore" });
    expect(hand(s, "p0")).toMatchObject({ wood: 0, ore: 1 });
    expect(s.zones["bank"]!.contents).toMatchObject({ wood: 19, ore: 18 });
  });

  it("is 3:1 for anything with a building on a generic port", () => {
    let s = give(withPort("any3to1"), "p0", { brick: 3 });
    s = act(s, "p0", { type: "BANK_TRADE", give: "brick", get: "wheat" });
    expect(hand(s, "p0")).toMatchObject({ brick: 0, wheat: 1 });
  });

  it("is 2:1 for that resource only on a specific port", () => {
    let s = give(withPort("wood2to1"), "p0", { wood: 2, sheep: 3 });
    s = act(s, "p0", { type: "BANK_TRADE", give: "wood", get: "ore" });
    expect(hand(s, "p0")).toMatchObject({ wood: 0, ore: 1 });
    expectReject(s, "p0", { type: "BANK_TRADE", give: "sheep", get: "ore" }, "CANNOT_AFFORD"); // still 4:1
  });

  it("a port you don't have a building on doesn't count", () => {
    const s = give(withPort("any3to1"), "p1", { brick: 3 });
    const mine = withPiece(inMainPhase(s, "p1"), "settlement", "p2", {
      vertex: v(h(-2, 2), h(-1, 2), h(-1, 1)),
    });
    expectReject(mine, "p1", { type: "BANK_TRADE", give: "brick", get: "wheat" }, "CANNOT_AFFORD");
  });

  it("rejects same-for-same, an empty bank, and trading before rolling", () => {
    let s = give(inMainPhase(newGame()), "p0", { wood: 8 });
    expectReject(s, "p0", { type: "BANK_TRADE", give: "wood", get: "wood" }, "INVALID_TRADE");
    expectReject(s, "p0", { type: "BANK_TRADE", give: "wood", get: "gold" }, "INVALID_TRADE");
    s = give(s, "p1", { ore: 19 });
    expectReject(s, "p0", { type: "BANK_TRADE", give: "wood", get: "ore" }, "BANK_EMPTY");
    const early = give(inRollPhase(newGame()), "p0", { wood: 4 });
    expectReject(early, "p0", { type: "BANK_TRADE", give: "wood", get: "ore" }, "WRONG_DECISION");
  });

  it("legalActions lists only the trades you can afford", () => {
    const s = give(inMainPhase(newGame()), "p0", { wood: 4, ore: 3 });
    const trades = legalActions(s, "p0").filter((a) => a.type === "BANK_TRADE");
    expect(trades).toHaveLength(4); // wood → each of the other four
    expect(trades.every((a) => a.type === "BANK_TRADE" && a.give === "wood")).toBe(true);
  });
});

describe("trading with players", () => {
  function offered() {
    let s = give(inMainPhase(newGame()), "p0", { wood: 2 });
    s = give(s, "p1", { ore: 1 });
    return act(s, "p0", { type: "OFFER_TRADE", give: { wood: 1 }, want: { ore: 1 } });
  }

  it("the active player makes an offer; others accept or decline; the offerer picks who", () => {
    let s = offered();
    expect(s.decisions.at(-1)).toMatchObject({ kind: "TRADE_OFFER" });
    expectReject(s, "p2", { type: "RESPOND_TRADE", accept: true }, "CANNOT_AFFORD"); // p2 has no ore
    s = act(s, "p2", { type: "RESPOND_TRADE", accept: false });
    s = act(s, "p1", { type: "RESPOND_TRADE", accept: true });
    expectReject(s, "p0", { type: "CONFIRM_TRADE", with: "p2" }, "INVALID_TRADE");
    const res = apply(s, "p0", { type: "CONFIRM_TRADE", with: "p1" });
    if (!res.ok) throw new Error(res.code);
    expect(res.events.find((e) => e.type === "TRADED")!.data).toMatchObject({
      from: "p0",
      with: "p1",
    });
    s = res.state;
    expect(hand(s, "p0")).toMatchObject({ wood: 1, ore: 1 });
    expect(hand(s, "p1")).toMatchObject({ wood: 1, ore: 0 });
    expect(s.decisions.map((d) => d.kind)).toEqual(["MAIN"]);
  });

  it("responders can change their answer until the offerer confirms", () => {
    let s = offered();
    s = act(s, "p1", { type: "RESPOND_TRADE", accept: true });
    s = act(s, "p1", { type: "RESPOND_TRADE", accept: false });
    expectReject(s, "p0", { type: "CONFIRM_TRADE", with: "p1" }, "INVALID_TRADE");
  });

  it("only the offerer confirms or cancels; the offerer can't respond", () => {
    let s = offered();
    expectReject(s, "p1", { type: "CANCEL_TRADE" }, "INVALID_TRADE");
    expectReject(s, "p0", { type: "RESPOND_TRADE", accept: true }, "INVALID_TRADE");
    s = act(s, "p0", { type: "CANCEL_TRADE" });
    expect(s.decisions.map((d) => d.kind)).toEqual(["MAIN"]);
    expect(hand(s, "p0")["wood"]).toBe(2);
  });

  it("no gifts: both sides give at least one card, and nothing on both sides", () => {
    const s = give(inMainPhase(newGame()), "p0", { wood: 2 });
    expectReject(s, "p0", { type: "OFFER_TRADE", give: {}, want: { ore: 1 } }, "INVALID_TRADE");
    expectReject(s, "p0", { type: "OFFER_TRADE", give: { wood: 1 }, want: {} }, "INVALID_TRADE");
    expectReject(
      s,
      "p0",
      { type: "OFFER_TRADE", give: { wood: 1 }, want: { wood: 1 } },
      "INVALID_TRADE",
    );
    expectReject(
      s,
      "p0",
      { type: "OFFER_TRADE", give: { wood: 3 }, want: { ore: 1 } },
      "CANNOT_AFFORD",
    );
  });

  it("only the active player can start a trade, and only in the main step", () => {
    const s = give(inMainPhase(newGame()), "p1", { wood: 1 });
    expectReject(
      s,
      "p1",
      { type: "OFFER_TRADE", give: { wood: 1 }, want: { ore: 1 } },
      "NOT_YOUR_TURN",
    );
    const early = give(inRollPhase(newGame()), "p0", { wood: 1 });
    expectReject(
      early,
      "p0",
      { type: "OFFER_TRADE", give: { wood: 1 }, want: { ore: 1 } },
      "WRONG_DECISION",
    );
  });

  it("confirming re-checks that both sides still have the cards", () => {
    let s = offered();
    s = act(s, "p1", { type: "RESPOND_TRADE", accept: true });
    s = give(s, "p2", { ore: 0 });
    // p1 loses the ore some other way (simulated): the trade can no longer go through.
    s.zones["hand-p1"]!.contents["ore"] = 0;
    s.zones["bank"]!.contents["ore"] = 19;
    expectReject(s, "p0", { type: "CONFIRM_TRADE", with: "p1" }, "INVALID_TRADE");
  });

  it("timeouts cancel the offer for the offerer and decline for everyone else", () => {
    const s = offered();
    expect(defaultAction(s, "p0")).toEqual({ type: "CANCEL_TRADE" });
    expect(defaultAction(s, "p1")).toEqual({ type: "RESPOND_TRADE", accept: false });
  });
});

describe("timeout defaults outside trades", () => {
  it("roll when waiting to roll, end the turn in the main step", () => {
    expect(defaultAction(inRollPhase(newGame()), "p0")).toEqual({ type: "ROLL" });
    expect(defaultAction(inMainPhase(newGame()), "p0")).toEqual({ type: "END_TURN" });
  });
});
