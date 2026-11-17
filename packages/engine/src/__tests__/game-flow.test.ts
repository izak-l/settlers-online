import { describe, expect, it } from "vitest";
import { apply, createGame, defaultAction, legalActions } from "../engine";
import type { GameEvent, GameState } from "../types";
import {
  act,
  fixtureMap,
  inMainPhase,
  newGame,
  seedRolling,
  setHand,
  inRollPhase,
  topActor,
} from "./testkit";

const SEATS = ["p0", "p1", "p2", "p3"];

function rollOffGame(seed: string): GameState {
  return createGame({ ...fixtureMap(), firstPlayer: "roll" }, { modules: ["base"] }, SEATS, seed);
}

/** Play the roll-off as the server does (system actor); returns the state and its events. */
function rollOff(seed: string): { state: GameState; events: GameEvent[] } {
  const s = rollOffGame(seed);
  const res = apply(s, "system", { type: "ROLL_FOR_ORDER" });
  if (!res.ok) throw new Error(res.message);
  return { state: res.state, events: res.events };
}

const firstOf = (events: GameEvent[]) =>
  events.find((e) => e.type === "FIRST_PLAYER")!.data!["player"] as string;

/** Who places in setup, in order (settlement steps only). */
function setupOrder(state: GameState): string[] {
  const order: string[] = [];
  let s = state;
  while (s.decisions.at(-1)?.kind !== "ROLL") {
    const p = topActor(s);
    if (s.decisions.at(-1)!.kind === "PLACE_SETTLEMENT") order.push(p);
    s = act(s, p, legalActions(s, p)[0]!);
  }
  return order;
}

describe("roll-off for the first player (spec 231)", () => {
  it("starts with a roll-off only when the map asks for one", () => {
    expect(newGame(SEATS).decisions.at(-1)!.kind).toBe("PLACE_SETTLEMENT");
    const s = rollOffGame("any");
    expect(s.decisions.at(-1)!.kind).toBe("ROLL_FOR_ORDER");
    expect(legalActions(s, "p0")).toEqual([{ type: "ROLL_FOR_ORDER" }]);
    expect(defaultAction(s, "p0")).toEqual({ type: "ROLL_FOR_ORDER" });
  });

  it("logs every roll; the highest goes first and setup snakes on from them", () => {
    // Find a seed where someone other than p0 wins, so the rotation shows.
    let found: { state: GameState; events: GameEvent[] } | undefined;
    for (let i = 0; i < 200 && !found; i++) {
      const r = rollOff(`order-${i}`);
      if (firstOf(r.events) === "p2") found = r;
    }
    const { state, events } = found!;
    const rolls = events.filter((e) => e.type === "ROLLED_FOR_ORDER");
    expect(rolls.length).toBeGreaterThanOrEqual(4);
    expect(rolls.slice(0, 4).map((e) => e.data!["player"])).toEqual(SEATS);
    expect(rolls[0]!.text).toMatch(/^p0 rolled \d+/);
    expect(events.at(-1)!.text).toBe("p2 goes first");
    expect(state.turn.activePlayer).toBe("p2");
    expect(setupOrder(state)).toEqual(["p2", "p3", "p0", "p1", "p1", "p0", "p3", "p2"]);
  });

  it("makes tied players roll again among themselves", () => {
    let found: GameEvent[] | undefined;
    for (let i = 0; i < 500 && !found; i++) {
      const { events } = rollOff(`tie-${i}`);
      if (events.some((e) => e.type === "ROLLED_FOR_ORDER" && e.data!["round"] === 2))
        found = events;
    }
    const rolls = found!.filter((e) => e.type === "ROLLED_FOR_ORDER");
    const first = rolls.filter((e) => e.data!["round"] === 1);
    const best = Math.max(...first.map((e) => e.data!["total"] as number));
    const tied = first.filter((e) => e.data!["total"] === best).map((e) => e.data!["player"]);
    expect(tied.length).toBeGreaterThan(1);
    const second = rolls.filter((e) => e.data!["round"] === 2).map((e) => e.data!["player"]);
    expect(second).toEqual(tied);
    expect(found!.some((e) => e.type === "TIED_FOR_ORDER")).toBe(true);
    expect(tied).toContain(firstOf(found!));
  });

  it("is deterministic: the same seed gives the same first player", () => {
    expect(firstOf(rollOff("same").events)).toBe(firstOf(rollOff("same").events));
  });
});

describe("decision clocks (spec 231)", () => {
  it("marks the roll, setup placements, the robber and stealing", () => {
    const s = newGame(SEATS);
    const top = s.decisions.at(-1)!;
    expect([top.kind, top.timer, top.data?.["round"]]).toEqual(["PLACE_SETTLEMENT", "setup", 1]);
    expect(s.decisions[0]).toMatchObject({ kind: "ROLL", timer: "roll" });
    let r = inRollPhase(newGame(SEATS, seedRolling(7, SEATS)));
    r = setHand(r, "p1", { wood: 1 });
    r = act(r, "p0", { type: "ROLL" });
    expect(r.decisions.at(-1)).toMatchObject({ kind: "MOVE_ROBBER", timer: "robber" });
  });
});

describe("trade responses (spec 231)", () => {
  function offered(): GameState {
    let s = inMainPhase(newGame(SEATS));
    s = setHand(s, "p0", { wood: 2 });
    for (const p of ["p1", "p2", "p3"]) s = setHand(s, p, { ore: 1 });
    return act(s, "p0", { type: "OFFER_TRADE", give: { wood: 1 }, want: { ore: 1 } });
  }

  it("refuses a repeated response, but lets a player change their mind", () => {
    let s = act(offered(), "p1", { type: "RESPOND_TRADE", accept: false });
    expect(apply(s, "p1", { type: "RESPOND_TRADE", accept: false })).toMatchObject({
      ok: false,
      code: "INVALID_TRADE",
    });
    expect(legalActions(s, "p1")).toEqual([{ type: "RESPOND_TRADE", accept: true }]);
    s = act(s, "p1", { type: "RESPOND_TRADE", accept: true });
    expect(apply(s, "p1", { type: "RESPOND_TRADE", accept: true }).ok).toBe(false);
  });

  it("marks the offer to expire once everyone else has declined; the timeout withdraws it", () => {
    let s = offered();
    for (const p of ["p1", "p2"]) s = act(s, p, { type: "RESPOND_TRADE", accept: false });
    expect(s.decisions.at(-1)!.timer).toBeUndefined();
    s = act(s, "p3", { type: "RESPOND_TRADE", accept: false });
    expect(s.decisions.at(-1)!.timer).toBe("expire");
    expect(defaultAction(s, s.decisions.at(-1)!.pendingFrom[0]!)).toEqual({ type: "CANCEL_TRADE" });
    const withdrawn = act(s, "system", { type: "CANCEL_TRADE" });
    expect(withdrawn.decisions.at(-1)!.kind).toBe("MAIN");
    // Changing your mind takes the timer off again.
    const back = act(s, "p2", { type: "RESPOND_TRADE", accept: true });
    expect(back.decisions.at(-1)!.timer).toBeUndefined();
  });
});

describe("trade responses: fuzz regressions (spec 231)", () => {
  it("stops waiting on a player who declined and can't afford to accept", () => {
    let s = inMainPhase(newGame(SEATS));
    s = setHand(s, "p0", { wood: 1 });
    s = setHand(s, "p1", { ore: 1 });
    s = act(s, "p0", { type: "OFFER_TRADE", give: { wood: 1 }, want: { ore: 1 } });
    // p2 has no ore: after declining, nothing is left for them to do.
    s = act(s, "p2", { type: "RESPOND_TRADE", accept: false });
    expect(s.decisions.at(-1)!.pendingFrom).toEqual(["p0", "p1", "p3"]);
    s = act(s, "p1", { type: "RESPOND_TRADE", accept: false });
    expect(s.decisions.at(-1)!.pendingFrom).toEqual(["p0", "p1", "p3"]);
    for (const p of s.decisions.at(-1)!.pendingFrom)
      expect(legalActions(s, p).length).toBeGreaterThan(0);
  });
});

describe("discards in the log (spec 231)", () => {
  it("names the discarded cards, for everyone", () => {
    let s = inRollPhase(newGame(SEATS, seedRolling(7, SEATS)));
    s = setHand(s, "p1", { wood: 5, ore: 3 });
    s = act(s, "p0", { type: "ROLL" });
    const res = apply(s, "p1", { type: "DISCARD", resources: { wood: 2, ore: 2 } });
    if (!res.ok) throw new Error(res.message);
    const ev = res.events.find((e) => e.type === "DISCARDED")!;
    expect(ev.text).toBe("p1 discarded 2 wood, 2 ore");
    expect(ev.data).toMatchObject({ count: 4, resources: { wood: 2, ore: 2 } });
    expect(ev.visibleTo).toBeUndefined();
    expect(ev.hiddenFrom).toBeUndefined();
  });
});
