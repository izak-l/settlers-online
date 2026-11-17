import { describe, expect, it } from "vitest";
import type { Action } from "../actions";
import { apply, computeVP, createGame, legalActions, tradeRatios, viewFor } from "../engine";
import type { GameState, MapInput, PlayerId } from "../types";
import { act, e, h, inMainPhase, setHand, v, withPiece } from "./testkit";

// ---------------------------------------------------------------------------
// Fixture: a 7-hex numbered main island, and a 2-hex east island where only one hex has a number.
// Ships sail from the main island's east tip (COAST) along S1–S2–S3 towards the east island; the
// scenario's things lie on those edges.
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
const EAST: MapInput["hexes"] = [
  { q: 4, r: -1, terrain: "pasture" }, // no number: nobody may settle only on it
  { q: 4, r: 0, terrain: "pasture", token: 3 },
];

const COAST = v(h(1, 0), h(2, 0), h(2, -1));
const S1 = e(h(2, -1), h(2, 0));
const S2 = e(h(2, 0), h(3, -1));
const S3 = e(h(3, -1), h(3, 0));
/** The two coast edges at COAST (forest on one side, sea on the other). */
const COAST_A = e(h(1, 0), h(2, 0));
const COAST_B = e(h(1, 0), h(2, -1));
/** A second coastal corner on the main island's south-east, and its coast edge away from A. */
const SOUTH = v(h(0, 1), h(1, 0), h(1, 1));
const SOUTH_EDGE = e(h(0, 1), h(1, 1));

function map(markers: NonNullable<MapInput["markers"]>): MapInput {
  const listed = new Set([...MAIN, ...EAST].map((x) => `${x.q},${x.r}`));
  const sea: MapInput["hexes"] = [];
  for (let q = -4; q <= 4; q++)
    for (let r = -4; r <= 4; r++)
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 4 && !listed.has(`${q},${r}`))
        sea.push({ q, r, terrain: "sea" });
  return {
    id: "lost",
    vpToWin: 13,
    hexes: [...MAIN, ...EAST, ...sea],
    ports: [],
    robberStart: "desert",
    scenario: { home: { regions: ["main"] }, setupRegions: ["main"], pirateStart: "-3,0" },
    markers,
  };
}

const MARKERS: NonNullable<MapInput["markers"]> = [
  { id: "harbor-1", kind: "harbor", at: { edge: S1 }, data: { port: "wheat2to1" } },
  { id: "vp-1", kind: "vp-token", at: { edge: S2 } },
  { id: "dev-1", kind: "dev-card", at: { edge: S3 } },
];

const MODULES = ["base", "seafaring", "sf-lost-settlers"];
const game = (markers = MARKERS, seed = "lost") =>
  createGame(map(markers), { modules: MODULES }, ["p0", "p1"], seed);

const SHIP = { wood: 1, sheep: 1 };
const types = (s: GameState, p: PlayerId = "p0") => legalActions(s, p).map((a) => a.type);
const expectCode = (s: GameState, p: PlayerId, a: Action, code: string) =>
  expect(apply(s, p, a)).toMatchObject({ ok: false, code });
const markerIds = (s: GameState) => (s.map.markers ?? []).map((m) => m.id);
const deckSize = (s: GameState) =>
  Object.values(s.zones["devdeck"]!.contents).reduce((a, b) => a + b, 0);
const held = (s: GameState, p: PlayerId) =>
  (s.moduleState["sf-lost-settlers"] as { held: Record<string, string[]> }).held[p];

/** p0 in the main step with a settlement on COAST, ships on the first `n` of S1..S3, cash for one ship. */
function sailing(n: number, s: GameState = game()): GameState {
  let out = withPiece(inMainPhase(s), "settlement", "p0", { vertex: COAST });
  for (const edge of [S1, S2, S3].slice(0, n)) out = withPiece(out, "ship", "p0", { edge });
  return setHand(out, "p0", SHIP);
}

/** A game with only the markers named. */
const only = (...ids: string[]) => game(MARKERS.filter((m) => ids.includes(m.id)));

// ---------------------------------------------------------------------------

describe("numbered land only", () => {
  it("settlements need a corner touching a hex with a number", () => {
    // Touches only the unnumbered east pasture and the sea.
    const bare = v(h(4, -1), h(4, -2), h(5, -2));
    let s = withPiece(inMainPhase(game()), "ship", "p0", { edge: e(h(4, -2), h(4, -1)) });
    s = withPiece(s, "ship", "p0", { edge: e(h(4, -1), h(5, -2)) });
    s = setHand(s, "p0", { wood: 1, brick: 1, sheep: 1, wheat: 1 });
    expectCode(s, "p0", { type: "BUILD_SETTLEMENT", vertex: bare }, "ILLEGAL_PLACEMENT");
    // A corner touching the numbered pasture is fine.
    const numbered = v(h(4, -1), h(4, 0), h(5, -1));
    s = withPiece(s, "ship", "p0", { edge: e(h(4, -1), h(5, -1)) });
    expect(apply(s, "p0", { type: "BUILD_SETTLEMENT", vertex: numbered }).ok).toBe(true);
  });

  it("the robber only moves to a hex with a number", () => {
    const s = inMainPhase(game());
    s.decisions.push({
      kind: "MOVE_ROBBER",
      actors: ["p0"],
      pendingFrom: ["p0"],
      allowed: ["MOVE_ROBBER"],
      module: "base",
    });
    expectCode(s, "p0", { type: "MOVE_ROBBER", hex: "4,-1" }, "ILLEGAL_PLACEMENT");
    const targets = legalActions(s, "p0").flatMap((a) => (a.type === "MOVE_ROBBER" ? [a.hex] : []));
    expect(targets).not.toContain("4,-1");
    expect(targets).not.toContain("0,0");
    expect(targets).toContain("4,0");
  });
});

describe("VP tokens", () => {
  it("building a ship onto the token takes it: 1 VP", () => {
    const s = sailing(1, only("vp-1", "dev-1"));
    const before = computeVP(s, "p0");
    const after = act(s, "p0", { type: "BUILD_SHIP", edge: S2 });
    expect(markerIds(after)).not.toContain("vp-1");
    expect(after.zones["vp-p0"]!.contents["vpToken"]).toBe(1);
    expect(computeVP(after, "p0")).toBe(before + 1);
  });

  it("moving a ship onto the token takes it", () => {
    // A ship on S1, and a second one along the coast with an open end, moved on past S1.
    let s = withPiece(inMainPhase(only("vp-1", "dev-1")), "settlement", "p0", {
      vertex: COAST,
    });
    s = withPiece(s, "ship", "p0", { edge: S1 });
    s = withPiece(s, "ship", "p0", { edge: COAST_B });
    const moved = act(s, "p0", { type: "MOVE_SHIP", from: COAST_B, to: S2 });
    expect(markerIds(moved)).not.toContain("vp-1");
    expect(moved.zones["vp-p0"]!.contents["vpToken"]).toBe(1);
  });
});

describe("development cards on the water", () => {
  it("setup deals one card per marker from the deck into a hidden zone", () => {
    const s = game();
    expect(deckSize(s)).toBe(24);
    expect(s.zones["board-devcards"]!.visibility).toBe("hidden");
    expect(Object.values(s.zones["board-devcards"]!.contents).reduce((a, b) => a + b, 0)).toBe(1);
    for (const viewer of ["p0", "p1", "spectator"] as const) {
      const zone = viewFor(s, viewer).zones["board-devcards"]!;
      expect(zone.contents).toBeUndefined();
      expect(zone.count).toBe(1);
    }
  });

  it("a ship reaching the card takes it as if bought this turn", () => {
    const s = sailing(2, only("dev-1"));
    const after = act(s, "p0", { type: "BUILD_SHIP", edge: S3 });
    expect(markerIds(after)).toEqual([]);
    const fresh = Object.values(after.zones["devnew-p0"]!.contents).reduce((a, b) => a + b, 0);
    expect(fresh).toBe(1);
    expect(Object.values(after.zones["board-devcards"]!.contents).every((n) => n === 0)).toBe(true);
    // Not playable this turn.
    expect(types(after)).not.toContain("PLAY_KNIGHT");
  });

  it("a victory point card counts at once", () => {
    const s = sailing(2, only("dev-1"));
    // Swap whatever was dealt for a VP card (keeping the deck's totals).
    const board = s.zones["board-devcards"]!.contents;
    const deck = s.zones["devdeck"]!.contents;
    for (const [card, n] of Object.entries(board)) {
      deck[card] = (deck[card] ?? 0) + n;
      board[card] = 0;
    }
    deck["victoryPoint"]! -= 1;
    board["victoryPoint"] = 1;
    const before = computeVP(s, "p0");
    expect(computeVP(act(s, "p0", { type: "BUILD_SHIP", edge: S3 }), "p0")).toBe(before + 1);
  });

  it("with development cards switched off, no cards are dealt and the markers go", () => {
    const s = createGame(
      map(MARKERS),
      { modules: MODULES, options: { features: { devCards: false } } },
      ["p0", "p1"],
      "lost",
    );
    expect(markerIds(s)).toEqual(["harbor-1", "vp-1"]);
    expect(deckSize(s)).toBe(25);
  });
});

describe("harbors on the water", () => {
  it("a ship reaching a harbor takes it; it must be placed next to your building", () => {
    const s = sailing(0);
    const after = act(s, "p0", { type: "BUILD_SHIP", edge: S1 });
    expect(markerIds(after)).not.toContain("harbor-1");
    expect(after.decisions.at(-1)!.kind).toBe("PLACE_HARBOR");
    const spots = legalActions(after, "p0").flatMap((a) =>
      a.type === "PLACE_HARBOR" ? [a.edge] : [],
    );
    expect(spots.sort()).toEqual([COAST_A, COAST_B].sort());
    expect(new Set(types(after))).toEqual(new Set(["PLACE_HARBOR"]));
  });

  it("a placed harbor works straight away", () => {
    let s = act(sailing(0), "p0", { type: "BUILD_SHIP", edge: S1 });
    expect(tradeRatios(s, "p0")["wheat"]).toBe(4);
    s = act(s, "p0", { type: "PLACE_HARBOR", edge: COAST_B });
    expect(s.decisions.at(-1)!.kind).toBe("MAIN");
    expect(s.map.ports).toContainEqual({ edgeId: COAST_B, type: "wheat2to1" });
    expect(tradeRatios(s, "p0")["wheat"]).toBe(2);
    expect(held(s, "p0")).toEqual([]);
  });

  it("harbors keep at least one edge between them", () => {
    let s = act(sailing(0), "p0", { type: "BUILD_SHIP", edge: S1 });
    s.map.ports.push({ edgeId: COAST_A, type: "any3to1" });
    // COAST_B shares a corner with COAST_A, and COAST_A already has a harbor.
    expectCode(s, "p0", { type: "PLACE_HARBOR", edge: COAST_B }, "ILLEGAL_PLACEMENT");
    expectCode(s, "p0", { type: "PLACE_HARBOR", edge: COAST_A }, "ILLEGAL_PLACEMENT");
  });

  it("with nowhere to place it, you keep it and place it later in your main step", () => {
    let s = sailing(0);
    s.map.ports.push({ edgeId: COAST_A, type: "any3to1" });
    s = act(s, "p0", { type: "BUILD_SHIP", edge: S1 });
    expect(s.decisions.at(-1)!.kind).toBe("MAIN");
    expect(held(s, "p0")).toEqual(["wheat2to1"]);
    expect(types(s)).not.toContain("PLACE_HARBOR");

    // A new coastal settlement away from the other harbor opens a spot.
    s = withPiece(s, "settlement", "p0", { vertex: SOUTH });
    const spots = legalActions(s, "p0").flatMap((a) => (a.type === "PLACE_HARBOR" ? [a.edge] : []));
    expect(spots).toEqual([SOUTH_EDGE]);
    s = act(s, "p0", { type: "PLACE_HARBOR", edge: SOUTH_EDGE });
    expect(held(s, "p0")).toEqual([]);
    expect(s.decisions.at(-1)!.kind).toBe("MAIN");
    expect(tradeRatios(s, "p0")["wheat"]).toBe(2);
  });

  it("a player not holding a harbor can't place one", () => {
    const s = sailing(0);
    expectCode(s, "p0", { type: "PLACE_HARBOR", edge: COAST_A }, "INVALID_CHOICE");
  });
});

describe("base no-change", () => {
  it("a base game ignores markers on the map", () => {
    const { scenario: _scenario, ...m } = map(MARKERS);
    const s = createGame({ ...m, hexes: MAIN }, { modules: ["base"] }, ["p0", "p1"], "x");
    expect(deckSize(s)).toBe(25);
    expect(s.zones["board-devcards"]).toBeUndefined();
  });
});
