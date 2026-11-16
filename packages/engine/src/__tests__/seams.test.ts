import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apply, createGame, graphFor, legalActions } from "../engine";
import { reject, type RulesModule } from "../module";
import { MODULES } from "../modules";
import { longestRoute } from "../modules/base/awards";
import type { GameState, MapInput } from "../types";
import {
  act,
  fixtureMap,
  give,
  giveDev,
  h,
  inMainPhase,
  inRollPhase,
  pathFrom,
  runSetup,
  v,
  withPiece,
} from "./testkit";

/** The 19-hex fixture with a ring of sea around it (radius 3): 37 hexes. */
function seaMap(): MapInput {
  const base = fixtureMap();
  const ring: { q: number; r: number; terrain: string }[] = [];
  for (let q = -3; q <= 3; q++) {
    for (let r = -3; r <= 3; r++) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) === 3)
        ring.push({ q, r, terrain: "sea" });
    }
  }
  return { ...base, hexes: [...base.hexes, ...ring] };
}

// A corner on the fixture that the test module forbids settling on.
const BANNED = v(h(0, 0), h(1, 0), h(1, -1));

/** Exercises every seam from decision record 0001 without seafaring itself. */
const testModule: RulesModule = {
  id: "test-seams",
  version: 1,
  dependsOn: ["base"],
  needsSeaGraph: true,
  routePieceTypes: ["ship"],
  pieceLimits: { ship: 15 },
  routeAwardName: "Longest Trade Route",
  extraActions: { ROLL: ["BANK_TRADE"] },
  hooks: {
    canPlace(_state, _player, pieceType, at) {
      if (pieceType === "settlement" && "vertex" in at && at.vertex === BANNED) {
        return reject("ILLEGAL_PLACEMENT", "Not here (test module).");
      }
      return null;
    },
    onPlace(draft, piece) {
      const mine = (draft.moduleState["test-seams"] ??= { placed: [] as string[] }) as {
        placed: string[];
      };
      mine.placed.push(piece.type);
    },
  },
};

beforeAll(() => {
  MODULES["test-seams"] = testModule;
});
afterAll(() => {
  delete MODULES["test-seams"];
});

const SEATS = ["p0", "p1"];
const withSeams = (seed = "seams"): GameState =>
  createGame(seaMap(), { modules: ["base", "test-seams"] }, SEATS, seed);
const baseOnSea = (seed = "seams"): GameState =>
  createGame(seaMap(), { modules: ["base"] }, SEATS, seed);

describe("sea graph", () => {
  it("is land only for the base game, even with sea hexes listed", () => {
    const g = graphFor(seaMap(), ["base"]);
    expect([g.hexKeys.size, g.vertices.size, g.edges.size]).toEqual([19, 54, 72]);
  });

  it("covers sea hexes when a module needs it; hexIndex points into the full hex list", () => {
    const map = seaMap();
    const g = graphFor(map, ["base", "test-seams"]);
    expect(g.hexKeys.size).toBe(37);
    expect(g.vertices.size).toBeGreaterThan(54);
    expect(map.hexes[g.hexIndex.get("3,0")!]!.terrain).toBe("sea");
    expect(map.hexes[g.hexIndex.get("1,0")!]!.terrain).toBe("forest");
  });

  it("offers no settlement spot or road on open sea", () => {
    const s = withSeams();
    const spots = legalActions(s, "p0").filter((a) => a.type === "PLACE_SETTLEMENT");
    // The 54 land corners of the fixture, minus the one the test module bans.
    expect(spots).toHaveLength(53);
    let next = act(s, "p0", spots[0]!);
    for (const a of legalActions(next, "p0")) {
      expect(a.type).toBe("PLACE_ROAD");
      const edge = next.graph.edges.get((a as { edge: string }).edge)!;
      expect(edge.hexes.some((hx) => hx === "0,0" || !hx.includes("3"))).toBe(true);
    }
    next = runSetup(next);
    expect(next.decisions.at(-1)!.kind).toBe("ROLL");
  });

  it("moves the robber only between land hexes", () => {
    let s = inMainPhase(withSeams());
    s = {
      ...s,
      decisions: [
        ...s.decisions,
        { ...s.decisions[0]!, kind: "MOVE_ROBBER", allowed: ["MOVE_ROBBER"] },
      ],
    };
    const targets = legalActions(s, "p0").filter((a) => a.type === "MOVE_ROBBER");
    expect(targets).toHaveLength(18); // 19 land hexes minus the robber's own
  });

  it("the base game on a map with sea hexes plays exactly as on land alone", () => {
    const a = runSetup(baseOnSea());
    const b = runSetup(createGame(fixtureMap(), { modules: ["base"] }, SEATS, "seams"));
    expect(a.pieces).toEqual(b.pieces);
  });
});

describe("extraActions", () => {
  it("adds a module's action types to another module's decision", () => {
    const plain = give(inRollPhase(baseOnSea()), "p0", { wood: 4 });
    const extra = give(inRollPhase(withSeams()), "p0", { wood: 4 });
    expect(legalActions(plain, "p0").some((a) => a.type === "BANK_TRADE")).toBe(false);
    expect(legalActions(extra, "p0").some((a) => a.type === "BANK_TRADE")).toBe(true);
    expect(apply(plain, "p0", { type: "BANK_TRADE", give: "wood", get: "ore" })).toMatchObject({
      ok: false,
      code: "WRONG_DECISION",
    });
    expect(apply(extra, "p0", { type: "BANK_TRADE", give: "wood", get: "ore" }).ok).toBe(true);
  });
});

describe("canPlace", () => {
  it("lets any module veto a placement the base rules allow", () => {
    const s = withSeams();
    expect(apply(s, "p0", { type: "PLACE_SETTLEMENT", vertex: BANNED })).toMatchObject({
      ok: false,
      code: "ILLEGAL_PLACEMENT",
      message: "Not here (test module).",
    });
    expect(apply(baseOnSea(), "p0", { type: "PLACE_SETTLEMENT", vertex: BANNED }).ok).toBe(true);
  });
});

describe("onPlace", () => {
  it("runs after every placement: setup settlements and roads, builds, the robber", () => {
    let s = runSetup(withSeams());
    expect((s.moduleState["test-seams"] as { placed: string[] }).placed).toEqual([
      "settlement",
      "road",
      "settlement",
      "road",
      "settlement",
      "road",
      "settlement",
      "road",
    ]);
    s = {
      ...s,
      decisions: [
        ...s.decisions,
        {
          ...s.decisions.at(-1)!,
          kind: "MOVE_ROBBER",
          allowed: ["MOVE_ROBBER"],
          pendingFrom: ["p0"],
          actors: ["p0"],
        },
      ],
    };
    s = act(
      s,
      "p0",
      legalActions(s, "p0").find((a) => a.type === "MOVE_ROBBER")!,
    );
    expect((s.moduleState["test-seams"] as { placed: string[] }).placed.at(-1)).toBe("robber");
  });
});

describe("routes with a second piece type", () => {
  // A straight line of 5 edges: 2 roads then 3 "ships", switching at the third corner.
  function line(atSwitch?: "mine" | "theirs"): GameState {
    let s = inMainPhase(withSeams());
    const start = v(h(0, 0), h(1, 0), h(0, 1));
    const { edges, vertices } = pathFrom(s, start, 5);
    edges.forEach((edge, i) => {
      s = withPiece(s, i < 2 ? "road" : "ship", "p0", { edge });
    });
    if (atSwitch === "mine") s = withPiece(s, "settlement", "p0", { vertex: vertices[2]! });
    if (atSwitch === "theirs") s = withPiece(s, "settlement", "p1", { vertex: vertices[2]! });
    return s;
  }

  it("roads and ships join only at the player's own building", () => {
    expect(longestRoute(line(), "p0", ["road", "ship"])).toBe(3);
    expect(longestRoute(line("mine"), "p0", ["road", "ship"])).toBe(5);
    expect(longestRoute(line("theirs"), "p0", ["road", "ship"])).toBe(3);
    expect(longestRoute(line("mine"), "p0", ["road"])).toBe(2);
  });

  it("the award counts both and uses the module's name", () => {
    let s = line("mine");
    s = give(s, "p0", { wood: 1, brick: 1, sheep: 1, wheat: 1 });
    const build = legalActions(s, "p0").find((a) => a.type === "BUILD_SETTLEMENT");
    expect(build).toBeDefined();
    const res = apply(s, "p0", build!);
    if (!res.ok) throw new Error(res.message);
    expect((res.state.moduleState["base"] as { longestRoad: string }).longestRoad).toBe("p0");
    expect(res.events.some((ev) => ev.text.includes("Longest Trade Route (5)"))).toBe(true);
  });

  it("a settlement may be built at the end of a ship line; a ship isn't a road", () => {
    let s = inMainPhase(withSeams());
    const corner = v(h(0, 0), h(1, 0), h(0, 1));
    const { edges, vertices } = pathFrom(s, corner, 2);
    // A lone ship two corners away from anything of p0's.
    s = withPiece(s, "ship", "p0", { edge: edges[1]! });
    s = give(s, "p0", { wood: 2, brick: 2, sheep: 1, wheat: 1 });
    const legal = legalActions(s, "p0");
    // Settling at the ship's far end is allowed: it touches a route piece of p0's.
    expect(legal).toContainEqual({ type: "BUILD_SETTLEMENT", vertex: vertices[2] });
    // A ship doesn't connect roads, and its edge can't take a road.
    expect(legal.filter((a) => a.type === "BUILD_ROAD")).toEqual([]);
    expect(apply(s, "p0", { type: "BUILD_ROAD", edge: edges[1]! })).toMatchObject({
      ok: false,
      code: "ILLEGAL_PLACEMENT",
    });
  });

  it("Road Crew counts every route piece type that's left", () => {
    let s = inMainPhase(withSeams());
    const edges = [...s.graph.edges.keys()];
    for (let i = 0; i < 15; i++) s = withPiece(s, "road", "p0", { edge: edges[i]! });
    s = withPiece(s, "settlement", "p0", { vertex: s.graph.edges.get(edges[0]!)!.vertices[0] });
    s = giveDev(s, "p0", { roadBuilding: 1 });
    s = act(s, "p0", { type: "PLAY_ROAD_BUILDING" });
    // No roads left, 15 ships left: the step stays only if some module offers a legal placement.
    // The test module has no ship actions, so nothing is legal and the step is popped.
    expect(s.decisions.at(-1)!.kind).toBe("MAIN");
    expect(s.zones["played-p0"]!.contents["roadBuilding"]).toBe(1);
  });
});
