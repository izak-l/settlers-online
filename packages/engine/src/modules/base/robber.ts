import { reject, type ActionHandlers } from "../../module";
import { nextInt, shuffle } from "../../rng";
import type { Decision, GameEvent, GameState, PlayerId } from "../../types";
import { BASE_RESOURCES } from "./data";
import {
  buildingAt,
  cardList,
  decision,
  handOf,
  handSize,
  popDecision,
  robberHex,
  transfer,
} from "./helpers";

/** Players holding more than this many cards discard on a 7. */
const HAND_LIMIT = 7;

export const moveRobberDecision = (p: PlayerId): Decision =>
  decision("MOVE_ROBBER", p, ["MOVE_ROBBER"]);

/**
 * After a 7: everyone over the hand limit discards half (rounded down) at the same time,
 * then the roller moves the robber. Pushed on top of whatever comes next (the main step).
 */
export function startSevenFlow(draft: GameState, roller: PlayerId): void {
  draft.decisions.push(moveRobberDecision(roller));
  const amounts: Record<PlayerId, number> = {};
  for (const p of draft.players) {
    const size = handSize(draft, p);
    if (size > HAND_LIMIT) amounts[p] = Math.floor(size / 2);
  }
  const discarders = Object.keys(amounts);
  if (discarders.length > 0) {
    draft.decisions.push({
      kind: "DISCARD",
      actors: discarders,
      pendingFrom: [...discarders],
      allowed: ["DISCARD"],
      module: "base",
      data: { amounts },
      timer: "short",
    });
  }
}

/** Players `thief` can rob on `hex`: a building there, not their own, and at least one card. */
function victimsOn(state: GameState, hex: string, thief: PlayerId): PlayerId[] {
  const owners = new Set<PlayerId>();
  for (const vertex of state.graph.hexVertices.get(hex) ?? []) {
    const owner = buildingAt(state, vertex)?.owner;
    if (owner && owner !== thief && handSize(state, owner) > 0) owners.add(owner);
  }
  return state.players.filter((p) => owners.has(p));
}

/** Take one random card. Only the thief and the victim learn which resource it was. */
function steal(draft: GameState, thief: PlayerId, victim: PlayerId, events: GameEvent[]): void {
  const cards = cardList(handOf(draft, victim));
  const pick = nextInt(draft.rng, cards.length);
  draft.rng = pick.rng;
  const resource = cards[pick.value]!;
  transfer(handOf(draft, victim), handOf(draft, thief), resource, 1);
  events.push({
    type: "STOLE",
    text: `${thief} stole 1 ${resource} from ${victim}`,
    visibleTo: [thief, victim],
    data: { thief, victim, resource },
  });
  events.push({
    type: "STOLE",
    text: `${thief} stole a card from ${victim}`,
    hiddenFrom: [thief, victim],
    data: { thief, victim },
  });
}

export const robberActions: ActionHandlers = {
  DISCARD: {
    validate(state, player, { resources }) {
      const owed = (state.decisions.at(-1)!.data?.["amounts"] as Record<PlayerId, number>)[player]!;
      const hand = handOf(state, player);
      let total = 0;
      for (const [r, n] of Object.entries(resources)) {
        const known = (BASE_RESOURCES as readonly string[]).includes(r);
        if (!known || !Number.isInteger(n) || n < 0 || n > (hand[r] ?? 0)) {
          return reject("INVALID_CHOICE", `Discard exactly ${owed} cards from your hand.`);
        }
        total += n;
      }
      if (total !== owed)
        return reject("INVALID_CHOICE", `Discard exactly ${owed} cards from your hand.`);
      return null;
    },
    apply(draft, player, { resources }, { events }) {
      const bank = draft.zones["bank"]!.contents;
      for (const [r, n] of Object.entries(resources))
        if (n > 0) transfer(handOf(draft, player), bank, r, n);
      const total = Object.values(resources).reduce((a, b) => a + b, 0);
      events.push({
        type: "DISCARDED",
        text: `${player} discarded ${total} cards`,
        data: { count: total },
      });
      const top = draft.decisions.at(-1)!;
      top.pendingFrom = top.pendingFrom.filter((p) => p !== player);
      if (top.pendingFrom.length === 0) popDecision(draft);
    },
    /** Too many combinations to list: one example, chosen from a copy of the RNG (not advanced). */
    candidates(state, player) {
      const owed = (
        state.decisions.at(-1)!.data?.["amounts"] as Record<PlayerId, number> | undefined
      )?.[player];
      if (owed === undefined) return [];
      const { result } = shuffle(cardList(handOf(state, player)), state.rng);
      const resources: Record<string, number> = {};
      for (const r of result.slice(0, owed)) resources[r] = (resources[r] ?? 0) + 1;
      return [{ type: "DISCARD", resources }];
    },
  },

  MOVE_ROBBER: {
    validate(state, _player, { hex }) {
      if (!state.graph.hexKeys.has(hex) || hex === robberHex(state)) {
        return reject("ILLEGAL_PLACEMENT", "Move the robber to a different land hex.");
      }
      return null;
    },
    apply(draft, player, { hex }, { events }) {
      draft.pieces["robber"]!.at = { hex };
      events.push({ type: "MOVED_ROBBER", text: `${player} moved the robber`, data: { hex } });
      popDecision(draft);
      const victims = victimsOn(draft, hex, player);
      if (victims.length === 1) steal(draft, player, victims[0]!, events);
      if (victims.length > 1)
        draft.decisions.push(decision("STEAL", player, ["STEAL"], { victims }));
    },
    candidates: (s) => [...s.graph.hexKeys].map((hex) => ({ type: "MOVE_ROBBER", hex })),
  },

  STEAL: {
    validate(state, _player, { from }) {
      const victims = state.decisions.at(-1)!.data?.["victims"] as PlayerId[];
      return victims.includes(from)
        ? null
        : reject("INVALID_CHOICE", "Pick a player next to the robber.");
    },
    apply(draft, player, { from }, { events }) {
      steal(draft, player, from, events);
      popDecision(draft);
    },
    candidates: (s) =>
      ((s.decisions.at(-1)!.data?.["victims"] as PlayerId[] | undefined) ?? []).map((from) => ({
        type: "STEAL",
        from,
      })),
  },
};
