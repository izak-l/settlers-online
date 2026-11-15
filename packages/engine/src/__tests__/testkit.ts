import { expect } from "vitest";
import { vertexId, edgeId, type Hex } from "../board";
import type { Action } from "../actions";
import { apply, computeVP, createGame, legalActions } from "../engine";
import { BASE_RESOURCES, PIECE_LIMITS, mainDecision, rollDecision } from "../modules/base";
import { baseInvariantViolations } from "../modules/base/invariants";
import type { GameState, MapInput, PieceLocation, PlayerId, Resources } from "../types";

/**
 * Fixed 19-hex board. Desert in the centre; every other hex has a known terrain and token
 * so production tests can name exact hexes.
 */
const RING_1: [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];
const RING_2: [number, number][] = [
  [2, 0],
  [2, -1],
  [2, -2],
  [1, -2],
  [0, -2],
  [-1, -1],
  [-2, 0],
  [-2, 1],
  [-2, 2],
  [-1, 2],
  [0, 2],
  [1, 1],
];
const TERRAINS = [
  "forest",
  "hills",
  "pasture",
  "fields",
  "mountains",
  "forest",
  "pasture",
  "fields",
  "hills",
  "forest",
  "mountains",
  "pasture",
  "fields",
  "hills",
  "forest",
  "mountains",
  "pasture",
  "fields",
];
const TOKENS = [6, 8, 5, 4, 9, 10, 11, 3, 2, 12, 3, 4, 5, 6, 8, 9, 10, 11];

export function fixtureMap(): MapInput {
  const ring = [...RING_1, ...RING_2];
  return {
    id: "fixture-19",
    vpToWin: 10,
    hexes: [
      { q: 0, r: 0, terrain: "desert" },
      ...ring.map(([q, r], i) => ({ q, r, terrain: TERRAINS[i]!, token: TOKENS[i]! })),
    ],
    ports: [],
    robberStart: "desert",
  };
}
// Key hexes on the fixture: (1,0) forest 6, (1,-1) hills 8, (0,1) forest 10.

export const h = (q: number, r: number): Hex => ({ q, r });
export const v = (a: Hex, b: Hex, c: Hex): string => vertexId(a, b, c);
export const e = (a: Hex, b: Hex): string => edgeId(a, b);

export function newGame(seats: PlayerId[] = ["p0", "p1", "p2"], seed = "seed"): GameState {
  return createGame(fixtureMap(), { modules: ["base"] }, seats, seed);
}

/** Apply an action that must succeed; checks invariants afterwards. */
export function act(state: GameState, actor: PlayerId | "system", action: Action): GameState {
  const res = apply(state, actor, action);
  if (!res.ok) throw new Error(`${actor} ${action.type} rejected: ${res.code} ${res.message}`);
  checkInvariants(res.state);
  return res.state;
}

/** Who must act on the top decision. */
export function topActor(state: GameState): PlayerId {
  const top = state.decisions[state.decisions.length - 1];
  if (!top) throw new Error("decision stack is empty");
  return top.pendingFrom[0]!;
}

/** Resolve every decision above MAIN (discards, robber, steal) by taking the first legal action. */
export function resolveUntilMain(state: GameState): GameState {
  let s = state;
  while (s.decisions.at(-1)?.kind !== "MAIN") {
    const p = topActor(s);
    s = act(s, p, legalActions(s, p)[0]!);
  }
  return s;
}

/** Play every setup step by taking the first legal action. */
export function runSetup(state: GameState): GameState {
  let s = state;
  while (s.decisions.at(-1)?.kind !== "ROLL") {
    const p = topActor(s);
    s = act(s, p, legalActions(s, p)[0]!);
  }
  return s;
}

// ---- direct state construction for focused rule tests ----

function clone(state: GameState): GameState {
  const { graph, ...rest } = state;
  return { ...(JSON.parse(JSON.stringify(rest)) as Omit<GameState, "graph">), graph };
}

/** Skip setup: `player` is in their main step on turn 1, with no pieces placed. */
export function inMainPhase(state: GameState, player: PlayerId = "p0"): GameState {
  const s = clone(state);
  s.decisions = [mainDecision(player)];
  s.turn = { number: 1, activePlayer: player };
  return s;
}

/** Skip setup: `player` is about to roll on turn 1, with no pieces placed. */
export function inRollPhase(state: GameState, player: PlayerId = "p0"): GameState {
  const s = clone(state);
  s.decisions = [rollDecision(player)];
  s.turn = { number: 1, activePlayer: player };
  return s;
}

/** Replace a player's hand exactly (returning their old cards to the bank first). */
export function setHand(state: GameState, player: PlayerId, res: Resources): GameState {
  const s = clone(state);
  const hand = s.zones[`hand-${player}`]!.contents;
  const bank = s.zones["bank"]!.contents;
  for (const [r, n] of Object.entries(hand)) {
    bank[r] = (bank[r] ?? 0) + n;
    hand[r] = 0;
  }
  return give(s, player, res);
}

const seedCache = new Map<number, string>();
/** A seed whose first roll (with no setup) totals `total`. Setup never touches the RNG. */
export function seedRolling(total: number, seats: PlayerId[] = ["p0", "p1", "p2"]): string {
  const key = total * 10 + seats.length;
  if (seedCache.has(key)) return seedCache.get(key)!;
  for (let i = 0; i < 10_000; i++) {
    const seed = `roll-${total}-${i}`;
    const res = apply(inRollPhase(newGame(seats, seed)), "p0", { type: "ROLL" });
    if (res.ok && res.events[0]!.data!["total"] === total) {
      seedCache.set(key, seed);
      return seed;
    }
  }
  throw new Error(`no seed rolls ${total}`);
}

/** Put dev cards straight into a player's playable hand, taken from the deck. */
export function giveDev(
  state: GameState,
  player: PlayerId,
  cards: Resources,
  zone = "dev",
): GameState {
  const s = clone(state);
  for (const [c, n] of Object.entries(cards)) {
    s.zones["devdeck"]!.contents[c] = (s.zones["devdeck"]!.contents[c] ?? 0) - n;
    const z = s.zones[`${zone}-${player}`]!.contents;
    z[c] = (z[c] ?? 0) + n;
  }
  return s;
}

/**
 * A simple path of `n` edges starting at `from`, never revisiting a vertex or any vertex in `avoid`.
 * Returns the edges and the vertices visited (in order).
 */
export function pathFrom(
  state: GameState,
  from: string,
  n: number,
  avoid: Set<string> = new Set(),
): { edges: string[]; vertices: string[] } {
  const vertices = [from];
  const edges: string[] = [];
  const seen = new Set([from, ...avoid]);
  let at = from;
  while (edges.length < n) {
    const next = state.graph.vertices
      .get(at)!
      .edges.map((ed) => {
        const [a, b] = state.graph.edges.get(ed)!.vertices;
        return { ed, to: a === at ? b : a };
      })
      .find(({ to }) => !seen.has(to));
    if (!next) throw new Error(`path from ${from} got stuck after ${edges.length} edges`);
    edges.push(next.ed);
    vertices.push(next.to);
    seen.add(next.to);
    at = next.to;
  }
  return { edges, vertices };
}

let pieceCounter = 0;
export function withPiece(
  state: GameState,
  type: string,
  owner: PlayerId,
  at: PieceLocation,
): GameState {
  const s = clone(state);
  const id = `${type}-${owner}-t${pieceCounter++}`;
  s.pieces[id] = { id, type, owner, at };
  return s;
}

/** Move resources from the bank into a player's hand (keeps conservation intact). */
export function give(state: GameState, player: PlayerId, res: Resources): GameState {
  const s = clone(state);
  for (const [r, n] of Object.entries(res)) {
    s.zones["bank"]!.contents[r] = (s.zones["bank"]!.contents[r] ?? 0) - n;
    s.zones[`hand-${player}`]!.contents[r] = (s.zones[`hand-${player}`]!.contents[r] ?? 0) + n;
  }
  return s;
}

export function hand(state: GameState, player: PlayerId): Resources {
  return state.zones[`hand-${player}`]!.contents;
}

export function countPieces(state: GameState, owner: PlayerId, type: string): number {
  return Object.values(state.pieces).filter((p) => p.owner === owner && p.type === type).length;
}

// ---- invariants (CLAUDE.md "Testing invariants") ----

export function checkInvariants(state: GameState): void {
  expect(baseInvariantViolations(state)).toEqual([]);
  for (const r of BASE_RESOURCES) {
    let total = state.zones["bank"]!.contents[r] ?? 0;
    for (const p of state.players) total += state.zones[`hand-${p}`]!.contents[r] ?? 0;
    expect(total, `conservation of ${r}`).toBe(19);
  }
  for (const zone of Object.values(state.zones)) {
    for (const [r, n] of Object.entries(zone.contents)) {
      expect(n, `${zone.id}.${r} is negative`).toBeGreaterThanOrEqual(0);
    }
  }
  for (const p of state.players) {
    for (const [type, limit] of Object.entries(PIECE_LIMITS)) {
      expect(countPieces(state, p, type), `${p} ${type} limit`).toBeLessThanOrEqual(limit);
    }
    const vpCards =
      (state.zones[`dev-${p}`]?.contents["victoryPoint"] ?? 0) +
      (state.zones[`devnew-${p}`]?.contents["victoryPoint"] ?? 0);
    const awards = state.moduleState["base"] as {
      longestRoad?: string | null;
      largestArmy?: string | null;
    };
    const awardVP = (awards.longestRoad === p ? 2 : 0) + (awards.largestArmy === p ? 2 : 0);
    const expectedVP =
      countPieces(state, p, "settlement") + 2 * countPieces(state, p, "city") + vpCards + awardVP;
    expect(computeVP(state, p), `${p} VP`).toBe(expectedVP);
  }
  // Dev cards are conserved: deck + every hand (old and new) + played = 25.
  let devTotal = 0;
  for (const zone of Object.values(state.zones)) {
    if (zone.id === "devdeck" || /^(dev|devnew|played)-/.test(zone.id)) {
      devTotal += Object.values(zone.contents).reduce((a, b) => a + b, 0);
    }
  }
  expect(devTotal, "dev card conservation").toBe(25);
  if (state.winner === undefined) expect(state.decisions.length).toBeGreaterThan(0);
}
