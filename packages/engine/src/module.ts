import type { Action, ActionType } from "./actions";
import type {
  Decision,
  GameEvent,
  GameState,
  ModuleId,
  Piece,
  PieceLocation,
  PieceTypeId,
  PlayerId,
  Rejection,
  ResourceId,
} from "./types";

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
    ctx: { modules: RulesModule[] },
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
  /**
   * Summed across modules. `includeHidden` adds VP the player hasn't revealed (VP cards):
   * true for the owner, for win checks, and once the game is over.
   */
  vpSources(state: GameState, player: PlayerId, includeHidden: boolean): number;
  /**
   * After every action: return the winner, or null. The first module (in ruleset order) to
   * name one decides; the core then ends the game.
   */
  checkWin(state: GameState, modules: RulesModule[]): PlayerId | null;
  /** Cards of `resource` needed for one card from the bank. Lowest across modules wins. */
  tradeRatio(state: GameState, player: PlayerId, resource: string): number;
  /**
   * May `player` put a `pieceType` at `at` while `decisionKind` is on top? Every module must
   * agree: the first rejection wins. Called by the module placing the piece, after its own checks.
   */
  canPlace(
    state: GameState,
    player: PlayerId,
    pieceType: PieceTypeId,
    at: PieceLocation,
    decisionKind: string,
  ): Rejection | null;
  /** After any piece is placed or moved (builds, setup, free roads, the robber, module pieces). */
  onPlace(draft: GameState, piece: Piece, ctx: ActionContext): void;
}

export interface RulesModule {
  id: ModuleId;
  version: number;
  dependsOn?: ModuleId[];
  resources?: ResourceId[];
  /** Build the board graph over sea hexes too (ships). Otherwise it covers land only. */
  needsSeaGraph?: boolean;
  /** Piece types that make up a player's route for the longest-route award (base: roads). */
  routePieceTypes?: PieceTypeId[];
  /** Most pieces of each type a player may have on the board (base: roads, settlements, cities). */
  pieceLimits?: Record<PieceTypeId, number>;
  /** Display name of the longest-route award when this module is on (last module wins). */
  routeAwardName?: string;
  /**
   * Extra action types this module allows during another module's decisions, by decision kind
   * (e.g. ships during the base game's MAIN step). The core adds them to the decision's own list.
   */
  extraActions?: Partial<Record<string, ActionType[]>>;
  actions?: ActionHandlers;
  hooks?: Partial<Hooks>;
  /** Runs once in createGame, in ruleset order: build zones, place starting pieces, push decisions. */
  setup?(draft: GameState): void;
  /**
   * Checks that must hold after every action when this module is on (tests and the fuzzer).
   * Returns violations; also reports the VP this module adds, recounted independently, so the
   * shared VP check can add it.
   */
  invariants?(state: GameState): { violations: string[]; vp: Record<PlayerId, number> };
  /**
   * What a timeout does for `player` when this module owns the top decision.
   * Null falls back to a random legal action.
   */
  defaultAction?(state: GameState, player: PlayerId): Action | null;
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

export function runVpSources(
  modules: RulesModule[],
  state: GameState,
  player: PlayerId,
  includeHidden: boolean,
): number {
  let vp = 0;
  for (const m of modules) vp += m.hooks?.vpSources?.(state, player, includeHidden) ?? 0;
  return vp;
}

export function runTradeRatio(
  modules: RulesModule[],
  state: GameState,
  player: PlayerId,
  resource: string,
): number {
  let best = Infinity;
  for (const m of modules) {
    const r = m.hooks?.tradeRatio?.(state, player, resource);
    if (r !== undefined) best = Math.min(best, r);
  }
  return best;
}

export function runCanPlace(
  modules: RulesModule[],
  state: GameState,
  player: PlayerId,
  pieceType: PieceTypeId,
  at: PieceLocation,
  decisionKind: string,
): Rejection | null {
  for (const m of modules) {
    const fail = m.hooks?.canPlace?.(state, player, pieceType, at, decisionKind);
    if (fail) return fail;
  }
  return null;
}

export function runOnPlace(
  modules: RulesModule[],
  draft: GameState,
  piece: Piece,
  ctx: ActionContext,
): void {
  for (const m of modules) m.hooks?.onPlace?.(draft, piece, ctx);
}

/** Every module's route piece types, in ruleset order, without repeats. */
export function routePieceTypes(modules: RulesModule[]): PieceTypeId[] {
  return [...new Set(modules.flatMap((m) => m.routePieceTypes ?? []))];
}

/** Piece limits from every module (a later module may change an earlier one's). */
export function pieceLimits(modules: RulesModule[]): Record<PieceTypeId, number> {
  return Object.assign({}, ...modules.map((m) => m.pieceLimits ?? {})) as Record<
    PieceTypeId,
    number
  >;
}

/** The longest-route award's display name: the last module that names it, else Longest Road. */
export function routeAwardName(modules: RulesModule[]): string {
  return modules.reduce<string>((name, m) => m.routeAwardName ?? name, "Longest Road");
}

/** The action types allowed while `decision` is on top: its own, plus modules' extras for its kind. */
export function allowedFor(modules: RulesModule[], decision: Decision): string[] {
  const extra = modules.flatMap((m) => m.extraActions?.[decision.kind] ?? []);
  return [...new Set([...decision.allowed, ...extra])];
}

/**
 * The handler for an action: the decision's own module first, then the first module (in ruleset
 * order) that has one.
 */
export function handlerFor(
  modules: RulesModule[],
  decision: Decision,
  type: ActionType,
): ActionHandler | undefined {
  // The casts are safe: handlers are keyed by the action type they accept.
  const own = modules.find((m) => m.id === decision.module)?.actions?.[type] as
    ActionHandler | undefined;
  if (own) return own;
  for (const m of modules) {
    const h = m.actions?.[type] as ActionHandler | undefined;
    if (h) return h;
  }
  return undefined;
}

/** Every concrete action `player` may send right now (the engine's `legalActions`). */
export function legalFor(state: GameState, player: PlayerId, modules: RulesModule[]): Action[] {
  const top = state.decisions.at(-1);
  if (state.winner !== undefined || !top || !top.pendingFrom.includes(player)) return [];
  const result: Action[] = [];
  for (const type of allowedFor(modules, top)) {
    const handler = handlerFor(modules, top, type as ActionType);
    if (!handler) continue;
    for (const a of handler.candidates(state, player)) {
      if (handler.validate(state, player, a, { modules }) === null) result.push(a);
    }
  }
  return result;
}

export function reject(code: Rejection["code"], message: string): Rejection {
  return { ok: false, code, message };
}
