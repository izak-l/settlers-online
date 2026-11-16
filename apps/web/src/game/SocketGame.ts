import type { Action, GameEvent } from "@settlers/engine";
import type { ChatMessage, GameStateMessage } from "@settlers/protocol";
import type { AppSocket } from "../net/socket";
import type { GameClient, SendError, Snapshot } from "./LocalGame";

/**
 * Online play: the server is authoritative. This only joins the game, keeps the latest
 * message plus the running log, and forwards actions. It never applies anything itself.
 */
export class SocketGame implements GameClient {
  private latest: Snapshot | null = null;
  private log: GameEvent[] = [];
  private listeners = new Set<(snap: Snapshot) => void>();
  private onState = (msg: GameStateMessage) => this.receive(msg);
  private onConnect = () => void this.join();
  private messages: ChatMessage[] = [];
  private chatListeners = new Set<(messages: ChatMessage[]) => void>();
  private onChat = (u: { gameId: string; messages: ChatMessage[]; replace: boolean }) => {
    if (u.gameId !== this.gameId) return;
    this.messages = u.replace ? u.messages : [...this.messages, ...u.messages];
    for (const l of this.chatListeners) l(this.messages);
  };

  readonly chat = {
    subscribe: (listener: (messages: ChatMessage[]) => void) => {
      this.chatListeners.add(listener);
      listener(this.messages);
      return () => void this.chatListeners.delete(listener);
    },
    send: async (text: string): Promise<SendError | null> => {
      const ack = await this.socket
        .timeout(10_000)
        .emitWithAck("chat:send", { gameId: this.gameId, text });
      return ack.ok ? null : { code: ack.code, message: ack.message };
    },
  };

  /** Last join failure (e.g. not found, spectators disabled), for the UI. */
  joinError: SendError | null = null;

  constructor(
    private socket: AppSocket,
    readonly gameId: string,
    private onJoinError: (err: SendError) => void = () => undefined,
  ) {
    socket.on("state", this.onState);
    socket.on("chat", this.onChat);
    // Rejoin after every reconnect; the server then resends the full state and log.
    socket.on("connect", this.onConnect);
    if (socket.connected) void this.join();
  }

  private async join(): Promise<void> {
    const ack = await this.socket.emitWithAck("game:join", { gameId: this.gameId });
    if (!ack.ok) {
      this.joinError = { code: ack.code, message: ack.message };
      this.onJoinError(this.joinError);
    }
  }

  private receive(msg: GameStateMessage): void {
    if (msg.gameId !== this.gameId) return;
    this.log = msg.log ? [...msg.log] : [...this.log, ...msg.events];
    this.latest = {
      seat: msg.you,
      view: msg.view,
      legal: msg.legal,
      builds: msg.builds ?? [],
      scores: msg.scores,
      ratios: msg.ratios,
      log: this.log,
      players: msg.players.map((p) => ({ id: p.seat, name: p.username, connected: p.connected })),
      ...(msg.clock
        ? {
            clock: {
              kind: msg.clock.kind,
              deadline: Date.now() + msg.clock.remainingMs,
              totalMs: msg.clock.totalMs,
            },
          }
        : {}),
    };
    for (const l of this.listeners) l(this.latest);
  }

  subscribe(listener: (snap: Snapshot) => void): () => void {
    this.listeners.add(listener);
    if (this.latest) listener(this.latest);
    return () => this.listeners.delete(listener);
  }

  async send(action: Action): Promise<SendError | null> {
    const ack = await this.socket
      .timeout(10_000)
      .emitWithAck("game:action", { gameId: this.gameId, action });
    return ack.ok ? null : { code: ack.code, message: ack.message };
  }

  dispose(): void {
    if (this.socket.connected) void this.socket.emitWithAck("game:leave", { gameId: this.gameId });
    this.socket.off("state", this.onState);
    this.socket.off("chat", this.onChat);
    this.chatListeners.clear();
    this.socket.off("connect", this.onConnect);
    this.listeners.clear();
  }
}
