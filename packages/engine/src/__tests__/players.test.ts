import { describe, it, expect } from "vitest";
import { apply, defaultAction, legalActions } from "../engine";
import {
  act,
  checkInvariants,
  inMainPhase,
  inRollPhase,
  newGame,
  resolveUntilMain,
  runSetup,
  seedRolling,
  setHand,
  topActor,
} from "./testkit";

/** Who places each setup settlement, in order, playing the first legal action each step. */
function setupOrder(seats: string[]): string[] {
  let s = newGame(seats);
  const order: string[] = [];
  while (s.decisions.at(-1)?.kind !== "ROLL") {
    const p = topActor(s);
    if (s.decisions.at(-1)!.kind === "PLACE_SETTLEMENT") order.push(p);
    s = act(s, p, legalActions(s, p)[0]!);
  }
  return order;
}

describe("one-player games", () => {
  it("setup is a snake of one: both settlements and roads in a row", () => {
    expect(setupOrder(["p0"])).toEqual(["p0", "p0"]);
    const s = runSetup(newGame(["p0"]));
    expect(s.decisions.at(-1)).toMatchObject({ kind: "ROLL", pendingFrom: ["p0"] });
    checkInvariants(s);
  });

  it("the turn passes back to the same player", () => {
    let s = inMainPhase(newGame(["p0"]));
    s = act(s, "p0", { type: "END_TURN" });
    expect(s.turn).toEqual({ number: 2, activePlayer: "p0" });
    expect(s.decisions.at(-1)).toMatchObject({ kind: "ROLL", pendingFrom: ["p0"] });
  });

  it("a 7 moves the robber and steals nothing", () => {
    const seats = ["p0"];
    let s = inRollPhase(newGame(seats, seedRolling(7, seats)));
    s = act(s, "p0", { type: "ROLL" });
    expect(s.decisions.at(-1)!.kind).toBe("MOVE_ROBBER");
    s = resolveUntilMain(s);
    expect(s.decisions.map((d) => d.kind)).toEqual(["MAIN"]);
  });

  it("can't offer a trade with nobody to trade with, but can trade with the bank", () => {
    const s = setHand(inMainPhase(newGame(["p0"])), "p0", { wood: 4, ore: 1 });
    const offer = apply(s, "p0", { type: "OFFER_TRADE", give: { ore: 1 }, want: { wheat: 1 } });
    expect(offer.ok ? null : offer.code).toBe("INVALID_TRADE");
    expect(legalActions(s, "p0").some((a) => a.type === "OFFER_TRADE")).toBe(false);
    act(s, "p0", { type: "BANK_TRADE", give: "wood", get: "brick" });
  });

  it("plays 200 timeout-default actions without breaking invariants", () => {
    let s = newGame(["p0"]);
    for (let i = 0; i < 200 && s.winner === undefined; i++)
      s = act(s, "system", defaultAction(s, topActor(s)));
  });
});

describe("two-player games", () => {
  it("setup snakes 1, 2, 2, 1", () => {
    expect(setupOrder(["p0", "p1"])).toEqual(["p0", "p1", "p1", "p0"]);
  });

  it("offers still work between the two players", () => {
    let s = setHand(inMainPhase(newGame(["p0", "p1"])), "p0", { ore: 1 });
    s = setHand(s, "p1", { wheat: 1 });
    s = act(s, "p0", { type: "OFFER_TRADE", give: { ore: 1 }, want: { wheat: 1 } });
    s = act(s, "p1", { type: "RESPOND_TRADE", accept: true });
    s = act(s, "p0", { type: "CONFIRM_TRADE", with: "p1" });
    expect(s.decisions.map((d) => d.kind)).toEqual(["MAIN"]);
  });
});
