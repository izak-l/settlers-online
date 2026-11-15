import { hexKey } from "../board/hex";
import type { EdgeId, VertexId } from "../board/graph";
import { nextInt } from "../rng";
import { reject, runProduce, runRollDice, type ActionHandlers, type RulesModule } from "../module";
import type { Decision, GameEvent, GameState, Piece, PlayerId, Resources } from "../types";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export const BASE_RESOURCES = ["wood", "brick", "sheep", "wheat", "ore"] as const;
const BANK_START = 19;

const TERRAIN_RESOURCE: Record<string, string> = {
  forest: "wood",
  hills: "brick",
  pasture: "sheep",
  fields: "wheat",
  mountains: "ore",
};

export const PIECE_LIMITS: Record<string, number> = { road: 15, settlement: 5, city: 4 };

export const COSTS: Record<string, Resources> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
};

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

function decision(
  kind: string,
  player: PlayerId,
  allowed: string[],
  data?: Record<string, unknown>,
): Decision {
  return {
    kind,
    actors: [player],
    pendingFrom: [player],
    allowed,
    module: "base",
    ...(data ? { data } : {}),
  };
}

export const rollDecision = (p: PlayerId): Decision => decision("ROLL", p, ["ROLL"]);

export const mainDecision = (p: PlayerId): Decision =>
  decision("MAIN", p, ["BUILD_ROAD", "BUILD_SETTLEMENT", "BUILD_CITY", "END_TURN"]);

const setupSettlement = (p: PlayerId, round: number): Decision =>
  decision("PLACE_SETTLEMENT", p, ["PLACE_SETTLEMENT"], { round });

const setupRoad = (p: PlayerId, round: number): Decision =>
  decision("PLACE_ROAD", p, ["PLACE_ROAD"], { round });

/** Pop the resolved decision and make whoever is next the active player. */
function popDecision(draft: GameState): void {
  draft.decisions.pop();
  const next = draft.decisions.at(-1);
  if (next) draft.turn.activePlayer = next.actors[0]!;
}

// ---------------------------------------------------------------------------
// Board queries
// ---------------------------------------------------------------------------

function buildingAt(state: GameState, vertex: VertexId): Piece | undefined {
  return Object.values(state.pieces).find((p) => "vertex" in p.at && p.at.vertex === vertex);
}

function roadAt(state: GameState, edge: EdgeId): Piece | undefined {
  return Object.values(state.pieces).find((p) => "edge" in p.at && p.at.edge === edge);
}

function countOwned(state: GameState, player: PlayerId, type: string): number {
  return Object.values(state.pieces).filter((p) => p.owner === player && p.type === type).length;
}

/** Vertex is free and no neighbouring vertex has a building. */
function distanceRuleOk(state: GameState, vertex: VertexId): boolean {
  const v = state.graph.vertices.get(vertex);
  if (!v || buildingAt(state, vertex)) return false;
  return v.neighbors.every((n) => !buildingAt(state, n));
}

/** A road connects at an endpoint with your building, or with your road unless an opponent's building sits there. */
function roadConnects(state: GameState, player: PlayerId, edge: EdgeId): boolean {
  for (const vertex of state.graph.edges.get(edge)!.vertices) {
    const building = buildingAt(state, vertex);
    if (building?.owner === player) return true;
    if (building) continue; // opponent's building blocks the road network here
    const edges = state.graph.vertices.get(vertex)!.edges;
    if (edges.some((e) => e !== edge && roadAt(state, e)?.owner === player)) return true;
  }
  return false;
}

function touchesOwnRoad(state: GameState, player: PlayerId, vertex: VertexId): boolean {
  return state.graph.vertices.get(vertex)!.edges.some((e) => roadAt(state, e)?.owner === player);
}

// ---------------------------------------------------------------------------
// Pieces and resources
// ---------------------------------------------------------------------------

function newPieceId(state: GameState, type: string, owner: PlayerId): string {
  const prefix = `${type}-${owner}-`;
  let n = 0;
  for (const id of Object.keys(state.pieces)) {
    if (!id.startsWith(prefix)) continue;
    const k = Number(id.slice(prefix.length));
    if (Number.isInteger(k) && k >= n) n = k + 1;
  }
  return `${prefix}${n}`;
}

function addPiece(draft: GameState, type: string, owner: PlayerId, at: Piece["at"]): void {
  const id = newPieceId(draft, type, owner);
  draft.pieces[id] = { id, type, owner, at };
}

function handOf(state: GameState, player: PlayerId): Resources {
  return state.zones[`hand-${player}`]!.contents;
}

function canAfford(state: GameState, player: PlayerId, cost: Resources): boolean {
  const hand = handOf(state, player);
  return Object.entries(cost).every(([r, n]) => (hand[r] ?? 0) >= n);
}

/** Move `n` of a resource between two zones' contents. */
function transfer(from: Resources, to: Resources, resource: string, n: number): void {
  from[resource] = (from[resource] ?? 0) - n;
  to[resource] = (to[resource] ?? 0) + n;
}

function pay(draft: GameState, player: PlayerId, cost: Resources): void {
  const hand = handOf(draft, player);
  const bank = draft.zones["bank"]!.contents;
  for (const [r, n] of Object.entries(cost)) transfer(hand, bank, r, n);
}

function describe(res: Resources): string {
  return Object.entries(res)
    .filter(([, n]) => n > 0)
    .map(([r, n]) => `${n} ${r}`)
    .join(", ");
}

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------

/**
 * Pay out every hex with token `total` (and no robber): 1 per settlement, 2 per city.
 * Bank shortage: if the bank can't pay everyone owed a resource, nobody gets it,
 * unless only one player is owed it — they get whatever is left.
 */
export function produce(draft: GameState, total: number, events: GameEvent[] = []): void {
  const robber = Object.values(draft.pieces).find((p) => p.type === "robber");
  const robberHex = robber && "hex" in robber.at ? robber.at.hex : undefined;

  // owed[resource][player] = amount
  const owed: Record<string, Record<PlayerId, number>> = {};
  for (const hex of draft.map.hexes) {
    const key = hexKey(hex);
    const resource = TERRAIN_RESOURCE[hex.terrain];
    if (hex.token !== total || !resource || key === robberHex) continue;
    for (const vertex of draft.graph.hexVertices.get(key) ?? []) {
      const b = buildingAt(draft, vertex);
      if (!b?.owner) continue;
      const amount = b.type === "city" ? 2 : b.type === "settlement" ? 1 : 0;
      owed[resource] ??= {};
      owed[resource][b.owner] = (owed[resource][b.owner] ?? 0) + amount;
    }
  }

  const bank = draft.zones["bank"]!.contents;
  for (const [resource, byPlayer] of Object.entries(owed)) {
    const claimants = Object.entries(byPlayer).filter(([, n]) => n > 0);
    const totalOwed = claimants.reduce((sum, [, n]) => sum + n, 0);
    const available = bank[resource] ?? 0;

    if (totalOwed <= available) {
      for (const [p, n] of claimants) transfer(bank, handOf(draft, p), resource, n);
    } else if (claimants.length === 1) {
      const [p] = claimants[0]!;
      transfer(bank, handOf(draft, p), resource, available);
    } else {
      events.push({
        type: "BANK_SHORTAGE",
        text: `The bank is short of ${resource}; nobody receives it.`,
      });
      continue;
    }
    for (const [p, n] of claimants) {
      const got = claimants.length === 1 ? Math.min(n, available) : n;
      if (got > 0) events.push({ type: "PRODUCED", text: `${p} received ${got} ${resource}` });
    }
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

const allVertices = (s: GameState): VertexId[] => [...s.graph.vertices.keys()];
const allEdges = (s: GameState): EdgeId[] => [...s.graph.edges.keys()];

function checkLimitAndCost(state: GameState, player: PlayerId, type: string) {
  if (countOwned(state, player, type) >= PIECE_LIMITS[type]!) {
    return reject("PIECE_LIMIT", `You have no ${type}s left.`);
  }
  if (!canAfford(state, player, COSTS[type]!)) {
    return reject("CANNOT_AFFORD", `A ${type} costs ${describe(COSTS[type]!)}.`);
  }
  return null;
}

const actions: ActionHandlers = {
  PLACE_SETTLEMENT: {
    validate(state, _player, { vertex }) {
      if (!distanceRuleOk(state, vertex)) {
        return reject(
          "ILLEGAL_PLACEMENT",
          "Settlements need a free spot with no building next to it.",
        );
      }
      return null;
    },
    apply(draft, player, { vertex }, { events }) {
      addPiece(draft, "settlement", player, { vertex });
      events.push({ type: "PLACED_SETTLEMENT", text: `${player} placed a settlement` });

      const round = draft.decisions.at(-1)!.data?.["round"];
      if (round === 2) {
        const gained: Resources = {};
        const bank = draft.zones["bank"]!.contents;
        for (const key of draft.graph.vertices.get(vertex)!.hexes) {
          const hex = draft.map.hexes.find((hx) => hexKey(hx) === key);
          const resource = hex ? TERRAIN_RESOURCE[hex.terrain] : undefined;
          if (!resource || (bank[resource] ?? 0) === 0) continue;
          transfer(bank, handOf(draft, player), resource, 1);
          gained[resource] = (gained[resource] ?? 0) + 1;
        }
        if (Object.keys(gained).length > 0) {
          events.push({
            type: "STARTING_RESOURCES",
            text: `${player} received ${describe(gained)}`,
          });
        }
      }

      popDecision(draft);
      // The matching road must touch this settlement.
      const road = draft.decisions.at(-1)!;
      road.data = { ...road.data, mustTouch: vertex };
    },
    candidates: (s) => allVertices(s).map((vertex) => ({ type: "PLACE_SETTLEMENT", vertex })),
  },

  PLACE_ROAD: {
    validate(state, _player, { edge }) {
      const e = state.graph.edges.get(edge);
      const mustTouch = state.decisions.at(-1)!.data?.["mustTouch"];
      if (!e || roadAt(state, edge) || !e.vertices.includes(mustTouch as VertexId)) {
        return reject("ILLEGAL_PLACEMENT", "Your road must touch the settlement you just placed.");
      }
      return null;
    },
    apply(draft, player, { edge }, { events }) {
      addPiece(draft, "road", player, { edge });
      events.push({ type: "PLACED_ROAD", text: `${player} placed a road` });
      popDecision(draft);
      if (draft.decisions.at(-1)?.kind === "ROLL") draft.turn.number = 1; // setup is over
    },
    candidates: (s) => allEdges(s).map((edge) => ({ type: "PLACE_ROAD", edge })),
  },

  ROLL: {
    validate: () => null,
    apply(draft, player, _action, { events, modules }) {
      const dice = runRollDice(modules, draft);
      const total = Object.values(dice).reduce((a, b) => a + b, 0);
      draft.moduleState["base"] = { ...(draft.moduleState["base"] as object), lastRoll: dice };
      events.push({ type: "ROLLED", text: `${player} rolled ${total}`, data: { dice, total } });
      // A 7 produces nothing. Discards, robber and stealing arrive in M5.
      if (total !== 7) runProduce(modules, draft, total, events);
      draft.decisions.pop();
      draft.decisions.push(mainDecision(player));
    },
    candidates: () => [{ type: "ROLL" }],
  },

  BUILD_ROAD: {
    validate(state, player, { edge }) {
      const fail = checkLimitAndCost(state, player, "road");
      if (fail) return fail;
      if (
        !state.graph.edges.has(edge) ||
        roadAt(state, edge) ||
        !roadConnects(state, player, edge)
      ) {
        return reject("ILLEGAL_PLACEMENT", "Roads must connect to your own road or building.");
      }
      return null;
    },
    apply(draft, player, { edge }, { events }) {
      pay(draft, player, COSTS["road"]!);
      addPiece(draft, "road", player, { edge });
      events.push({ type: "BUILT_ROAD", text: `${player} built a road` });
    },
    candidates: (s) => allEdges(s).map((edge) => ({ type: "BUILD_ROAD", edge })),
  },

  BUILD_SETTLEMENT: {
    validate(state, player, { vertex }) {
      const fail = checkLimitAndCost(state, player, "settlement");
      if (fail) return fail;
      if (!distanceRuleOk(state, vertex) || !touchesOwnRoad(state, player, vertex)) {
        return reject(
          "ILLEGAL_PLACEMENT",
          "Settlements must touch your road and have no building next to them.",
        );
      }
      return null;
    },
    apply(draft, player, { vertex }, { events }) {
      pay(draft, player, COSTS["settlement"]!);
      addPiece(draft, "settlement", player, { vertex });
      events.push({ type: "BUILT_SETTLEMENT", text: `${player} built a settlement` });
    },
    candidates: (s) => allVertices(s).map((vertex) => ({ type: "BUILD_SETTLEMENT", vertex })),
  },

  BUILD_CITY: {
    validate(state, player, { vertex }) {
      const fail = checkLimitAndCost(state, player, "city");
      if (fail) return fail;
      const b = buildingAt(state, vertex);
      if (b?.type !== "settlement" || b.owner !== player) {
        return reject("ILLEGAL_PLACEMENT", "Cities replace one of your settlements.");
      }
      return null;
    },
    apply(draft, player, { vertex }, { events }) {
      pay(draft, player, COSTS["city"]!);
      delete draft.pieces[buildingAt(draft, vertex)!.id];
      addPiece(draft, "city", player, { vertex });
      events.push({ type: "BUILT_CITY", text: `${player} upgraded to a city` });
    },
    candidates: (s) => allVertices(s).map((vertex) => ({ type: "BUILD_CITY", vertex })),
  },

  END_TURN: {
    validate: () => null,
    apply(draft, player, _action, { events }) {
      const next = draft.players[(draft.players.indexOf(player) + 1) % draft.players.length]!;
      draft.decisions.pop();
      draft.turn = { number: draft.turn.number + 1, activePlayer: next };
      draft.decisions.push(rollDecision(next));
      events.push({ type: "TURN_ENDED", text: `${player} ended their turn` });
    },
    candidates: () => [{ type: "END_TURN" }],
  },
};

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const baseModule: RulesModule = {
  id: "base",
  version: 1,
  resources: [...BASE_RESOURCES],
  actions,
  hooks: {
    rollDice(draft) {
      const red = nextInt(draft.rng, 6);
      const yellow = nextInt(red.rng, 6);
      draft.rng = yellow.rng;
      return { red: red.value + 1, yellow: yellow.value + 1 };
    },
    produce,
    vpSources(state, player) {
      return countOwned(state, player, "settlement") + 2 * countOwned(state, player, "city");
    },
  },
  setup(draft) {
    const empty = (): Resources => Object.fromEntries(BASE_RESOURCES.map((r) => [r, 0]));
    draft.zones["bank"] = {
      id: "bank",
      visibility: "public",
      contents: Object.fromEntries(BASE_RESOURCES.map((r) => [r, BANK_START])),
    };
    for (const p of draft.players) {
      draft.zones[`hand-${p}`] = {
        id: `hand-${p}`,
        owner: p,
        visibility: "count",
        contents: empty(),
      };
    }

    const start = draft.map.hexes.find((hx) => hx.terrain === draft.map.robberStart);
    if (start)
      draft.pieces["robber"] = { id: "robber", type: "robber", at: { hex: hexKey(start) } };

    draft.moduleState["base"] = {};

    // Snake order: 1→N then N→1, each placing a settlement then a road.
    const n = draft.players.length;
    const order = [...draft.players, ...[...draft.players].reverse()];
    const steps = order.flatMap((p, i) => {
      const round = i < n ? 1 : 2;
      return [setupSettlement(p, round), setupRoad(p, round)];
    });
    // The stack's top is its last element, so the first step goes last. p0's first ROLL waits at the bottom.
    draft.decisions = [rollDecision(draft.players[0]!), ...steps.reverse()];
    draft.turn = { number: 0, activePlayer: draft.players[0]! };
  },
};
