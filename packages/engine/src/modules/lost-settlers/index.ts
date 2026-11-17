import type { RulesModule } from "../../module";
import { reject } from "../../module";
import type { PlayerId } from "../../types";
import { terrainAt } from "../base/helpers";
import { canPlaceHarbor, harborActions } from "./harbors";
import {
  collectMarkers,
  dealBoardCards,
  lostState,
  lostSettlersInvariants,
  vpTokens,
  type LostSettlersState,
} from "./markers";

const MODULE_ID = "sf-lost-settlers";

/** A hex with a number token (desert, sea and fog have none). */
function numbered(state: Parameters<typeof terrainAt>[0], hex: string): boolean {
  const i = state.graph.hexIndex.get(hex);
  return i !== undefined && state.map.hexes[i]?.token !== undefined;
}

/**
 * Scenario 5, Lost Settlers (spec 018), on top of seafaring: settlements and the robber only on
 * numbered land; VP tokens, face-down development cards and harbors lie on sea edges, and a ship
 * reaching one takes it. A harbor taken is placed again next to the player's own building.
 */
export const lostSettlersModule: RulesModule = {
  id: MODULE_ID,
  version: 1,
  dependsOn: ["seafaring"],
  extraActions: { MAIN: ["PLACE_HARBOR"] },
  actions: harborActions,
  invariants: lostSettlersInvariants,
  setup(draft) {
    const markers = draft.map.markers ?? [];
    const count = (kind: string) => markers.filter((m) => m.kind === kind).length;
    const state: LostSettlersState = {
      held: Object.fromEntries(draft.players.map((p): [PlayerId, string[]] => [p, []])),
      placed: [],
      start: { vpTokens: count("vp-token"), harbors: count("harbor") },
    };
    draft.moduleState[MODULE_ID] = state;
    for (const p of draft.players) {
      draft.zones[`vp-${p}`] = { id: `vp-${p}`, owner: p, visibility: "public", contents: {} };
    }
    dealBoardCards(draft);
  },
  hooks: {
    vpSources: (state, player) => vpTokens(state, player),
    canPlace(state, _player, pieceType, at) {
      if (pieceType === "settlement" && "vertex" in at) {
        const hexes = state.graph.vertices.get(at.vertex)?.hexes ?? [];
        if (!hexes.some((hex) => numbered(state, hex)))
          return reject("ILLEGAL_PLACEMENT", "Settlements must touch a hex with a number.");
      }
      if (pieceType === "robber" && "hex" in at && !numbered(state, at.hex)) {
        return reject("ILLEGAL_PLACEMENT", "The robber may only go to a hex with a number.");
      }
      return null;
    },
    onPlace(draft, piece, ctx) {
      if (piece.type !== "ship" || !piece.owner || !("edge" in piece.at)) return;
      collectMarkers(draft, piece.owner, piece.at.edge, ctx.events);
      // A harbor just taken must be placed now if it can be.
      const player = piece.owner;
      if (lostState(draft).held[player]!.length > 0 && canPlaceHarbor(draft, player)) {
        draft.decisions.push({
          kind: "PLACE_HARBOR",
          actors: [player],
          pendingFrom: [player],
          allowed: ["PLACE_HARBOR"],
          module: MODULE_ID,
        });
        draft.turn.activePlayer = player;
      }
    },
  },
};
