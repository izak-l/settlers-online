import { runVpSources, type RulesModule } from "../../module";
import { awardVP } from "./awards";
import { buildActions } from "./build";
import { devCardActions, vpCards } from "./devcards";
import { BASE_RESOURCES, PIECE_LIMITS } from "./data";
import { countOwned } from "./helpers";
import { produce } from "./production";
import { robberActions } from "./robber";
import { setupActions, setupBase } from "./setup";
import { baseDefaultAction, tradeActions, tradeRatio } from "./trade";
import { rollTwoDice, turnActions } from "./turn";

export { BASE_RESOURCES, COSTS, DEV_CARD_NAMES, PIECE_LIMITS } from "./data";
export { mainDecision, rollDecision } from "./helpers";
export { produce } from "./production";

/** The base game, as a module like any other. */
export const baseModule: RulesModule = {
  id: "base",
  version: 1,
  resources: [...BASE_RESOURCES],
  pieceLimits: { ...PIECE_LIMITS },
  routePieceTypes: ["road"],
  actions: {
    ...setupActions,
    ...turnActions,
    ...buildActions,
    ...robberActions,
    ...devCardActions,
    ...tradeActions,
  },
  hooks: {
    rollDice: rollTwoDice,
    produce,
    tradeRatio,
    /** Only the player whose turn it is can win, counting hidden VP cards. Never during setup. */
    checkWin(state, modules) {
      if (state.turn.number < 1) return null;
      const p = state.turn.activePlayer;
      return runVpSources(modules, state, p, true) >= state.options.vpToWin ? p : null;
    },
    vpSources(state, player, includeHidden) {
      const buildings =
        countOwned(state, player, "settlement") + 2 * countOwned(state, player, "city");
      return buildings + awardVP(state, player) + (includeHidden ? vpCards(state, player) : 0);
    },
  },
  setup: setupBase,
  defaultAction: baseDefaultAction,
};
