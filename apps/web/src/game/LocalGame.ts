import {
  apply,
  computeVP,
  createGame,
  eventVisibleTo,
  legalActions,
  seedFromString,
  viewFor,
  type Action,
  type ActionSpec,
  type GameEvent,
  type GameState,
  type PlayerId,
  type PlayerView,
} from "@settlers/engine";
import { BASE_4P, generateMap } from "@settlers/maps";

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
  /** Public VP per seat. */
  scores: Record<PlayerId, number>;
  /** Events this viewer may see, oldest first. */
  log: GameEvent[];
  players: SnapshotPlayer[];
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
  ) {
    const { map } = generateMap(BASE_4P, seedFromString(`${seed}:map`));
    const seats = names.map((_, i) => `p${i}`);
    this.state = createGame(map, { modules: ["base"] }, seats, seed);
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
