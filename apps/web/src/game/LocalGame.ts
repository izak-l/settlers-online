import {
  apply,
  computeVP,
  createGame,
  eventVisibleTo,
  legalActions,
  seedFromString,
  tradeRatios,
  viewFor,
  type Action,
  type ActionSpec,
  type FeatureOverrides,
  type GameEvent,
  type GameState,
  type PlayerId,
  type PlayerView,
} from "@settlers/engine";
import { DEFAULT_MAP_DEF, generateMap, type MapDef } from "@settlers/maps";
import type { ChatMessage } from "@settlers/protocol";

export interface SnapshotPlayer {
  id: PlayerId;
  name: string;
  connected: boolean;
}

/** Everything the UI is allowed to see, from one seat's (or a spectator's) point of view. */
export interface Snapshot {
  seat: PlayerId | "spectator";
  view: PlayerView;
  legal: ActionSpec[];
  /** VP per seat as this viewer may see it. */
  scores: Record<PlayerId, number>;
  /** Your bank rate per resource. Empty for spectators. */
  ratios: Record<string, number>;
  /** Events this viewer may see, oldest first. */
  log: GameEvent[];
  players: SnapshotPlayer[];
  /** The running turn timer: `deadline` is in this browser's clock (epoch ms). */
  clock?: { kind: "turn" | "short"; deadline: number; totalMs: number };
}

export interface SendError {
  code: string;
  message: string;
}

/**
 * The UI talks only to this interface. `SocketGame` implements it for online play;
 * `LocalGame` implements it in the browser for the dev sandbox and tests.
 */
export interface GameClient {
  /** Called with the current snapshot (once available) and after every change. Returns unsubscribe. */
  subscribe(listener: (snap: Snapshot) => void): () => void;
  send(action: Action): Promise<SendError | null>;
  dispose(): void;
  /** In-game chat; online games only (the dev sandbox has none). */
  chat?: {
    subscribe(listener: (messages: ChatMessage[]) => void): () => void;
    send(text: string): Promise<SendError | null>;
  };
}

/**
 * Dev sandbox / test adapter: plays the server's role locally and lets one person act for
 * whichever seat is being waited on. Not a player-facing mode. Holds the only copy of GameState.
 */
export class LocalGame implements GameClient {
  private state: GameState;
  private events: GameEvent[] = [];
  private listeners = new Set<(snap: Snapshot) => void>();

  constructor(
    private names: string[],
    seed: string,
    def: MapDef = DEFAULT_MAP_DEF,
    features?: FeatureOverrides,
  ) {
    const { map } = generateMap(def, seedFromString(`${seed}:map`));
    const seats = names.map((_, i) => `p${i}`);
    this.state = createGame(
      map,
      { modules: def.modules, ...(features ? { options: { features } } : {}) },
      seats,
      seed,
    );
  }

  private waitingOn(): PlayerId {
    return this.state.decisions.at(-1)?.pendingFrom[0] ?? this.state.turn.activePlayer;
  }

  snapshot(): Snapshot {
    const seat = this.waitingOn();
    const scores: Record<PlayerId, number> = {};
    for (const p of this.state.players) scores[p] = computeVP(this.state, p, seat);
    return {
      seat,
      view: viewFor(this.state, seat),
      legal: legalActions(this.state, seat),
      scores,
      ratios: tradeRatios(this.state, seat),
      log: this.events.filter((e) => eventVisibleTo(e, seat)),
      players: this.state.players.map((id, i) => ({ id, name: this.names[i]!, connected: true })),
    };
  }

  subscribe(listener: (snap: Snapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  async send(action: Action): Promise<SendError | null> {
    const res = apply(this.state, this.waitingOn(), action);
    if (!res.ok) return { code: res.code, message: res.message };
    this.state = res.state;
    this.events.push(...res.events);
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
    return null;
  }

  dispose(): void {
    this.listeners.clear();
  }
}
