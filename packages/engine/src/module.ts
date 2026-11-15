import type { Action, ActionType } from "./actions";
import type { GameEvent, GameState, ModuleId, PlayerId, Rejection, ResourceId } from "./types";

/** Dice are an object so an event die or a chosen roll can be added later. */
export type Dice = Record<string, number>;

/** What a handler gets besides the draft: where to put events, and the active modules for hooks. */
export interface ActionContext {
  events: GameEvent[];
  modules: RulesModule[];
}

/**
 * Validate + apply for one action type. `validate` sees the untouched state;
 * `apply` mutates a private copy (the draft) and is only called after validate passes.
 */
export interface ActionHandler<T extends ActionType = ActionType> {
  validate(
    state: GameState,
    player: PlayerId,
    action: Extract<Action, { type: T }>,
  ): Rejection | null;
  apply(
    draft: GameState,
    player: PlayerId,
    action: Extract<Action, { type: T }>,
    ctx: ActionContext,
  ): void;
  /** Candidate actions of this type; `legalActions` keeps the ones `validate` accepts. */
  candidates(state: GameState, player: PlayerId): Extract<Action, { type: T }>[];
}

export type ActionHandlers = { [K in ActionType]?: ActionHandler<K> };

export interface Hooks {
  /** Last module in the ruleset that defines it wins. */
  rollDice(draft: GameState): Dice;
  /** Every module's produce runs, in ruleset order, on a roll that isn't 7. */
  produce(draft: GameState, total: number, events: GameEvent[]): void;
  /** Summed across modules. */
  vpSources(state: GameState, player: PlayerId): number;
}

export interface RulesModule {
  id: ModuleId;
  version: number;
  dependsOn?: ModuleId[];
  resources?: ResourceId[];
  actions?: ActionHandlers;
  hooks?: Partial<Hooks>;
  /** Runs once in createGame, in ruleset order: build zones, place starting pieces, push decisions. */
  setup?(draft: GameState): void;
}

// ---- hook runners ----

export function runRollDice(modules: RulesModule[], draft: GameState): Dice {
  for (let i = modules.length - 1; i >= 0; i--) {
    const roll = modules[i]!.hooks?.rollDice;
    if (roll) return roll(draft);
  }
  throw new Error("No module provides rollDice");
}

export function runProduce(
  modules: RulesModule[],
  draft: GameState,
  total: number,
  events: GameEvent[],
): void {
  for (const m of modules) m.hooks?.produce?.(draft, total, events);
}

export function runVpSources(modules: RulesModule[], state: GameState, player: PlayerId): number {
  let vp = 0;
  for (const m of modules) vp += m.hooks?.vpSources?.(state, player) ?? 0;
  return vp;
}

export function reject(code: Rejection["code"], message: string): Rejection {
  return { ok: false, code, message };
}
