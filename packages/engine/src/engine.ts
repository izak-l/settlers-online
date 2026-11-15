import { buildGraph } from "./board/graph";
import { nextInt, seedFromString } from "./rng";
import type { Action, ActionSpec } from "./actions";
import {
  reject,
  runTradeRatio,
  runVpSources,
  type ActionHandler,
  type RulesModule,
} from "./module";
import { MODULES } from "./modules";
import type {
  Actor,
  ApplyResult,
  Decision,
  GameEvent,
  GameState,
  MapInput,
  PlayerId,
  Resources,
  RulesetDef,
  Zone,
  ZoneId,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function modulesOf(state: GameState): RulesModule[] {
  return state.modules.map((id) => MODULES[id]!);
}

/** Deep copy for `apply`. The graph is derived and never mutated, so it is shared. */
function cloneState(state: GameState): GameState {
  const { graph, ...rest } = state;
  return { ...(JSON.parse(JSON.stringify(rest)) as Omit<GameState, "graph">), graph };
}

/** The decision's own module handles the action; otherwise the first module (in ruleset order) that can. */
function findHandler(
  state: GameState,
  top: Decision,
  type: Action["type"],
): ActionHandler | undefined {
  const owner = MODULES[top.module];
  // The cast is safe: handlers are keyed by the action type they accept.
  const own = owner?.actions?.[type] as ActionHandler | undefined;
  if (own) return own;
  for (const m of modulesOf(state)) {
    const h = m.actions?.[type] as ActionHandler | undefined;
    if (h) return h;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createGame(
  map: MapInput,
  ruleset: RulesetDef,
  seats: PlayerId[],
  seed: string,
): GameState {
  if (seats.length === 0) throw new Error("A game needs at least one seat");
  const modules = ruleset.modules.map((id) => {
    const m = MODULES[id];
    if (!m) throw new Error(`Unknown module: ${id}`);
    return m;
  });

  const state: GameState = {
    rulesetId: modules.map((m) => `${m.id}@${m.version}`).join("+"),
    modules: modules.map((m) => m.id),
    options: { vpToWin: map.vpToWin, ...ruleset.options },
    rng: seedFromString(seed),
    map,
    graph: buildGraph(map.hexes.filter((h) => h.terrain !== "sea")),
    players: [...seats],
    pieces: {},
    zones: {},
    turn: { number: 0, activePlayer: seats[0]! },
    decisions: [],
    moduleState: {},
  };
  for (const m of modules) m.setup?.(state);
  return state;
}

/**
 * Validate `action` against the top decision, then the owning module, and return the new state.
 * Never mutates `state` and never throws for a bad action: it returns `{ ok: false, code }` instead.
 */
export function apply(state: GameState, actor: Actor, action: Action): ApplyResult {
  if (state.winner !== undefined) return reject("GAME_OVER", "The game is over.");

  const top = state.decisions.at(-1);
  if (!top) return reject("GAME_OVER", "Nothing is waiting to be decided.");
  if (!top.allowed.includes(action.type)) {
    return reject("WRONG_DECISION", `${action.type} isn't allowed during ${top.kind}.`);
  }

  // The system actor (timeouts) acts on behalf of whoever is being waited on.
  const player = actor === "system" ? top.pendingFrom[0] : actor;
  if (player === undefined || !top.pendingFrom.includes(player)) {
    return reject("NOT_YOUR_TURN", `Waiting on ${top.pendingFrom.join(", ")}.`);
  }

  const handler = findHandler(state, top, action.type);
  if (!handler) return reject("UNKNOWN_ACTION", `No module handles ${action.type}.`);

  const modules = modulesOf(state);
  const failure = handler.validate(state, player, action, { modules });
  if (failure) return failure;

  const draft = cloneState(state);
  const events: GameEvent[] = [];
  handler.apply(draft, player, action, { events, modules });

  for (const m of modules) {
    const winner = m.hooks?.checkWin?.(draft, modules);
    if (winner) {
      draft.winner = winner;
      draft.decisions = [];
      events.push({ type: "GAME_WON", text: `${winner} won the game`, data: { winner } });
      break;
    }
  }
  return { ok: true, state: draft, events };
}

/** Every concrete action `player` may send right now. */
export function legalActions(state: GameState, player: PlayerId): ActionSpec[] {
  const top = state.decisions.at(-1);
  if (state.winner !== undefined || !top || !top.pendingFrom.includes(player)) return [];

  const result: ActionSpec[] = [];
  const modules = modulesOf(state);
  for (const type of top.allowed) {
    const handler = findHandler(state, top, type as Action["type"]);
    if (!handler) continue;
    for (const a of handler.candidates(state, player)) {
      if (handler.validate(state, player, a, { modules }) === null) result.push(a);
    }
  }
  return result;
}

/** The bank rate `player` gets for each resource (cards given per card received). */
export function tradeRatios(state: GameState, player: PlayerId): Record<string, number> {
  const modules = modulesOf(state);
  const out: Record<string, number> = {};
  for (const r of modules.flatMap((m) => m.resources ?? []))
    out[r] = runTradeRatio(modules, state, player, r);
  return out;
}

/**
 * Victory points, always computed from every module's vpSources hook.
 * With a `viewer`, hidden VP (cards) only count if the viewer is that player or the game is over;
 * without one, everything counts (win checks, invariants).
 */
export function computeVP(
  state: GameState,
  player: PlayerId,
  viewer?: PlayerId | "spectator",
): number {
  const includeHidden = viewer === undefined || viewer === player || state.winner !== undefined;
  return runVpSources(modulesOf(state), state, player, includeHidden);
}

/**
 * Fallback move when a player's timer runs out: the owning module's choice (the base game rolls,
 * ends the turn, or cancels/declines a trade), otherwise a random legal action. "Random" reads the game RNG without advancing it, so it's deterministic for a
 * given state; the chosen action is then logged and replayed like any other.
 */
export function defaultAction(state: GameState, player: PlayerId): Action {
  const top = state.decisions.at(-1);
  const preferred = top ? MODULES[top.module]?.defaultAction?.(state, player) : null;
  if (preferred) return preferred;
  const legal = legalActions(state, player);
  if (legal.length === 0)
    throw new Error(`No legal action for ${player} during ${top?.kind ?? "nothing"}`);
  return legal[nextInt(state.rng, legal.length).value]!;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export type Viewer = PlayerId | "spectator";

export interface ZoneView {
  id: ZoneId;
  owner?: PlayerId;
  visibility: Zone["visibility"];
  /** Present only when this viewer may see what's inside. */
  contents?: Resources;
  /** Present when the viewer may see how many items it holds. */
  count?: number;
}

/** What a client receives. No RNG state, no graph (rebuild it from `map`), zones redacted. */
export interface PlayerView extends Omit<GameState, "rng" | "graph" | "zones"> {
  viewer: Viewer;
  zones: Record<ZoneId, ZoneView>;
}

function redactZone(zone: Zone, viewer: Viewer): ZoneView {
  const count = Object.values(zone.contents).reduce((a, b) => a + b, 0);
  const isOwner = zone.owner !== undefined && zone.owner === viewer;
  const base: ZoneView = { id: zone.id, visibility: zone.visibility };
  if (zone.owner !== undefined) base.owner = zone.owner;

  switch (zone.visibility) {
    case "public":
      return { ...base, contents: { ...zone.contents }, count };
    case "owner":
      return isOwner ? { ...base, contents: { ...zone.contents }, count } : base;
    case "count":
      return isOwner ? { ...base, contents: { ...zone.contents }, count } : { ...base, count };
    case "hidden":
      return { ...base, count };
  }
}

/** The only place hidden information is filtered. */
export function viewFor(state: GameState, viewer: Viewer): PlayerView {
  const { rng: _rng, graph: _graph, zones, ...rest } = cloneState(state);
  const redacted: Record<ZoneId, ZoneView> = {};
  for (const [id, zone] of Object.entries(zones)) redacted[id] = redactZone(zone, viewer);
  return { ...rest, viewer, zones: redacted };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** GameState without the derived graph: plain JSON, safe to store. */
export type StateSnapshot = Omit<GameState, "graph">;

export function toSnapshot(state: GameState): StateSnapshot {
  const { graph: _graph, ...rest } = cloneState(state);
  return rest;
}

/** Rebuild a full GameState (including the graph) from a stored snapshot. */
export function fromSnapshot(snapshot: StateSnapshot): GameState {
  const rest = JSON.parse(JSON.stringify(snapshot)) as StateSnapshot;
  return { ...rest, graph: buildGraph(rest.map.hexes.filter((h) => h.terrain !== "sea")) };
}
