import { reject, type ActionHandlers } from "../../module";
import { nextInt } from "../../rng";
import type { GameEvent, GameState, PlayerId, Rejection, Resources } from "../../types";
import { BASE_RESOURCES, COSTS, DEV_CARD_NAMES, DEV_DECK, PIECE_LIMITS } from "./data";
import {
  addPiece,
  allEdges,
  baseState,
  canAfford,
  cardList,
  countOwned,
  decision,
  describe,
  handOf,
  pay,
  popDecision,
  roadAt,
  roadConnects,
  transfer,
} from "./helpers";
import { moveRobberDecision } from "./robber";

/**
 * Zones: `devdeck` (hidden counts; drawing at random is the same as a shuffled deck),
 * `dev-<p>` (playable, others see a count), `devnew-<p>` (bought this turn, not yet playable),
 * `played-<p>` (public; knights count toward the army).
 */
export function setupDevCards(draft: GameState): void {
  draft.zones["devdeck"] = { id: "devdeck", visibility: "hidden", contents: { ...DEV_DECK } };
  for (const p of draft.players) {
    for (const [prefix, visibility] of [
      ["dev", "count"],
      ["devnew", "count"],
      ["played", "public"],
    ] as const) {
      draft.zones[`${prefix}-${p}`] = { id: `${prefix}-${p}`, owner: p, visibility, contents: {} };
    }
  }
}

const zone = (s: GameState, id: string): Resources => s.zones[id]!.contents;
const name = (card: string) => DEV_CARD_NAMES[card] ?? card;
const isResource = (r: string) => (BASE_RESOURCES as readonly string[]).includes(r);

/** At the end of your turn, cards you bought become playable. */
export function endTurnDevCards(draft: GameState, player: PlayerId): void {
  const fresh = zone(draft, `devnew-${player}`);
  for (const [card, n] of Object.entries(fresh))
    transfer(fresh, zone(draft, `dev-${player}`), card, n);
  baseState(draft).playedDevThisTurn = false;
}

export function vpCards(state: GameState, player: PlayerId): number {
  return (
    (zone(state, `dev-${player}`)["victoryPoint"] ?? 0) +
    (zone(state, `devnew-${player}`)["victoryPoint"] ?? 0)
  );
}

function checkPlayable(state: GameState, player: PlayerId, card: string): Rejection | null {
  if (baseState(state).playedDevThisTurn) {
    return reject("INVALID_CHOICE", "You've already played a development card this turn.");
  }
  if ((zone(state, `dev-${player}`)[card] ?? 0) < 1) {
    return reject(
      "INVALID_CHOICE",
      `You don't have a ${name(card)} you can play. Cards bought this turn wait until your next turn.`,
    );
  }
  return null;
}

function playCard(draft: GameState, player: PlayerId, card: string, events: GameEvent[]): void {
  transfer(zone(draft, `dev-${player}`), zone(draft, `played-${player}`), card, 1);
  baseState(draft).playedDevThisTurn = true;
  events.push({ type: "PLAYED_DEV_CARD", text: `${player} played ${name(card)}`, data: { card } });
}

function freeRoadOk(state: GameState, player: PlayerId, edge: string): boolean {
  return state.graph.edges.has(edge) && !roadAt(state, edge) && roadConnects(state, player, edge);
}

function canPlaceFreeRoad(state: GameState, player: PlayerId): boolean {
  if (countOwned(state, player, "road") >= PIECE_LIMITS["road"]!) return false;
  return allEdges(state).some((edge) => freeRoadOk(state, player, edge));
}

/** Every way to pick two resources (with repeats): 15 for five resources. */
function pairs(): Resources[] {
  const out: Resources[] = [];
  BASE_RESOURCES.forEach((a, i) =>
    BASE_RESOURCES.slice(i).forEach((b) => out.push(a === b ? { [a]: 2 } : { [a]: 1, [b]: 1 })),
  );
  return out;
}

export const devCardActions: ActionHandlers = {
  BUY_DEV_CARD: {
    validate(state, player) {
      if (!canAfford(state, player, COSTS["devCard"]!)) {
        return reject("CANNOT_AFFORD", `A development card costs ${describe(COSTS["devCard"]!)}.`);
      }
      if (cardList(zone(state, "devdeck")).length === 0) {
        return reject("BANK_EMPTY", "There are no development cards left.");
      }
      return null;
    },
    apply(draft, player, _action, { events }) {
      pay(draft, player, COSTS["devCard"]!);
      const deck = zone(draft, "devdeck");
      const cards = cardList(deck);
      const pick = nextInt(draft.rng, cards.length);
      draft.rng = pick.rng;
      const card = cards[pick.value]!;
      transfer(deck, zone(draft, `devnew-${player}`), card, 1);
      events.push({ type: "BOUGHT_DEV_CARD", text: `${player} bought a development card` });
      events.push({
        type: "DREW_DEV_CARD",
        text: `${player} drew ${name(card)}`,
        visibleTo: [player],
        data: { card },
      });
    },
    candidates: () => [{ type: "BUY_DEV_CARD" }],
  },

  PLAY_KNIGHT: {
    validate: (state, player) => checkPlayable(state, player, "knight"),
    apply(draft, player, _action, { events }) {
      playCard(draft, player, "knight", events);
      // Same as a 7 but with no discards.
      draft.decisions.push(moveRobberDecision(player));
    },
    candidates: () => [{ type: "PLAY_KNIGHT" }],
  },

  PLAY_ROAD_BUILDING: {
    validate: (state, player) => checkPlayable(state, player, "roadBuilding"),
    apply(draft, player, _action, { events }) {
      playCard(draft, player, "roadBuilding", events);
      const left = PIECE_LIMITS["road"]! - countOwned(draft, player, "road");
      const remaining = Math.min(2, left);
      if (remaining > 0 && canPlaceFreeRoad(draft, player)) {
        draft.decisions.push(
          decision("PLACE_FREE_ROAD", player, ["PLACE_FREE_ROAD"], { remaining }),
        );
      }
    },
    candidates: () => [{ type: "PLAY_ROAD_BUILDING" }],
  },

  PLACE_FREE_ROAD: {
    validate(state, player, { edge }) {
      return freeRoadOk(state, player, edge)
        ? null
        : reject("ILLEGAL_PLACEMENT", "Roads must connect to your own road or building.");
    },
    apply(draft, player, { edge }, { events }) {
      addPiece(draft, "road", player, { edge });
      events.push({ type: "BUILT_ROAD", text: `${player} built a free road` });
      const top = draft.decisions.at(-1)!;
      const remaining = (top.data!["remaining"] as number) - 1;
      top.data = { ...top.data, remaining };
      if (remaining === 0 || !canPlaceFreeRoad(draft, player)) popDecision(draft);
    },
    candidates: (s) => allEdges(s).map((edge) => ({ type: "PLACE_FREE_ROAD", edge })),
  },

  PLAY_YEAR_OF_PLENTY: {
    validate(state, player, { resources }) {
      const fail = checkPlayable(state, player, "yearOfPlenty");
      if (fail) return fail;
      const bank = zone(state, "bank");
      let total = 0;
      for (const [r, n] of Object.entries(resources)) {
        if (!isResource(r) || !Number.isInteger(n) || n < 0 || n > (bank[r] ?? 0)) {
          return reject("INVALID_CHOICE", "Pick two resources the bank still has.");
        }
        total += n;
      }
      return total === 2 ? null : reject("INVALID_CHOICE", "Pick exactly two resources.");
    },
    apply(draft, player, { resources }, { events }) {
      playCard(draft, player, "yearOfPlenty", events);
      for (const [r, n] of Object.entries(resources)) {
        if (n > 0) transfer(zone(draft, "bank"), handOf(draft, player), r, n);
      }
      events.push({
        type: "TOOK_FROM_BANK",
        text: `${player} took ${describe(resources)} from the bank`,
      });
    },
    candidates: () => pairs().map((resources) => ({ type: "PLAY_YEAR_OF_PLENTY", resources })),
  },

  PLAY_MONOPOLY: {
    validate(state, player, { resource }) {
      return (
        checkPlayable(state, player, "monopoly") ??
        (isResource(resource) ? null : reject("INVALID_CHOICE", "Pick a resource."))
      );
    },
    apply(draft, player, { resource }, { events }) {
      playCard(draft, player, "monopoly", events);
      let taken = 0;
      for (const p of draft.players) {
        if (p === player) continue;
        const n = handOf(draft, p)[resource] ?? 0;
        if (n > 0) transfer(handOf(draft, p), handOf(draft, player), resource, n);
        taken += n;
      }
      events.push({
        type: "MONOPOLY",
        text: `${player} took ${taken} ${resource} from everyone`,
        data: { resource, taken },
      });
    },
    candidates: () => BASE_RESOURCES.map((resource) => ({ type: "PLAY_MONOPOLY", resource })),
  },
};
