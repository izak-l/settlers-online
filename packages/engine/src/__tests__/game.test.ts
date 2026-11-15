import { describe, it, expect } from "vitest";
import type { Action } from "../actions";
import { apply, createGame, defaultAction, legalActions, viewFor } from "../engine";
import type { GameState, PlayerId } from "../types";
import { act, fixtureMap, give, inMainPhase, newGame, runSetup, topActor } from "./testkit";

const SEATS = ["p0", "p1", "p2", "p3"];

/**
 * Setup, then `turns` full turns. Each turn: roll, build the first legal thing
 * (up to 3 times), end the turn. Every action is checked against the invariants.
 */
function playScripted(
  turns: number,
  seed = "ten-turns",
): {
  state: GameState;
  log: [PlayerId, Action][];
} {
  const log: [PlayerId, Action][] = [];
  const step = (s: GameState, p: PlayerId, a: Action): GameState => {
    log.push([p, a]);
    return act(s, p, a);
  };

  let s = createGame(fixtureMap(), { modules: ["base"] }, SEATS, seed);
  while (s.decisions.at(-1)!.kind !== "ROLL") {
    const p = topActor(s);
    s = step(s, p, legalActions(s, p)[0]!);
  }
  for (let t = 0; t < turns; t++) {
    const p = s.turn.activePlayer;
    s = step(s, p, { type: "ROLL" });
    for (let b = 0; b < 3; b++) {
      const build = legalActions(s, p).find((a) => a.type.startsWith("BUILD_"));
      if (!build) break;
      s = step(s, p, build);
    }
    s = step(s, p, { type: "END_TURN" });
  }
  return { state: s, log };
}

describe("scripted game: setup + 10 turns", () => {
  it("plays through with invariants holding after every action", () => {
    const { state } = playScripted(10);
    expect(state.turn.number).toBe(11);
    expect(state.turn.activePlayer).toBe("p2"); // 10 turns over 4 seats → seat index 2
    expect(
      Object.values(state.pieces).filter((p) => p.type === "settlement").length,
    ).toBeGreaterThanOrEqual(8);
  });

  it("replaying the log from the same seed reproduces the final state exactly", () => {
    const { state, log } = playScripted(10);
    let replay = createGame(fixtureMap(), { modules: ["base"] }, SEATS, "ten-turns");
    for (const [p, a] of log) replay = act(replay, p, a);
    expect(replay).toEqual(state);
  });

  it("different seeds roll differently", () => {
    const a = playScripted(10, "seed-a").state;
    const b = playScripted(10, "seed-b").state;
    expect(a.zones).not.toEqual(b.zones);
  });
});

describe("apply", () => {
  it("never mutates its input", () => {
    const s = runSetup(newGame());
    const before = JSON.stringify({ ...s, graph: undefined });
    apply(s, "p0", { type: "ROLL" });
    apply(s, "p1", { type: "ROLL" }); // rejected
    expect(JSON.stringify({ ...s, graph: undefined })).toBe(before);
  });

  it("emits a log event for the roll", () => {
    const s = runSetup(newGame());
    const res = apply(s, "p0", { type: "ROLL" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.events[0]!.type).toBe("ROLLED");
  });

  it("lets the system actor act for the pending player", () => {
    const s = runSetup(newGame());
    const res = apply(s, "system", { type: "ROLL" });
    expect(res.ok).toBe(true);
  });
});

describe("legalActions", () => {
  it("is empty for a player who isn't being waited on", () => {
    expect(legalActions(newGame(), "p1")).toEqual([]);
  });

  it("offers every free vertex for the first settlement", () => {
    const s = newGame();
    expect(legalActions(s, "p0")).toHaveLength(s.graph.vertices.size);
  });

  it("every action it lists is accepted by apply", () => {
    const s = give(inMainPhase(runSetup(newGame())), "p0", {
      wood: 5,
      brick: 5,
      sheep: 5,
      wheat: 5,
      ore: 5,
    });
    for (const a of legalActions(s, "p0")) expect(apply(s, "p0", a).ok, a.type).toBe(true);
  });
});

describe("viewFor", () => {
  const s = give(runSetup(newGame()), "p1", { ore: 2 });

  it("shows your own hand", () => {
    expect(viewFor(s, "p1").zones["hand-p1"]!.contents).toBeDefined();
  });

  it("shows only a count for another player's hand", () => {
    const zone = viewFor(s, "p0").zones["hand-p1"]!;
    expect(zone.contents).toBeUndefined();
    expect(zone.count).toBe(Object.values(s.zones["hand-p1"]!.contents).reduce((a, b) => a + b, 0));
  });

  it("gives spectators counts only", () => {
    const view = viewFor(s, "spectator");
    for (const p of s.players) expect(view.zones[`hand-${p}`]!.contents).toBeUndefined();
    expect(view.zones["bank"]!.contents).toBeDefined();
  });

  it("never includes the RNG state", () => {
    expect("rng" in viewFor(s, "p0")).toBe(false);
  });
});

describe("defaultAction", () => {
  it("returns an action apply accepts at every step of a short game", () => {
    let s = newGame();
    for (let i = 0; i < 40; i++) {
      const p = topActor(s);
      s = act(s, "system", defaultAction(s, p));
    }
    expect(s.turn.number).toBeGreaterThan(1);
  });
});

describe("snapshots", () => {
  it("round-trips through JSON and keeps playing identically", async () => {
    const { toSnapshot, fromSnapshot } = await import("../engine");
    const s = runSetup(newGame());
    const restored = fromSnapshot(JSON.parse(JSON.stringify(toSnapshot(s))));
    expect(restored).toEqual(s);
    const a = apply(s, "p0", { type: "ROLL" });
    const b = apply(restored, "p0", { type: "ROLL" });
    expect(a.ok && b.ok && a.state).toEqual(b.ok && b.state);
  });

  it("contains no Map or Set, so JSON keeps everything", async () => {
    const { toSnapshot } = await import("../engine");
    const snap = toSnapshot(newGame());
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    expect("graph" in snap).toBe(false);
  });
});
