import type { EdgeId } from "../../board/graph";
import { nextInt } from "../../rng";
import type { GameEvent, GameState, PlayerId } from "../../types";
import { DEV_CARD_NAMES } from "../base/data";
import { cardList, featureOn, transfer } from "../base/helpers";

/** Face-down development cards lying on the water (a hidden zone: views show only a count). */
export const BOARD_CARDS = "board-devcards";

/** What Lost Settlers keeps in `moduleState["sf-lost-settlers"]`. */
export interface LostSettlersState {
  /** Harbors each player has taken and not yet placed, oldest first (public: they're face up). */
  held: Record<PlayerId, string[]>;
  /** Edges where players have placed the harbors they took. */
  placed: EdgeId[];
  /** Counts at the start, for the invariants. */
  start: { vpTokens: number; harbors: number };
}

export function lostState(state: GameState): LostSettlersState {
  return state.moduleState["sf-lost-settlers"] as LostSettlersState;
}

/** VP tokens a player has collected (each worth 1 VP). */
export function vpTokens(state: GameState, player: PlayerId): number {
  return state.zones[`vp-${player}`]?.contents["vpToken"] ?? 0;
}

const sum = (res: Record<string, number>) => Object.values(res).reduce((a, b) => a + b, 0);

/**
 * At setup: one card per dev-card marker, drawn at random from the deck into a hidden zone (the
 * same odds as dealing the top cards; nothing about them reaches a view). With development cards
 * switched off there's nothing to deal, so those markers leave the map.
 */
export function dealBoardCards(draft: GameState): void {
  draft.zones[BOARD_CARDS] = { id: BOARD_CARDS, visibility: "hidden", contents: {} };
  const markers = draft.map.markers ?? [];
  if (!featureOn(draft, "devCards")) {
    draft.map.markers = markers.filter((m) => m.kind !== "dev-card");
    return;
  }
  const deck = draft.zones["devdeck"]!.contents;
  for (const _ of markers.filter((m) => m.kind === "dev-card")) {
    const cards = cardList(deck);
    if (cards.length === 0) break;
    const pick = nextInt(draft.rng, cards.length);
    draft.rng = pick.rng;
    transfer(deck, draft.zones[BOARD_CARDS]!.contents, cards[pick.value]!, 1);
  }
}

/** A ship reached `edge`: the player takes whatever lies there. */
export function collectMarkers(
  draft: GameState,
  player: PlayerId,
  edge: EdgeId,
  events: GameEvent[],
): void {
  const markers = draft.map.markers ?? [];
  const here = markers.filter((m) => "edge" in m.at && m.at.edge === edge);
  if (here.length === 0) return;
  draft.map.markers = markers.filter((m) => !here.includes(m));
  for (const marker of here) {
    switch (marker.kind) {
      case "vp-token": {
        const zone = draft.zones[`vp-${player}`]!.contents;
        zone["vpToken"] = (zone["vpToken"] ?? 0) + 1;
        events.push({
          type: "TOOK_VP_TOKEN",
          text: `${player} found a victory point token`,
          data: { player, marker: marker.id },
        });
        break;
      }
      case "dev-card": {
        const board = draft.zones[BOARD_CARDS]!.contents;
        const cards = cardList(board);
        if (cards.length === 0) break;
        const pick = nextInt(draft.rng, cards.length);
        draft.rng = pick.rng;
        const card = cards[pick.value]!;
        // As if bought this turn: playable from the next turn; a VP card counts at once.
        transfer(board, draft.zones[`devnew-${player}`]!.contents, card, 1);
        events.push({
          type: "TOOK_BOARD_CARD",
          text: `${player} found a development card`,
          data: { player, marker: marker.id },
        });
        events.push({
          type: "DREW_DEV_CARD",
          text: `${player} drew ${DEV_CARD_NAMES[card] ?? card}`,
          visibleTo: [player],
          data: { card },
        });
        break;
      }
      case "harbor": {
        const port = typeof marker.data?.["port"] === "string" ? marker.data["port"] : "any3to1";
        lostState(draft).held[player]!.push(port);
        events.push({
          type: "TOOK_HARBOR",
          text: `${player} picked up a harbor`,
          data: { player, marker: marker.id, port },
        });
        break;
      }
    }
  }
}

/**
 * Checks after every action: VP tokens and harbors are each taken at most once and never lost,
 * and the face-down cards match the dev-card markers still on the water. Reports the VP tokens
 * (recounted from the zones) for the shared VP check.
 */
export function lostSettlersInvariants(state: GameState): {
  violations: string[];
  vp: Record<PlayerId, number>;
} {
  const out: string[] = [];
  const vp: Record<PlayerId, number> = {};
  const lost = lostState(state);
  const markers = state.map.markers ?? [];
  const onMap = (kind: string) => markers.filter((m) => m.kind === kind).length;

  let tokens = onMap("vp-token");
  for (const p of state.players) {
    vp[p] = state.zones[`vp-${p}`]!.contents["vpToken"] ?? 0;
    tokens += vp[p];
  }
  if (tokens !== lost.start.vpTokens)
    out.push(`VP tokens: ${tokens} on the map and in hand, expected ${lost.start.vpTokens}`);

  const held = Object.values(lost.held).reduce((a, h) => a + h.length, 0);
  const placed = lost.placed.length;
  for (const edge of lost.placed)
    if (!state.map.ports.some((p) => p.edgeId === edge))
      out.push(`placed harbor ${edge} is missing`);
  if (onMap("harbor") + held + placed !== lost.start.harbors)
    out.push(
      `harbors: ${onMap("harbor")} on the water, ${held} held, ${placed} placed; expected ${lost.start.harbors}`,
    );

  const cards = sum(state.zones[BOARD_CARDS]!.contents);
  if (cards !== onMap("dev-card"))
    out.push(`${cards} face-down cards for ${onMap("dev-card")} dev-card markers`);

  const ids = markers.map((m) => m.id);
  if (new Set(ids).size !== ids.length) out.push("a marker appears twice");
  return { violations: out, vp };
}
