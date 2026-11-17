import {
  reject,
  runCanPlace,
  runOnPlace,
  runStealItem,
  runStealOptions,
  type ActionContext,
  type ActionHandlers,
  type RulesModule,
} from "../../module";
import { nextInt, shuffle } from "../../rng";
import type { Decision, GameEvent, GameState, PlayerId } from "../../types";
import { BASE_RESOURCES } from "./data";
import {
  buildingAt,
  cardList,
  decision,
  featureOn,
  handOf,
  handSize,
  isLandHex,
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
  if (featureOn(draft, "robber")) draft.decisions.push(moveRobberDecision(roller));
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

/** Players with a building on `hex`, other than `thief`, in seat order. */
function ownersOn(state: GameState, hex: string, thief: PlayerId): PlayerId[] {
  const owners = new Set<PlayerId>();
  for (const vertex of state.graph.hexVertices.get(hex) ?? []) {
    const owner = buildingAt(state, vertex)?.owner;
    if (owner && owner !== thief) owners.add(owner);
  }
  return state.players.filter((p) => owners.has(p));
}

/**
 * What `thief` may take from `victim`: "card" (a random resource card) if they hold any, plus
 * whatever modules offer for this `source` (e.g. a cloth when the pirate robs).
 */
export function theftChoices(
  state: GameState,
  thief: PlayerId,
  victim: PlayerId,
  source: string,
  modules: RulesModule[],
): string[] {
  return [
    ...(handSize(state, victim) > 0 ? ["card"] : []),
    ...runStealOptions(modules, state, thief, victim, source),
  ];
}

/**
 * After the robber (or the pirate) moves: rob one of `owners` who has something to take. With a
 * single victim and only cards to take it happens at once; otherwise the thief picks (STEAL).
 * `choices` is only put on the step when a module offers more than cards, so base games are
 * unchanged.
 */
export function rob(
  draft: GameState,
  thief: PlayerId,
  owners: PlayerId[],
  source: string,
  ctx: ActionContext,
): void {
  const choices: Record<PlayerId, string[]> = {};
  for (const p of owners) {
    const c = theftChoices(draft, thief, p, source, ctx.modules);
    if (c.length > 0) choices[p] = c;
  }
  const victims = Object.keys(choices);
  const onlyCards = victims.every((p) => choices[p]!.length === 1 && choices[p]![0] === "card");
  if (victims.length === 1 && onlyCards) return steal(draft, thief, victims[0]!, ctx.events);
  if (victims.length === 0) return;
  draft.decisions.push(
    decision("STEAL", thief, ["STEAL"], onlyCards ? { victims } : { victims, choices }),
  );
}

/** Take one random card. Only the thief and the victim learn which resource it was. */
export function steal(
  draft: GameState,
  thief: PlayerId,
  victim: PlayerId,
  events: GameEvent[],
): void {
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
    validate(state, player, { hex }, { modules }) {
      if (!state.graph.hexKeys.has(hex) || !isLandHex(state, hex) || hex === robberHex(state)) {
        return reject("ILLEGAL_PLACEMENT", "Move the robber to a different land hex.");
      }
      return runCanPlace(modules, state, player, "robber", { hex }, "MOVE_ROBBER");
    },
    apply(draft, player, { hex }, ctx) {
      const { events } = ctx;
      draft.pieces["robber"]!.at = { hex };
      events.push({ type: "MOVED_ROBBER", text: `${player} moved the robber`, data: { hex } });
      runOnPlace(ctx.modules, draft, draft.pieces["robber"]!, ctx);
      popDecision(draft);
      rob(draft, player, ownersOn(draft, hex, player), "robber", ctx);
    },
    candidates: (s) => [...s.graph.hexKeys].map((hex) => ({ type: "MOVE_ROBBER", hex })),
  },

  STEAL: {
    validate(state, _player, { from, what }) {
      const data = state.decisions.at(-1)!.data;
      const victims = data?.["victims"] as PlayerId[];
      if (!victims.includes(from)) return reject("INVALID_CHOICE", "Pick a player to rob.");
      const choices = (data?.["choices"] as Record<PlayerId, string[]> | undefined)?.[from] ?? [
        "card",
      ];
      return choices.includes(what ?? "card")
        ? null
        : reject("INVALID_CHOICE", "That player has nothing like that to take.");
    },
    apply(draft, player, { from, what }, { events, modules }) {
      if (what === undefined || what === "card") steal(draft, player, from, events);
      else runStealItem(modules, draft, player, from, what, events);
      popDecision(draft);
    },
    candidates(s) {
      const data = s.decisions.at(-1)!.data;
      const choices = data?.["choices"] as Record<PlayerId, string[]> | undefined;
      return ((data?.["victims"] as PlayerId[] | undefined) ?? []).flatMap((from) =>
        (choices?.[from] ?? ["card"]).map((what) =>
          what === "card"
            ? { type: "STEAL" as const, from }
            : { type: "STEAL" as const, from, what },
        ),
      );
    },
  },
};
