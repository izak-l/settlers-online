import {
  apply,
  computeVP,
  createGame,
  legalActions,
  seedFromString,
  viewFor,
  type Action,
  type ActionSpec,
  type GameEvent,
  type GameState,
  type PlayerId,
  type PlayerView,
  type Rejection,
} from "@settlers/engine";
import { BASE_4P, generateMap } from "@settlers/maps";

/** Everything the UI is allowed to see, for the seat currently being waited on. */
export interface Snapshot {
  seat: PlayerId;
  view: PlayerView;
  legal: ActionSpec[];
  /** Public VP per seat. */
  scores: Record<PlayerId, number>;
  /** Events this seat may see, oldest first. */
  log: GameEvent[];
}

/**
 * The UI talks only to this interface. In M3 it is `LocalGame` (hot-seat, engine in the
 * browser); in M5 a socket client implements it and the components don't change.
 */
export interface GameClient {
  snapshot(): Snapshot;
  send(action: Action): Rejection | null;
}

/** Hot-seat adapter: plays the server's role locally. Holds the only copy of GameState. */
export class LocalGame implements GameClient {
  private state: GameState;
  private events: GameEvent[] = [];

  constructor(seats: PlayerId[], seed: string) {
    const { map } = generateMap(BASE_4P, seedFromString(`${seed}:map`));
    this.state = createGame(map, { modules: ["base"] }, seats, seed);
  }

  /** The seat the game is waiting on. */
  private waitingOn(): PlayerId {
    const top = this.state.decisions.at(-1);
    return top?.pendingFrom[0] ?? this.state.turn.activePlayer;
  }

  snapshot(): Snapshot {
    const seat = this.waitingOn();
    const scores: Record<PlayerId, number> = {};
    for (const p of this.state.players) scores[p] = computeVP(this.state, p);
    return {
      seat,
      view: viewFor(this.state, seat),
      legal: legalActions(this.state, seat),
      scores,
      log: this.events.filter((e) => !e.visibleTo || e.visibleTo.includes(seat)),
    };
  }

  send(action: Action): Rejection | null {
    const res = apply(this.state, this.waitingOn(), action);
    if (!res.ok) return res;
    this.state = res.state;
    this.events.push(...res.events);
    return null;
  }
}
