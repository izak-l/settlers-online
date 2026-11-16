import { describe, it, expect } from "vitest";
import type { Action } from "../actions";
import { apply, createGame, defaultAction, legalActions, toSnapshot, tradeRatios } from "../engine";
import { BASE_FEATURES, type FeatureId, type GameState, type MapInput } from "../types";
import {
  act,
  e,
  fixtureMap,
  give,
  giveDev,
  h,
  inMainPhase,
  inRollPhase,
  pathFrom,
  seedRolling,
  v,
  withPiece,
} from "./testkit";

const SEATS = ["p0", "p1", "p2"];

function gameWith(
  features: Partial<Record<FeatureId, boolean>>,
  opts: { map?: MapInput; seed?: string; viaMap?: boolean } = {},
): GameState {
  const map = opts.map ?? fixtureMap();
  if (opts.viaMap) {
    return createGame({ ...map, features }, { modules: ["base"] }, SEATS, opts.seed ?? "seed");
  }
  return createGame(map, { modules: ["base"], options: { features } }, SEATS, opts.seed ?? "seed");
}

const types = (s: GameState, p = "p0") => new Set(legalActions(s, p).map((a) => a.type));

describe("feature switches", () => {
  it("are all on by default", () => {
    const s = createGame(fixtureMap(), { modules: ["base"] }, SEATS, "seed");
    expect(s.options.features).toEqual({
      devCards: true,
      robber: true,
      longestRoad: true,
      largestArmy: true,
      ports: true,
    });
  });

  it("take the map's value, and the ruleset's over the map's", () => {
    const fromMap = gameWith({ devCards: false }, { viaMap: true });
    expect(fromMap.options.features.devCards).toBe(false);
    expect(fromMap.options.features.robber).toBe(true);

    const both = createGame(
      { ...fixtureMap(), features: { devCards: false, robber: false } },
      { modules: ["base"], options: { features: { devCards: true } } },
      SEATS,
      "seed",
    );
    expect(both.options.features.devCards).toBe(true);
    expect(both.options.features.robber).toBe(false);
  });

  it("treat a missing features option (games saved before switches) as all on", () => {
    let s = inMainPhase(gameWith({}));
    s = { ...s, options: { vpToWin: 10 } as GameState["options"] };
    s = give(s, "p0", { sheep: 1, wheat: 1, ore: 1 });
    expect(types(s).has("BUY_DEV_CARD")).toBe(true);
  });

  describe("devCards off", () => {
    it("can't buy or play development cards", () => {
      let s = inMainPhase(gameWith({ devCards: false }));
      s = give(s, "p0", { sheep: 1, wheat: 1, ore: 1 });
      s = giveDev(s, "p0", { knight: 1, monopoly: 1, roadBuilding: 1, yearOfPlenty: 1 });
      const legal = types(s);
      for (const t of [
        "BUY_DEV_CARD",
        "PLAY_KNIGHT",
        "PLAY_MONOPOLY",
        "PLAY_ROAD_BUILDING",
        "PLAY_YEAR_OF_PLENTY",
      ]) {
        expect(legal.has(t as Action["type"]), t).toBe(false);
      }
      const res = apply(s, "p0", { type: "BUY_DEV_CARD" });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe("WRONG_DECISION");
      expect(types(inRollPhase(gameWith({ devCards: false }))).has("PLAY_KNIGHT")).toBe(false);
    });
  });

  describe("robber off", () => {
    it("puts no robber on the board", () => {
      expect(gameWith({ robber: false }).pieces["robber"]).toBeUndefined();
    });

    it("a 7 still makes big hands discard, then goes straight to the main step", () => {
      let s = inRollPhase(gameWith({ robber: false }, { seed: seedRolling(7) }));
      s = give(s, "p1", { wood: 4, brick: 4 });
      s = act(s, "p0", { type: "ROLL" });
      expect(s.decisions.at(-1)!.kind).toBe("DISCARD");
      s = act(s, "p1", { type: "DISCARD", resources: { wood: 4 } });
      expect(s.decisions.at(-1)!.kind).toBe("MAIN");
      expect(s.decisions.some((d) => d.kind === "MOVE_ROBBER")).toBe(false);
    });

    it("a knight counts towards the army but moves nothing", () => {
      let s = inMainPhase(gameWith({ robber: false }));
      s = giveDev(s, "p0", { knight: 1 });
      s = act(s, "p0", { type: "PLAY_KNIGHT" });
      expect(s.decisions.at(-1)!.kind).toBe("MAIN");
      expect(s.zones["played-p0"]!.contents["knight"]).toBe(1);
    });
  });

  describe("awards off", () => {
    it("longestRoad off: nobody gets it for a long road", () => {
      let s = inMainPhase(gameWith({ longestRoad: false }));
      const start = v(h(0, 0), h(1, 0), h(1, -1));
      s = withPiece(s, "settlement", "p0", { vertex: start });
      for (const edge of pathFrom(s, start, 5).edges) s = withPiece(s, "road", "p0", { edge });
      s = give(s, "p0", { wood: 1, brick: 1 });
      const legal = legalActions(s, "p0").find((a) => a.type === "BUILD_ROAD")!;
      s = act(s, "p0", legal);
      expect((s.moduleState["base"] as { longestRoad: string | null }).longestRoad).toBeNull();
    });

    it("largestArmy off: three knights give no award", () => {
      let s = inMainPhase(gameWith({ largestArmy: false }));
      s = giveDev(s, "p0", { knight: 2 }, "played");
      s = giveDev(s, "p0", { knight: 1 });
      s = act(s, "p0", { type: "PLAY_KNIGHT" });
      expect((s.moduleState["base"] as { largestArmy: string | null }).largestArmy).toBeNull();
    });
  });

  describe("ports off", () => {
    it("every bank rate is 4 even on a port", () => {
      const port = e(h(1, 0), h(2, 0));
      const map: MapInput = { ...fixtureMap(), ports: [{ edgeId: port, type: "any3to1" }] };
      const corner = v(h(1, 0), h(2, 0), h(2, -1));
      const on = withPiece(gameWith({}, { map }), "settlement", "p0", { vertex: corner });
      expect(tradeRatios(on, "p0")["wood"]).toBe(3);
      const off = withPiece(gameWith({ ports: false }, { map }), "settlement", "p0", {
        vertex: corner,
      });
      expect(tradeRatios(off, "p0")["wood"]).toBe(4);
    });
  });

  it("changes nothing when every switch is on (base no-change)", () => {
    // Play the same 300 default actions in a game with no switches and one with all of them on.
    let plain = createGame(fixtureMap(), { modules: ["base"] }, SEATS, "no-change");
    let on = createGame(
      fixtureMap(),
      { modules: ["base"], options: { features: { ...BASE_FEATURES } } },
      SEATS,
      "no-change",
    );
    for (let i = 0; i < 300 && plain.winner === undefined; i++) {
      const p = plain.decisions.at(-1)!.pendingFrom[0]!;
      const a = defaultAction(plain, p);
      expect(defaultAction(on, p)).toEqual(a);
      plain = act(plain, p, a);
      on = act(on, p, a);
    }
    expect(toSnapshot(on)).toEqual(toSnapshot(plain));
  });
});
