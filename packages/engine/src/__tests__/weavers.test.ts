import { describe, expect, it } from "vitest";
import type { Action } from "../actions";
import { apply, computeVP, createGame, legalActions } from "../engine";
import type { GameState, MapInput, PlayerId } from "../types";
import { act, e, h, inMainPhase, inRollPhase, setHand, topActor, v, withPiece } from "./testkit";

// ---------------------------------------------------------------------------
// Fixture: a 7-hex numbered main island, and a one-hex islet (a desert) to the east with a village
// on five of its six corners (not the west one, where the ships arrive). Ships sail from the main island's east tip (COAST) along S1–S4 to
// the islet's south-west corner, which is village "v-sw" (token 8).
// ---------------------------------------------------------------------------

const MAIN: MapInput["hexes"] = [
  { q: 0, r: 0, terrain: "desert", region: "main" },
  { q: 1, r: 0, terrain: "forest", token: 6, region: "main" },
  { q: 1, r: -1, terrain: "hills", token: 8, region: "main" },
  { q: 0, r: -1, terrain: "pasture", token: 5, region: "main" },
  { q: -1, r: 0, terrain: "fields", token: 4, region: "main" },
  { q: -1, r: 1, terrain: "mountains", token: 10, region: "main" },
  { q: 0, r: 1, terrain: "forest", token: 11, region: "main" },
];
const ISLET = { q: 4, r: -1, terrain: "desert", region: "islet" };

const COAST = v(h(1, 0), h(2, 0), h(2, -1));
const C2 = v(h(2, -1), h(2, 0), h(3, -1));
const EAST_CORNER = v(h(3, -1), h(3, 0), h(4, -1)); // the islet's west corner
const VILLAGE = v(h(3, 0), h(4, -1), h(4, 0)); // its south-west corner
const S1 = e(h(2, -1), h(2, 0));
const S2 = e(h(2, 0), h(3, -1));
const S3 = e(h(3, -1), h(3, 0));
const S4 = e(h(3, 0), h(4, -1));
/** A branch off the route at C2, heading north (towards no village). */
const BRANCH = e(h(2, -1), h(3, -1));

const CORNERS = [
  ["v-sw", VILLAGE, 8],
  ["v-nw", v(h(3, -1), h(4, -2), h(4, -1)), 10],
  ["v-ne", v(h(4, -2), h(4, -1), h(5, -2)), 11],
  ["v-e", v(h(4, -1), h(5, -2), h(5, -1)), 3],
  ["v-se", v(h(4, -1), h(4, 0), h(5, -1)), 4],
] as const;

function map(vpToWin = 14): MapInput {
  const listed = new Set([...MAIN, ISLET].map((x) => `${x.q},${x.r}`));
  const sea: MapInput["hexes"] = [];
  for (let q = -4; q <= 4; q++)
    for (let r = -4; r <= 4; r++)
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 4 && !listed.has(`${q},${r}`))
        sea.push({ q, r, terrain: "sea" });
  return {
    id: "weavers",
    vpToWin,
    hexes: [...MAIN, ISLET, ...sea],
    ports: [],
    robberStart: "desert",
    features: { longestRoad: false },
    scenario: { home: { regions: ["main"] }, setupRegions: ["main"], pirateStart: "-3,0" },
    markers: CORNERS.map(([id, vertex, token]) => ({
      id,
      kind: "village",
      at: { vertex },
      data: { token },
    })),
  };
}

const MODULES = ["base", "seafaring", "sf-weavers"];
const SEATS = ["p0", "p1"];
const game = (seed = "weave", vpToWin = 14) =>
  createGame(map(vpToWin), { modules: MODULES }, SEATS, seed);

const SHIP = { wood: 1, sheep: 1 };
const cloth = (s: GameState, zone: string) => s.zones[`cloth-${zone}`]!.contents["cloth"] ?? 0;
const trading = (s: GameState, village: string) =>
  (s.moduleState["sf-weavers"] as { trading: Record<string, string[]> }).trading[village] ?? [];
const expectCode = (s: GameState, p: PlayerId, a: Action, code: string) =>
  expect(apply(s, p, a)).toMatchObject({ ok: false, code });

function clone(s: GameState): GameState {
  const { graph, ...rest } = s;
  return { ...(JSON.parse(JSON.stringify(rest)) as Omit<GameState, "graph">), graph };
}

/** Move cloth between zones (village ids, "supply", or a player), keeping the total. */
function moveCloth(s: GameState, from: string, to: string, n: number): GameState {
  const out = clone(s);
  out.zones[`cloth-${from}`]!.contents["cloth"]! -= n;
  const dest = out.zones[`cloth-${to}`]!.contents;
  dest["cloth"] = (dest["cloth"] ?? 0) + n;
  return out;
}

/** p0 in the main step: settlement on COAST and ships on the first `n` of S1..S4; cash for a ship. */
function sailing(n: number, s: GameState = game()): GameState {
  let out = withPiece(inMainPhase(s), "settlement", "p0", { vertex: COAST });
  for (const edge of [S1, S2, S3, S4].slice(0, n)) out = withPiece(out, "ship", "p0", { edge });
  return setHand(out, "p0", SHIP);
}

/** p0 trading with the village at the end of S1..S4. */
const trader = (s: GameState = game()) =>
  act(sailing(3, s), "p0", { type: "BUILD_SHIP", edge: S4 });

/** A seed whose first roll in this game totals `total`. */
function seedRolling(total: number): string {
  for (let i = 0; i < 5000; i++) {
    const seed = `weave-roll-${total}-${i}`;
    const res = apply(inRollPhase(game(seed)), "p0", { type: "ROLL" });
    if (res.ok && res.events[0]!.data!["total"] === total) return seed;
  }
  throw new Error(`no seed rolls ${total}`);
}

// ---------------------------------------------------------------------------

describe("setup: three starting settlements", () => {
  it("two snake rounds with no resources, then a third round in seat order that pays", () => {
    let s = game();
    const order: string[] = [];
    const resourcesAfter: number[] = [];
    while (s.decisions.at(-1)!.kind !== "ROLL") {
      const p = topActor(s);
      const top = s.decisions.at(-1)!;
      if (top.kind === "PLACE_SETTLEMENT") order.push(`${p}:${String(top.data?.["round"])}`);
      const choice = legalActions(s, p).find((a) => a.type !== "PLACE_SHIP")!;
      s = act(s, p, choice);
      if (top.kind === "PLACE_SETTLEMENT")
        resourcesAfter.push(
          Object.values(s.zones[`hand-${p}`]!.contents).reduce((a, b) => a + b, 0),
        );
    }
    expect(order).toEqual(["p0:1", "p1:1", "p1:2", "p0:2", "p0:3", "p1:3"]);
    // Nothing from the first two settlements; the third pays out.
    expect(resourcesAfter.slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(resourcesAfter[4]! + resourcesAfter[5]!).toBeGreaterThan(0);
    const settlements = Object.values(s.pieces).filter((x) => x.type === "settlement");
    expect(settlements).toHaveLength(6);
  });

  it("puts 5 cloth by each village and 10 in the general supply", () => {
    const s = game();
    for (const [id] of CORNERS) expect(cloth(s, id)).toBe(5);
    expect(cloth(s, "supply")).toBe(10);
  });
});

describe("building limits", () => {
  it("no settlements on the islet", () => {
    let s = sailing(3);
    s = setHand(s, "p0", { wood: 1, brick: 1, sheep: 1, wheat: 1 });
    expectCode(s, "p0", { type: "BUILD_SETTLEMENT", vertex: EAST_CORNER }, "ILLEGAL_PLACEMENT");
  });

  it("the robber can't go to the islet", () => {
    const s = inMainPhase(game());
    s.decisions.push({
      kind: "MOVE_ROBBER",
      actors: ["p0"],
      pendingFrom: ["p0"],
      allowed: ["MOVE_ROBBER"],
      module: "base",
    });
    expectCode(s, "p0", { type: "MOVE_ROBBER", hex: "4,-1" }, "ILLEGAL_PLACEMENT");
    expect(legalActions(s, "p0").some((a) => a.type === "MOVE_ROBBER" && a.hex === "4,-1")).toBe(
      false,
    );
  });
});

describe("trading with villages", () => {
  it("a route from your building to a village opens trade and takes 1 cloth at once", () => {
    const s = trader();
    expect(trading(s, "v-sw")).toEqual(["p0"]);
    expect(cloth(s, "v-sw")).toBe(4);
    expect(cloth(s, "p0")).toBe(1);
  });

  it("an opponent's building on the way breaks the route", () => {
    let s = sailing(3);
    s = withPiece(s, "settlement", "p1", { vertex: C2 });
    s = act(s, "p0", { type: "BUILD_SHIP", edge: S4 });
    expect(trading(s, "v-sw")).toEqual([]);
    expect(cloth(s, "p0")).toBe(0);
  });

  it("when a village's number rolls, each trader takes 1 cloth, topped up from the supply", () => {
    // p0 and p1 both trade with v-sw (token 8), which has 1 cloth left.
    let s = trader(game(seedRolling(8)));
    s = moveCloth(s, "v-sw", "supply", 3);
    const m = s.moduleState["sf-weavers"] as { trading: Record<string, string[]> };
    m.trading["v-sw"] = ["p0", "p1"];
    s = act(inRollPhase(s), "p0", { type: "ROLL" });
    expect(cloth(s, "v-sw")).toBe(0);
    expect(cloth(s, "p0")).toBe(2);
    expect(cloth(s, "p1")).toBe(1);
    expect(cloth(s, "supply")).toBe(12);
  });

  it("an empty village produces nothing, even with cloth in the supply", () => {
    let s = trader(game(seedRolling(8)));
    s = moveCloth(s, "v-sw", "supply", 4);
    s = act(inRollPhase(s), "p0", { type: "ROLL" });
    expect(cloth(s, "p0")).toBe(1);
  });

  it("every 2 cloth are worth 1 VP", () => {
    const s = trader();
    const base = computeVP(s, "p0");
    expect(computeVP(moveCloth(s, "supply", "p0", 1), "p0")).toBe(base + 1);
    expect(computeVP(moveCloth(s, "supply", "p0", 2), "p0")).toBe(base + 1);
    expect(computeVP(moveCloth(s, "supply", "p0", 3), "p0")).toBe(base + 2);
  });
});

describe("closed routes", () => {
  it("ships on a route to a village can't move; a branch off it can", () => {
    let s = trader();
    s = withPiece(s, "ship", "p0", { edge: BRANCH });
    s.turn.number = 2; // a later turn: nothing was built this turn
    const movable = new Set(
      legalActions(s, "p0").flatMap((a) => (a.type === "MOVE_SHIP" ? [a.from] : [])),
    );
    expect(movable.has(S4)).toBe(false);
    expect(movable.has(BRANCH)).toBe(true);
    expectCode(s, "p0", { type: "MOVE_SHIP", from: S4, to: e(h(2, 0), h(3, 0)) }, "INVALID_CHOICE");
  });
});

describe("the pirate", () => {
  const pirateStep = (s: GameState): GameState => {
    const out = clone(s);
    out.decisions.push({
      kind: "MOVE_ROBBER",
      actors: ["p1"],
      pendingFrom: ["p1"],
      allowed: ["MOVE_ROBBER"],
      module: "base",
    });
    return out;
  };

  it("can't be moved before you trade with a village", () => {
    const s = pirateStep(inMainPhase(game(), "p1"));
    expectCode(s, "p1", { type: "MOVE_PIRATE", hex: "3,0" }, "ILLEGAL_PLACEMENT");
    expect(legalActions(s, "p1").some((a) => a.type === "MOVE_PIRATE")).toBe(false);
  });

  it("robs a resource card or a cloth from a ship owner next to it", () => {
    let s = trader(); // p0: a ship on S2 and S3 (edges of 3,0's neighbour), and 1 cloth
    s = setHand(s, "p0", { ore: 1 });
    s.turn = { number: 3, activePlayer: "p1" };
    s.decisions = [{ ...s.decisions.at(-1)!, actors: ["p1"], pendingFrom: ["p1"] }];
    (s.moduleState["sf-weavers"] as { trading: Record<string, string[]> }).trading["v-e"] = ["p1"];
    s = act(pirateStep(s), "p1", { type: "MOVE_PIRATE", hex: "3,0" });
    expect(s.decisions.at(-1)!.kind).toBe("STEAL");
    const steals = legalActions(s, "p1").filter((a) => a.type === "STEAL");
    expect(steals).toEqual([
      { type: "STEAL", from: "p0" },
      { type: "STEAL", from: "p0", what: "cloth" },
    ]);
    s = act(s, "p1", { type: "STEAL", from: "p0", what: "cloth" });
    expect(cloth(s, "p1")).toBe(1);
    expect(cloth(s, "p0")).toBe(0);
  });
});

describe("winning", () => {
  it("the VP target during your turn wins, as usual", () => {
    const s = moveCloth(sailing(3, game("weave", 2)), "supply", "p0", 3);
    const after = act(s, "p0", { type: "BUILD_SHIP", edge: S4 }); // +1 cloth: 4 cloth = 2 VP
    expect(after.winner).toBe("p0");
  });

  it("with five villages empty at the end of a turn, the most VP wins", () => {
    let s = inMainPhase(game());
    for (const [id] of CORNERS.slice(0, 5)) s = moveCloth(s, id, "supply", 5);
    s = moveCloth(s, "supply", "p1", 2); // p1: 1 VP
    const after = act(s, "p0", { type: "END_TURN" });
    expect(after.winner).toBe("p1");
  });

  it("a tie goes to the most cloth", () => {
    let s = inMainPhase(game());
    for (const [id] of CORNERS.slice(0, 5)) s = moveCloth(s, id, "supply", 5);
    s = moveCloth(s, "supply", "p0", 1); // both 0 VP; p0 has more cloth
    expect(act(s, "p0", { type: "END_TURN" }).winner).toBe("p0");
  });

  it("four empty villages don't end the game", () => {
    let s = inMainPhase(game());
    for (const [id] of CORNERS.slice(0, 4)) s = moveCloth(s, id, "supply", 5);
    expect(act(s, "p0", { type: "END_TURN" }).winner).toBeUndefined();
  });
});
