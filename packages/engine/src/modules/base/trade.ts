import { reject, runTradeRatio, type ActionHandlers } from "../../module";
import type { Action } from "../../actions";
import type { GameState, PlayerId, Rejection, Resources } from "../../types";
import { BASE_RESOURCES } from "./data";
import { buildingAt, describe, handOf, popDecision, transfer } from "./helpers";

const DEFAULT_RATIO = 4;
const isResource = (r: string) => (BASE_RESOURCES as readonly string[]).includes(r);

/** Best bank rate for `resource`: 4, or 3 / 2 with a building on a matching port. */
export function tradeRatio(state: GameState, player: PlayerId, resource: string): number {
  let best = DEFAULT_RATIO;
  for (const port of state.map.ports) {
    const edge = state.graph.edges.get(port.edgeId);
    if (!edge || !edge.vertices.some((v) => buildingAt(state, v)?.owner === player)) continue;
    if (port.type === "any3to1") best = Math.min(best, 3);
    if (port.type === `${resource}2to1`) best = Math.min(best, 2);
  }
  return best;
}

interface Offer {
  from: PlayerId;
  give: Resources;
  want: Resources;
  responses: Record<PlayerId, "accept" | "decline">;
}

const offerOf = (state: GameState) => state.decisions.at(-1)!.data as unknown as Offer;

function hasAll(hand: Resources, needed: Resources): boolean {
  return Object.entries(needed).every(([r, n]) => (hand[r] ?? 0) >= n);
}

/** Drop zero entries; null if anything is malformed. */
function clean(res: Resources): Resources | null {
  const out: Resources = {};
  for (const [r, n] of Object.entries(res)) {
    if (!isResource(r) || !Number.isInteger(n) || n < 0) return null;
    if (n > 0) out[r] = n;
  }
  return out;
}

const size = (res: Resources) => Object.values(res).reduce((a, b) => a + b, 0);

function checkOffer(
  state: GameState,
  player: PlayerId,
  give: Resources,
  want: Resources,
): Rejection | null {
  const g = clean(give);
  const w = clean(want);
  if (!g || !w) return reject("INVALID_TRADE", "Offers can only contain resources.");
  if (size(g) === 0 || size(w) === 0)
    return reject("INVALID_TRADE", "Both sides must give at least one card.");
  if (Object.keys(g).some((r) => r in w))
    return reject("INVALID_TRADE", "A resource can't be on both sides.");
  if (!hasAll(handOf(state, player), g))
    return reject("CANNOT_AFFORD", "You don't have the cards you're offering.");
  return null;
}

export const tradeActions: ActionHandlers = {
  BANK_TRADE: {
    validate(state, player, { give, get }, { modules }) {
      if (!isResource(give) || !isResource(get) || give === get) {
        return reject("INVALID_TRADE", "Trade one resource for a different one.");
      }
      const ratio = runTradeRatio(modules, state, player, give);
      if ((handOf(state, player)[give] ?? 0) < ratio) {
        return reject("CANNOT_AFFORD", `You need ${ratio} ${give} to trade with the bank.`);
      }
      if ((state.zones["bank"]!.contents[get] ?? 0) < 1) {
        return reject("BANK_EMPTY", `The bank has no ${get} left.`);
      }
      return null;
    },
    apply(draft, player, { give, get }, { events, modules }) {
      const ratio = runTradeRatio(modules, draft, player, give);
      const bank = draft.zones["bank"]!.contents;
      transfer(handOf(draft, player), bank, give, ratio);
      transfer(bank, handOf(draft, player), get, 1);
      events.push({
        type: "BANK_TRADE",
        text: `${player} traded ${ratio} ${give} for 1 ${get} with the bank`,
      });
    },
    candidates: () =>
      BASE_RESOURCES.flatMap((give) =>
        BASE_RESOURCES.filter((get) => get !== give).map((get) => ({
          type: "BANK_TRADE" as const,
          give,
          get,
        })),
      ),
  },

  OFFER_TRADE: {
    validate: (state, player, { give, want }) => checkOffer(state, player, give, want),
    apply(draft, player, { give, want }, { events }) {
      const offer: Offer = { from: player, give: clean(give)!, want: clean(want)!, responses: {} };
      const others = draft.players.filter((p) => p !== player);
      draft.decisions.push({
        kind: "TRADE_OFFER",
        actors: [player, ...others],
        // Everyone may act: others respond, the offerer confirms or cancels.
        pendingFrom: [player, ...others],
        allowed: ["RESPOND_TRADE", "CONFIRM_TRADE", "CANCEL_TRADE"],
        module: "base",
        data: offer as unknown as Record<string, unknown>,
      });
      events.push({
        type: "OFFERED_TRADE",
        text: `${player} offers ${describe(offer.give)} for ${describe(offer.want)}`,
        data: { give: offer.give, want: offer.want },
      });
    },
    /** Too many combinations to list: one example (1 of a held card for 1 of another). */
    candidates(state, player) {
      const hand = handOf(state, player);
      const have = BASE_RESOURCES.find((r) => (hand[r] ?? 0) > 0);
      const other = BASE_RESOURCES.find((r) => r !== have);
      return have && other
        ? [{ type: "OFFER_TRADE", give: { [have]: 1 }, want: { [other]: 1 } }]
        : [];
    },
  },

  RESPOND_TRADE: {
    validate(state, player, { accept }) {
      const offer = offerOf(state);
      if (player === offer.from) return reject("INVALID_TRADE", "You made this offer.");
      if (accept && !hasAll(handOf(state, player), offer.want)) {
        return reject("CANNOT_AFFORD", "You don't have what they're asking for.");
      }
      return null;
    },
    apply(draft, player, { accept }, { events }) {
      offerOf(draft).responses[player] = accept ? "accept" : "decline";
      events.push({
        type: "RESPONDED_TRADE",
        text: `${player} ${accept ? "accepted" : "declined"} the offer`,
      });
    },
    candidates: () => [
      { type: "RESPOND_TRADE", accept: true },
      { type: "RESPOND_TRADE", accept: false },
    ],
  },

  CONFIRM_TRADE: {
    validate(state, player, { with: partner }) {
      const offer = offerOf(state);
      if (player !== offer.from)
        return reject("INVALID_TRADE", "Only the player who made the offer can confirm it.");
      if (offer.responses[partner] !== "accept")
        return reject("INVALID_TRADE", "They haven't accepted.");
      if (
        !hasAll(handOf(state, player), offer.give) ||
        !hasAll(handOf(state, partner), offer.want)
      ) {
        return reject("INVALID_TRADE", "Someone no longer has the cards for this trade.");
      }
      return null;
    },
    apply(draft, player, { with: partner }, { events }) {
      const offer = offerOf(draft);
      for (const [r, n] of Object.entries(offer.give))
        transfer(handOf(draft, player), handOf(draft, partner), r, n);
      for (const [r, n] of Object.entries(offer.want))
        transfer(handOf(draft, partner), handOf(draft, player), r, n);
      events.push({
        type: "TRADED",
        text: `${player} traded ${describe(offer.give)} for ${describe(offer.want)} with ${partner}`,
      });
      popDecision(draft);
    },
    candidates: (s, player) =>
      s.players
        .filter((p) => p !== player)
        .map((p) => ({ type: "CONFIRM_TRADE" as const, with: p })),
  },

  CANCEL_TRADE: {
    validate(state, player) {
      return player === offerOf(state).from
        ? null
        : reject("INVALID_TRADE", "Only the player who made the offer can cancel it.");
    },
    apply(draft, player, _action, { events }) {
      events.push({ type: "CANCELLED_TRADE", text: `${player} withdrew the offer` });
      popDecision(draft);
    },
    candidates: () => [{ type: "CANCEL_TRADE" }],
  },
};

/** Timeouts: roll, end the turn, or (during an offer) cancel it / decline it. */
export function baseDefaultAction(state: GameState, player: PlayerId): Action | null {
  const top = state.decisions.at(-1);
  switch (top?.kind) {
    case "ROLL":
      return { type: "ROLL" };
    case "MAIN":
      return { type: "END_TURN" };
    case "TRADE_OFFER":
      return offerOf(state).from === player
        ? { type: "CANCEL_TRADE" }
        : { type: "RESPOND_TRADE", accept: false };
    default:
      return null;
  }
}
