import { io as connectSocket, type Socket } from "socket.io-client";
import type { Action } from "@settlers/engine";
import type {
  ClientToServerEvents,
  GameStateMessage,
  LobbyState,
  Me,
  ServerToClientEvents,
} from "@settlers/protocol";
import { devAuthenticator } from "../auth";
import { startServer, type RunningServer } from "../server";
import type { Store } from "../store/types";

export function startTestServer(store: Store): Promise<RunningServer> {
  return startServer({
    config: { WEB_ORIGIN: "*", SNAPSHOT_EVERY: 10 },
    store,
    auth: devAuthenticator,
    port: 0,
  });
}

/** A test player: a real socket.io client that remembers the latest lobby and game state it was sent. */
export class TestClient {
  me: Me | null = null;
  lobby: LobbyState | null = null;
  state: GameStateMessage | null = null;
  /** Every event received via `state`, in order (log on join + events after). */
  log: string[] = [];

  private constructor(readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>) {
    socket.on("welcome", (me) => (this.me = me));
    socket.on("lobby", (l) => (this.lobby = l));
    socket.on("state", (s) => {
      if (s.log) this.log = s.log.map((e) => e.text);
      this.log.push(...s.events.map((e) => e.text));
      this.state = s;
    });
  }

  static async connect(url: string, token: string): Promise<TestClient> {
    const socket = connectSocket(url, {
      auth: { token },
      transports: ["websocket"],
      forceNew: true,
    });
    const client = new TestClient(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    await client.until(() => client.me !== null);
    return client;
  }

  /** Resolve once `check` passes, re-checking every few ms. */
  async until(check: () => boolean, ms = 5000): Promise<void> {
    const end = Date.now() + ms;
    while (!check()) {
      if (Date.now() > end) throw new Error("timed out waiting for condition");
      await new Promise((r) => setTimeout(r, 5));
    }
  }

  act(gameId: string, action: Action) {
    return this.socket.emitWithAck("game:action", { gameId, action });
  }

  close(): void {
    this.socket.disconnect();
  }
}

/** A simple greedy player: build what scores, play cards, trade with the bank, then end the turn. */
export function pick(state: GameStateMessage): Action {
  const first = (...types: string[]) => state.legal.find((a) => types.includes(a.type));
  return (
    first("BUILD_CITY") ??
    first("BUILD_SETTLEMENT") ??
    first("BUY_DEV_CARD") ??
    first("BUILD_ROAD") ??
    first("PLAY_KNIGHT", "PLAY_ROAD_BUILDING", "PLAY_YEAR_OF_PLENTY", "PLAY_MONOPOLY") ??
    first("BANK_TRADE") ??
    first("END_TURN", "ROLL") ??
    state.legal[0]!
  );
}
