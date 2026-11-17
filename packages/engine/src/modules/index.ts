import type { RulesModule } from "../module";
import type { ModuleId } from "../types";
import { baseModule } from "./base";
import { seafaringModule } from "./seafaring";
import { lostSettlersModule } from "./lost-settlers";

/**
 * Every module the engine knows, by id. GameState stores only module ids (so it stays
 * serializable); the engine looks the code up here.
 */
export const MODULES: Record<ModuleId, RulesModule> = {
  base: baseModule,
  seafaring: seafaringModule,
  "sf-lost-settlers": lostSettlersModule,
};

/** The ids of every registered module, base first. Maps may only name these. */
export const MODULE_IDS: readonly ModuleId[] = Object.keys(MODULES);
