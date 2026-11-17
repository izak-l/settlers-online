import { describe, expect, it } from "vitest";
import { apply, createGame, defaultAction, legalActions } from "../engine";
import { eventVisibleTo, type GameState } from "../types";
import {
  act,
  checkInvariants,
  fixtureMap,
  h,
  hand,
  inRollPhase,
  newGame,
  seedRolling,
  setHand,
  v,
  withPiece,
} from "./testkit";

const SEATS = ["p0", "p1", "p2"];
// Corners of the forest hex (1,0) on the fixture, far apart from each other.
const P1_SPOT = v(h(1, 0), h(2, 0), h(2, -1));
const P2_SPOT = v(h(1, 0), h(0, 1), h(1, 1));

/** p0 is about to roll a 7, with the given hands. */
function aboutToRollSeven(hands: Record<string, Record<string, number>> = {}): GameState {
  let s = inRollPhase(newGame(SEATS, seedRolling(7)));
  for (const [p, res] of Object.entries(hands)) s = setHand(s, p, res);
  return s;
}

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

const robberHex = (s: GameState) => {
  const at = s.pieces["robber"]!.at;
  return "hex" in at ? at.hex : undefined;
};

describe("timer kinds (turn timers)", () => {
  it("marks discards as using the short clock; every other decision uses the turn clock", () => {
    let s = aboutToRollSeven({ p1: { wood: 5, ore: 4 } });
    expect(s.decisions.every((d) => d.timer === undefined)).toBe(true);
    s = act(s, "p0", { type: "ROLL" });
    expect(s.decisions.map((d) => [d.kind, d.timer])).toEqual([
      ["MAIN", undefined],
      ["MOVE_ROBBER", undefined],
      ["DISCARD", "short"],
    ]);
  });
});

describe("rolling a 7", () => {
  it("produces nothing and asks the roller to move the robber, then the main step", () => {
    const s = act(aboutToRollSeven(), "p0", { type: "ROLL" });
    expect(s.decisions.map((d) => d.kind)).toEqual(["MAIN", "MOVE_ROBBER"]);
    expect(s.decisions.at(-1)!.pendingFrom).toEqual(["p0"]);
  });

  it("makes everyone with 8+ cards discard half, rounded down, at the same time", () => {
    let s = aboutToRollSeven({
      p0: { wood: 7 },
      p1: { wood: 5, ore: 4 },
      p2: { sheep: 8 },
    });
    s = act(s, "p0", { type: "ROLL" });
    const top = s.decisions.at(-1)!;
    expect(top.kind).toBe("DISCARD");
    expect(top.pendingFrom).toEqual(["p1", "p2"]);
    expect(top.data).toEqual({ amounts: { p1: 4, p2: 4 } });

    // The roller has 7 and isn't asked.
    expectReject(s, "p0", { type: "DISCARD", resources: { wood: 3 } }, "NOT_YOUR_TURN");
    // Simultaneous: p2 can go before p1.
    s = act(s, "p2", { type: "DISCARD", resources: { sheep: 4 } });
    expect(s.decisions.at(-1)!.pendingFrom).toEqual(["p1"]);
    expect(hand(s, "p2")["sheep"]).toBe(4);

    expectReject(s, "p1", { type: "DISCARD", resources: { wood: 3 } }, "INVALID_CHOICE"); // too few
    expectReject(s, "p1", { type: "DISCARD", resources: { wheat: 4 } }, "INVALID_CHOICE"); // not held
    expectReject(s, "p1", { type: "DISCARD", resources: { wood: 5, ore: -1 } }, "INVALID_CHOICE");
    expectReject(s, "p1", { type: "DISCARD", resources: { gold: 4 } }, "INVALID_CHOICE");
    expectReject(s, "p2", { type: "DISCARD", resources: { sheep: 4 } }, "NOT_YOUR_TURN"); // already done

    s = act(s, "p1", { type: "DISCARD", resources: { wood: 2, ore: 2 } });
    expect(s.decisions.at(-1)!.kind).toBe("MOVE_ROBBER");
    expect(s.zones["bank"]!.contents).toMatchObject({
      wood: 19 - 7 - 3,
      sheep: 19 - 4,
      ore: 19 - 2,
    });
  });

  it("legalActions offers a valid example discard; defaultAction picks one apply accepts", () => {
    let s = aboutToRollSeven({ p1: { wood: 3, brick: 3, ore: 3 } });
    s = act(s, "p0", { type: "ROLL" });
    const [example] = legalActions(s, "p1");
    expect(example?.type).toBe("DISCARD");
    expect(apply(s, "p1", example!).ok).toBe(true);
    expect(apply(s, "system", defaultAction(s, "p1")).ok).toBe(true);
  });
});

describe("moving the robber", () => {
  it("must move to a different land hex", () => {
    const s = act(aboutToRollSeven(), "p0", { type: "ROLL" });
    const from = robberHex(s)!;
    expectReject(s, "p0", { type: "MOVE_ROBBER", hex: from }, "ILLEGAL_PLACEMENT");
    expectReject(s, "p0", { type: "MOVE_ROBBER", hex: "3,-3" }, "ILLEGAL_PLACEMENT"); // sea
    expectReject(s, "p0", { type: "MOVE_ROBBER", hex: "nowhere" }, "ILLEGAL_PLACEMENT");
    const options = legalActions(s, "p0");
    expect(options).toHaveLength(18);
    expect(options.every((a) => a.type === "MOVE_ROBBER" && a.hex !== from)).toBe(true);
  });

  it("goes straight to the main step when nobody there can be robbed", () => {
    let s = aboutToRollSeven({ p1: {} });
    s = withPiece(s, "settlement", "p1", { vertex: P1_SPOT }); // p1 has no cards
    s = withPiece(s, "settlement", "p0", { vertex: P2_SPOT }); // your own building doesn't count
    s = act(s, "p0", { type: "ROLL" });
    s = act(s, "p0", { type: "MOVE_ROBBER", hex: "1,0" });
    expect(robberHex(s)).toBe("1,0");
    expect(s.decisions.map((d) => d.kind)).toEqual(["MAIN"]);
  });

  it("steals automatically when only one player can be robbed", () => {
    let s = aboutToRollSeven({ p0: {}, p1: { ore: 2 } });
    s = withPiece(s, "settlement", "p1", { vertex: P1_SPOT });
    s = act(s, "p0", { type: "ROLL" });
    s = act(s, "p0", { type: "MOVE_ROBBER", hex: "1,0" });
    expect(hand(s, "p0")["ore"]).toBe(1);
    expect(hand(s, "p1")["ore"]).toBe(1);
    expect(s.decisions.map((d) => d.kind)).toEqual(["MAIN"]);
  });
});

describe("stealing", () => {
  function twoVictims() {
    let s = aboutToRollSeven({ p0: {}, p1: { wood: 1 }, p2: { brick: 1 } });
    s = withPiece(s, "settlement", "p1", { vertex: P1_SPOT });
    s = withPiece(s, "city", "p2", { vertex: P2_SPOT });
    s = act(s, "p0", { type: "ROLL" });
    return act(s, "p0", { type: "MOVE_ROBBER", hex: "1,0" });
  }

  it("lets the roller choose among players with a building there and cards in hand", () => {
    const s = twoVictims();
    const top = s.decisions.at(-1)!;
    expect(top.kind).toBe("STEAL");
    expect(top.data).toEqual({ victims: ["p1", "p2"] });
    expect(legalActions(s, "p0")).toEqual([
      { type: "STEAL", from: "p1" },
      { type: "STEAL", from: "p2" },
    ]);
    expectReject(s, "p0", { type: "STEAL", from: "p0" }, "INVALID_CHOICE");
  });

  it("moves one random card; only thief and victim learn which", () => {
    const s = twoVictims();
    const res = apply(s, "p0", { type: "STEAL", from: "p2" });
    if (!res.ok) throw new Error(res.code);
    checkInvariants(res.state);
    expect(hand(res.state, "p0")["brick"]).toBe(1);
    expect(hand(res.state, "p2")["brick"]).toBe(0);
    expect(res.state.decisions.map((d) => d.kind)).toEqual(["MAIN"]);

    const secret = res.events.find((e) => e.text.includes("brick"))!;
    expect(secret.visibleTo).toEqual(["p0", "p2"]);
    const publicEvent = res.events.find((e) => e.type === "STOLE" && !e.text.includes("brick"))!;
    expect(publicEvent.hiddenFrom).toEqual(["p0", "p2"]);
    expect(eventVisibleTo(publicEvent, "spectator")).toBe(true);
    expect(eventVisibleTo(secret, "spectator")).toBe(false);
    // Both name the players (public anyway); only the secret one names the resource.
    expect(secret.data).toEqual({ thief: "p0", victim: "p2", resource: "brick" });
    expect(publicEvent.data).toEqual({ thief: "p0", victim: "p2" });
  });

  it("defaultAction picks a victim apply accepts", () => {
    const s = twoVictims();
    expect(apply(s, "system", defaultAction(s, "p0")).ok).toBe(true);
  });
});

describe("discard limit (spec 229)", () => {
  /** p0 is about to roll a 7 on a game made from `map` / `options`, with the given hands. */
  function sevenWith(
    mapLimit: number | undefined,
    optionLimit: number | undefined,
    hands: Record<string, Record<string, number>>,
  ): GameState {
    const map = { ...fixtureMap(), ...(mapLimit === undefined ? {} : { discardLimit: mapLimit }) };
    const ruleset = {
      modules: ["base"],
      ...(optionLimit === undefined ? {} : { options: { discardLimit: optionLimit } }),
    };
    let s = inRollPhase(createGame(map, ruleset, SEATS, seedRolling(7)));
    for (const [p, res] of Object.entries(hands)) s = setHand(s, p, res);
    return s;
  }
  const discarding = (s: GameState) =>
    s.decisions.find((d) => d.kind === "DISCARD")?.data?.["amounts"] ?? {};

  it("defaults to 7 when neither the map nor the ruleset sets one", () => {
    const s = sevenWith(undefined, undefined, { p1: { wood: 8 }, p2: { wood: 7 } });
    expect(s.options.discardLimit).toBe(7);
    expect(discarding(act(s, "p0", { type: "ROLL" }))).toEqual({ p1: 4 });
  });

  it("uses the map's limit: with 9, an 8-card hand keeps its cards", () => {
    const s = act(sevenWith(9, undefined, { p1: { wood: 8 }, p2: { ore: 10 } }), "p0", {
      type: "ROLL",
    });
    expect(discarding(s)).toEqual({ p2: 5 });
  });

  it("lets the ruleset (the lobby) override the map: with 5, a 6-card hand discards 3", () => {
    const s = act(sevenWith(9, 5, { p1: { wood: 6 }, p2: { wood: 5 } }), "p0", { type: "ROLL" });
    expect(discarding(s)).toEqual({ p1: 3 });
  });

  it("treats a game saved before the option existed as 7", () => {
    const s = sevenWith(undefined, undefined, { p1: { wood: 8 } });
    delete (s.options as { discardLimit?: number }).discardLimit;
    expect(discarding(act(s, "p0", { type: "ROLL" }))).toEqual({ p1: 4 });
  });
});
