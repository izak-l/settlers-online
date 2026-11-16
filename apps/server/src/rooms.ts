import {
  apply,
  buildOptions,
  computeVP,
  createGame,
  defaultAction,
  eventVisibleTo,
  fromSnapshot,
  legalActions,
  toSnapshot,
  tradeRatios,
  viewFor,
  type Action,
  type Actor,
  type GameEvent,
  type GameState,
  type PlayerId,
} from "@settlers/engine";
import type { Ack, GameStateMessage, SeatPlayer } from "@settlers/protocol";
import { KeyedQueue } from "./queue";
import type { GamePlayer, Store } from "./store/types";
import {
  clockKey,
  MAX_TIMEOUT_ACTIONS,
  SHORT_SECONDS,
  TurnClock,
  type RunningClock,
} from "./timers";

export type Role = PlayerId | "spectator";

/** One live game: the authoritative state, rebuilt from storage, changed only through `submit`. */
export class GameRoom {
  /** Null when the game has no turn timer. */
  private clock: TurnClock | null;
  private running: RunningClock | null = null;

  private constructor(
    readonly id: string,
    readonly players: GamePlayer[],
    readonly allowSpectators: boolean,
    private state: GameState,
    private seq: number,
    private log: GameEvent[],
    private store: Store,
    private snapshotEvery: number,
    turnSeconds: number,
    secondMs: number,
  ) {
    this.clock =
      turnSeconds > 0 ? new TurnClock(turnSeconds * secondMs, SHORT_SECONDS * secondMs) : null;
  }

  /** Rebuild from the latest snapshot plus every action logged after it. */
  static async load(
    store: Store,
    gameId: string,
    snapshotEvery: number,
    secondMs: number,
  ): Promise<GameRoom | null> {
    const record = await store.getGame(gameId);
    if (!record) return null;
    const { game, players } = record;
    const lobby = await store.getLobby(game.lobbyId);

    const snap = await store.latestSnapshot(gameId);
    let state = snap
      ? fromSnapshot(snap.state)
      : createGame(game.map, { modules: game.modules }, game.seats, game.seed);
    let seq = snap?.seq ?? 0;

    const all = await store.actionsAfter(gameId, 0);
    for (const a of all.filter((x) => x.seq > seq)) {
      const res = apply(state, a.actor, a.action);
      if (!res.ok) throw new Error(`Replay of game ${gameId} failed at seq ${a.seq}: ${res.code}`);
      state = res.state;
      seq = a.seq;
    }
    const log = all.flatMap((a) => a.events);
    return new GameRoom(
      gameId,
      players,
      lobby?.allowSpectators ?? false,
      state,
      seq,
      log,
      store,
      snapshotEvery,
      game.turnSeconds,
      secondMs,
    );
  }

  get finished(): boolean {
    return this.state.winner !== undefined;
  }

  get currentSeq(): number {
    return this.seq;
  }

  seatOf(userId: string): PlayerId | undefined {
    return this.players.find((p) => p.userId === userId)?.seat;
  }

  /**
   * Apply one action. The action is written to storage before the in-memory state changes,
   * so nothing is broadcast that a restart would lose. Callers must serialize calls (see RoomManager).
   */
  async submit(actor: Actor, action: Action): Promise<Ack<{ seq: number; events: GameEvent[] }>> {
    const res = apply(this.state, actor, action);
    if (!res.ok) return res;

    const seq = this.seq + 1;
    await this.store.appendAction(this.id, { seq, actor, action, events: res.events });
    this.state = res.state;
    this.seq = seq;
    this.log.push(...res.events);

    if (this.state.winner !== undefined) {
      const scores: Record<PlayerId, number> = {};
      for (const p of this.state.players) scores[p] = computeVP(this.state, p);
      await this.store.finishGame(this.id, seq, toSnapshot(this.state), {
        winner: this.state.winner,
        scores,
      });
    } else if (seq % this.snapshotEvery === 0) {
      // A failed snapshot only costs replay time later; don't fail the action for it.
      await this.store.saveSnapshot(this.id, seq, toSnapshot(this.state)).catch((err: unknown) => {
        console.error(`snapshot failed for ${this.id}@${seq}`, err);
      });
    }
    return { ok: true, seq, events: res.events };
  }

  /**
   * Re-evaluate the turn timer after a change. Clocks only run while at least one seated player
   * is connected to the game; otherwise they reset and start from full when someone returns.
   */
  updateClock(now: number, anyoneHome: boolean): RunningClock | null {
    if (!this.clock) return null;
    if (!anyoneHome) this.clock.reset();
    this.running = anyoneHome ? this.clock.update(this.state, now) : null;
    return this.running;
  }

  /**
   * The clock `key` ran out: play the engine's default action for whoever is being waited on,
   * as the system actor, until that clock no longer applies (the turn passed, the discard is
   * done) or the game ends. Callers must hold the game's queue.
   */
  async timeout(key: string): Promise<GameEvent[]> {
    const events: GameEvent[] = [];
    for (let i = 0; i < MAX_TIMEOUT_ACTIONS && clockKey(this.state)?.key === key; i++) {
      const player = this.state.decisions.at(-1)?.pendingFrom[0];
      if (player === undefined) break;
      const res = await this.submit("system", defaultAction(this.state, player));
      if (!res.ok) {
        console.error(`timeout default rejected in ${this.id}: ${res.code} ${res.message}`);
        break;
      }
      events.push(...res.events);
    }
    return events;
  }

  /** The one place a socket's message is built: filtered view, its own legal moves, visible events. */
  messageFor(
    you: Role,
    newEvents: GameEvent[],
    players: SeatPlayer[],
    includeLog: boolean,
  ): GameStateMessage {
    const visible = (e: GameEvent) => eventVisibleTo(e, you);
    const scores: Record<PlayerId, number> = {};
    for (const p of this.state.players) scores[p] = computeVP(this.state, p, you);
    return {
      gameId: this.id,
      seq: this.seq,
      you,
      view: viewFor(this.state, you),
      legal: you === "spectator" ? [] : legalActions(this.state, you),
      builds: you === "spectator" ? [] : buildOptions(this.state, you),
      scores,
      ratios: you === "spectator" ? {} : tradeRatios(this.state, you),
      events: newEvents.filter(visible),
      ...(includeLog ? { log: this.log.filter(visible) } : {}),
      players,
      ...(this.running
        ? {
            clock: {
              kind: this.running.kind,
              remainingMs: Math.max(0, this.running.deadline - Date.now()),
              totalMs: this.running.totalMs,
            },
          }
        : {}),
    };
  }
}

/** Loads rooms on demand (once each). `queue` serializes every change to a game, keyed `game:<id>`. */
export class RoomManager {
  private rooms = new Map<string, Promise<GameRoom | null>>();
  readonly queue = new KeyedQueue();

  constructor(
    private store: Store,
    private snapshotEvery: number,
    private secondMs: number,
  ) {}

  get(gameId: string): Promise<GameRoom | null> {
    let room = this.rooms.get(gameId);
    if (!room) {
      room = GameRoom.load(this.store, gameId, this.snapshotEvery, this.secondMs);
      this.rooms.set(gameId, room);
      // Don't cache "not found" or a failed load.
      room.then(
        (r) => r || this.rooms.delete(gameId),
        () => this.rooms.delete(gameId),
      );
    }
    return room;
  }
}
