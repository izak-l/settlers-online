import { describe, expect, it } from "vitest";
import { apply, computeVP, legalActions, viewFor } from "../engine";
import type { GameState } from "../types";
import {
  act,
  countPieces,
  e,
  give,
  giveDev,
  h,
  hand,
  inMainPhase,
  inRollPhase,
  newGame,
  v,
  withPiece,
} from "./testkit";

const DEV_COST = { sheep: 1, wheat: 1, ore: 1 };
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
const zone = (s: GameState, id: string) => s.zones[id]!.contents;
const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

describe("the dev card deck", () => {
  it("starts with 25 hidden cards: 14 knights, 5 VP, 2 each of the rest", () => {
    const s = newGame();
    expect(zone(s, "devdeck")).toEqual({
      knight: 14,
      victoryPoint: 5,
      roadBuilding: 2,
      yearOfPlenty: 2,
      monopoly: 2,
    });
    expect(s.zones["devdeck"]!.visibility).toBe("hidden");
    expect(viewFor(s, "p0").zones["devdeck"]).toEqual({
      id: "devdeck",
      visibility: "hidden",
      count: 25,
    });
  });
});

describe("BUY_DEV_CARD", () => {
  it("costs sheep, wheat and ore, draws one card, and only the buyer learns which", () => {
    const s0 = give(inMainPhase(newGame()), "p0", DEV_COST);
    const res = apply(s0, "p0", { type: "BUY_DEV_CARD" });
    if (!res.ok) throw new Error(res.code);
    const s = res.state;
    expect(total(hand(s, "p0"))).toBe(0);
    expect(total(zone(s, "devdeck"))).toBe(24);
    expect(total(zone(s, "devnew-p0"))).toBe(1);
    expect(viewFor(s, "p1").zones["devnew-p0"]).toMatchObject({ count: 1 });
    expect(viewFor(s, "p1").zones["devnew-p0"]!.contents).toBeUndefined();
    const secret = res.events.find((ev) => ev.visibleTo)!;
    expect(secret.visibleTo).toEqual(["p0"]);
  });

  it("needs the resources, and a card left in the deck", () => {
    expectReject(inMainPhase(newGame()), "p0", { type: "BUY_DEV_CARD" }, "CANNOT_AFFORD");
    let s = give(inMainPhase(newGame()), "p0", DEV_COST);
    s = giveDev(s, "p1", {
      knight: 14,
      victoryPoint: 5,
      roadBuilding: 2,
      yearOfPlenty: 2,
      monopoly: 2,
    });
    expectReject(s, "p0", { type: "BUY_DEV_CARD" }, "BANK_EMPTY");
  });

  it("a VP card counts for its owner straight away, but not in anyone else's view of the score", () => {
    const s = giveDev(inMainPhase(newGame()), "p0", { victoryPoint: 1 }, "devnew");
    expect(computeVP(s, "p0")).toBe(1);
    expect(computeVP(s, "p0", "p0")).toBe(1);
    expect(computeVP(s, "p0", "p1")).toBe(0);
    expect(computeVP(s, "p0", "spectator")).toBe(0);
  });
});

describe("playing dev cards", () => {
  it("can't play a card bought this turn; can after the turn ends", () => {
    let s = giveDev(inMainPhase(newGame()), "p0", { knight: 1 }, "devnew");
    expectReject(s, "p0", { type: "PLAY_KNIGHT" }, "INVALID_CHOICE");
    s = act(s, "p0", { type: "END_TURN" });
    expect(zone(s, "dev-p0")).toMatchObject({ knight: 1 });
    expect(total(zone(s, "devnew-p0"))).toBe(0);
  });

  it("allows one per turn", () => {
    let s = giveDev(inMainPhase(newGame()), "p0", { monopoly: 2 });
    s = act(s, "p0", { type: "PLAY_MONOPOLY", resource: "ore" });
    expectReject(s, "p0", { type: "PLAY_MONOPOLY", resource: "wood" }, "INVALID_CHOICE");
    // The limit resets next turn.
    s = act(s, "p0", { type: "END_TURN" });
    s = act(s, "p1", { type: "ROLL" });
    while (s.decisions.at(-1)!.kind !== "MAIN") {
      const p = s.decisions.at(-1)!.pendingFrom[0]!;
      s = act(s, p, legalActions(s, p)[0]!);
    }
    expect(s.moduleState["base"]).toMatchObject({ playedDevThisTurn: false });
  });

  it("other players can't play cards on your turn", () => {
    const s = giveDev(inMainPhase(newGame()), "p1", { knight: 1 });
    expectReject(s, "p1", { type: "PLAY_KNIGHT" }, "NOT_YOUR_TURN");
  });

  it("Knight: moves the robber (no discards), counts toward the army, and works before rolling", () => {
    let s = giveDev(inRollPhase(newGame()), "p0", { knight: 1 });
    s = give(s, "p1", { wood: 9 }); // 9 cards, but a knight doesn't make anyone discard
    s = act(s, "p0", { type: "PLAY_KNIGHT" });
    expect(s.decisions.map((d) => d.kind)).toEqual(["ROLL", "MOVE_ROBBER"]);
    expect(zone(s, "played-p0")).toMatchObject({ knight: 1 });
    s = act(s, "p0", { type: "MOVE_ROBBER", hex: "1,0" });
    expect(s.decisions.map((d) => d.kind)).toEqual(["ROLL"]);
    expectReject(s, "p0", { type: "PLAY_KNIGHT" }, "INVALID_CHOICE"); // nothing left to play
  });

  it("Road Building: two free roads that follow the normal placement rules", () => {
    let s = withPiece(inMainPhase(newGame()), "settlement", "p0", { vertex: X });
    s = giveDev(s, "p0", { roadBuilding: 1 });
    s = act(s, "p0", { type: "PLAY_ROAD_BUILDING" });
    expect(s.decisions.at(-1)).toMatchObject({ kind: "PLACE_FREE_ROAD", data: { remaining: 2 } });
    const far = e(h(-2, 2), h(-1, 2));
    expectReject(s, "p0", { type: "PLACE_FREE_ROAD", edge: far }, "ILLEGAL_PLACEMENT");
    const first = legalActions(s, "p0")[0]!;
    s = act(s, "p0", first);
    s = act(s, "p0", legalActions(s, "p0")[0]!);
    expect(countPieces(s, "p0", "road")).toBe(2);
    expect(total(hand(s, "p0"))).toBe(0);
    expect(s.decisions.map((d) => d.kind)).toEqual(["MAIN"]);
  });

  it("Road Building with one road left places just one", () => {
    let s = withPiece(inMainPhase(newGame()), "settlement", "p0", { vertex: X });
    const edges = [...s.graph.edges.keys()];
    for (let i = 0; i < 14; i++) s = withPiece(s, "road", "p0", { edge: edges[i + 30]! });
    s = giveDev(s, "p0", { roadBuilding: 1 });
    s = act(s, "p0", { type: "PLAY_ROAD_BUILDING" });
    expect(s.decisions.at(-1)!.data).toEqual({ remaining: 1 });
    s = act(s, "p0", legalActions(s, "p0")[0]!);
    expect(s.decisions.map((d) => d.kind)).toEqual(["MAIN"]);
  });

  it("Road Building with nowhere to build is played but places nothing", () => {
    let s = giveDev(inMainPhase(newGame()), "p0", { roadBuilding: 1 });
    s = act(s, "p0", { type: "PLAY_ROAD_BUILDING" });
    expect(s.decisions.map((d) => d.kind)).toEqual(["MAIN"]);
    expect(zone(s, "played-p0")).toMatchObject({ roadBuilding: 1 });
  });

  it("Year of Plenty: any two resources from the bank", () => {
    let s = giveDev(inMainPhase(newGame()), "p0", { yearOfPlenty: 1 });
    expect(legalActions(s, "p0").filter((a) => a.type === "PLAY_YEAR_OF_PLENTY")).toHaveLength(15);
    expectReject(s, "p0", { type: "PLAY_YEAR_OF_PLENTY", resources: { ore: 3 } }, "INVALID_CHOICE");
    expectReject(
      s,
      "p0",
      { type: "PLAY_YEAR_OF_PLENTY", resources: { gold: 2 } },
      "INVALID_CHOICE",
    );
    s = act(s, "p0", { type: "PLAY_YEAR_OF_PLENTY", resources: { ore: 1, wheat: 1 } });
    expect(hand(s, "p0")).toMatchObject({ ore: 1, wheat: 1 });
  });

  it("Year of Plenty can't take what the bank doesn't have", () => {
    let s = giveDev(inMainPhase(newGame()), "p0", { yearOfPlenty: 1 });
    s = give(s, "p1", { ore: 19 });
    expectReject(s, "p0", { type: "PLAY_YEAR_OF_PLENTY", resources: { ore: 2 } }, "INVALID_CHOICE");
  });

  it("Monopoly: takes every card of one resource from every other player", () => {
    let s = giveDev(inMainPhase(newGame()), "p0", { monopoly: 1 });
    s = give(s, "p1", { ore: 3, wood: 1 });
    s = give(s, "p2", { ore: 2 });
    const res = apply(s, "p0", { type: "PLAY_MONOPOLY", resource: "ore" });
    if (!res.ok) throw new Error(res.code);
    expect(hand(res.state, "p0")["ore"]).toBe(5);
    expect(hand(res.state, "p1")).toMatchObject({ ore: 0, wood: 1 });
    expect(res.events.some((ev) => ev.text.includes("5 ore"))).toBe(true);
  });

  it("VP cards can't be played", () => {
    const s = giveDev(inMainPhase(newGame()), "p0", { victoryPoint: 1 });
    expect(legalActions(s, "p0").some((a) => a.type.startsWith("PLAY_"))).toBe(false);
  });

  it("other players see only how many dev cards you hold", () => {
    const s = giveDev(inMainPhase(newGame()), "p0", { knight: 2, monopoly: 1 });
    expect(viewFor(s, "p1").zones["dev-p0"]).toMatchObject({ count: 3 });
    expect(viewFor(s, "p1").zones["dev-p0"]!.contents).toBeUndefined();
    expect(viewFor(s, "p0").zones["dev-p0"]!.contents).toEqual({ knight: 2, monopoly: 1 });
    expect(viewFor(s, "spectator").zones["played-p0"]!.contents).toBeDefined();
  });
});
