import type { RulesModule } from "../module";
import type { ModuleId } from "../types";
import { baseModule } from "./base";

/**
 * Every module the engine knows, by id. GameState stores only module ids (so it stays
 * serializable); the engine looks the code up here.
 */
export const MODULES: Record<ModuleId, RulesModule> = {
  base: baseModule,
};
