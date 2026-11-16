import type { RulesModule } from "../../module";
import { SHIP_LIMIT } from "./data";
import { seafaringInvariants } from "./invariants";
import { goldActions, goldForStartingSettlement, produceGold } from "./gold";
import { pirateActions } from "./pirate";
import {
  announceIslandBonus,
  checkSetupRegion,
  computeRegions,
  islandBonusVP,
  recordHome,
} from "./regions";
import { scenarioOf, type SeafaringState } from "./scenario";
import { shipActions } from "./ships";

export { SHIP_COST } from "./data";

/**
 * Seafaring (spec 015): ships, gold, the pirate, regions with island bonus VP, and the Longest
 * Trade Route. Scenarios 1–4 are this module plus map data (the map's `scenario` block).
 */
export const seafaringModule: RulesModule = {
  id: "seafaring",
  version: 1,
  dependsOn: ["base"],
  needsSeaGraph: true,
  routePieceTypes: ["ship"],
  routeAwardName: "Longest Trade Route",
  pieceLimits: { ship: SHIP_LIMIT },
  extraActions: {
    MAIN: ["BUILD_SHIP", "MOVE_SHIP"],
    PLACE_ROAD: ["PLACE_SHIP"],
    PLACE_FREE_ROAD: ["PLACE_FREE_SHIP"],
    MOVE_ROBBER: ["MOVE_PIRATE"],
  },
  actions: { ...shipActions, ...goldActions, ...pirateActions },
  invariants: seafaringInvariants,
  setup(draft) {
    const scenario = scenarioOf(draft);
    const home = scenario.home;
    const state: SeafaringState = {
      regionOf: computeRegions(draft),
      home: Object.fromEntries(
        draft.players.map((p) => [p, home === "setup" ? [] : [...home.regions].sort()]),
      ),
      shipBuiltOn: {},
      movedOnTurn: -1,
      pirateInPlay: scenario.pirateStart !== undefined,
    };
    draft.moduleState["seafaring"] = state;
    if (scenario.pirateStart !== undefined && scenario.pirateStart !== "frame") {
      draft.pieces["pirate"] = { id: "pirate", type: "pirate", at: { hex: scenario.pirateStart } };
    }
  },
  hooks: {
    produce: (draft, total) => produceGold(draft, total),
    vpSources: (state, player) => islandBonusVP(state, player),
    canPlace(state, _player, pieceType, at, decisionKind) {
      if (pieceType === "settlement" && decisionKind === "PLACE_SETTLEMENT" && "vertex" in at) {
        return checkSetupRegion(state, at.vertex);
      }
      return null;
    },
    onPlace(draft, piece, { events }) {
      announceIslandBonus(draft, piece, events);
      // A starting settlement: the setup road step for it is now on top (base set `mustTouch`).
      const top = draft.decisions.at(-1);
      if (
        piece.type !== "settlement" ||
        !piece.owner ||
        !("vertex" in piece.at) ||
        top?.kind !== "PLACE_ROAD" ||
        top.data?.["mustTouch"] !== piece.at.vertex
      ) {
        return;
      }
      recordHome(draft, piece.owner, piece.at.vertex);
      if (top.data?.["round"] === 2) goldForStartingSettlement(draft, piece.owner, piece.at.vertex);
    },
  },
};
