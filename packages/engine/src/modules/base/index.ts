import type { RulesModule } from "../../module";
import { buildActions } from "./build";
import { BASE_RESOURCES } from "./data";
import { countOwned } from "./helpers";
import { produce } from "./production";
import { robberActions } from "./robber";
import { setupActions, setupBase } from "./setup";
import { rollTwoDice, turnActions } from "./turn";

export { BASE_RESOURCES, COSTS, PIECE_LIMITS } from "./data";
export { mainDecision, rollDecision } from "./helpers";
export { produce } from "./production";

/** The base game, as a module like any other. */
export const baseModule: RulesModule = {
  id: "base",
  version: 1,
  resources: [...BASE_RESOURCES],
  actions: { ...setupActions, ...turnActions, ...buildActions, ...robberActions },
  hooks: {
    rollDice: rollTwoDice,
    produce,
    vpSources(state, player) {
      return countOwned(state, player, "settlement") + 2 * countOwned(state, player, "city");
    },
  },
  setup: setupBase,
};
