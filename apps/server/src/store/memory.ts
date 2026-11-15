import type { StateSnapshot } from "@settlers/engine";
import type { GamePlayer, GameRecord, LobbyRecord, Profile, Store, StoredAction } from "./types";

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** In-memory Store for tests. Copies on the way in and out, like a real database would. */
export class MemoryStore implements Store {
  private profiles = new Map<string, Profile>();
  private lobbies = new Map<string, LobbyRecord>();
  private games = new Map<string, { game: GameRecord; players: GamePlayer[] }>();
  private actions = new Map<string, StoredAction[]>();
  private snapshots = new Map<string, { seq: number; state: StateSnapshot }[]>();

  async ensureProfile(userId: string): Promise<Profile> {
    if (!this.profiles.has(userId)) this.profiles.set(userId, { id: userId, username: null });
    return copy(this.profiles.get(userId)!);
  }

  async getProfiles(userIds: string[]): Promise<Profile[]> {
    return userIds.flatMap((id) => (this.profiles.has(id) ? [copy(this.profiles.get(id)!)] : []));
  }

  async setUsername(userId: string, username: string): Promise<"ok" | "taken"> {
    const lower = username.toLowerCase();
    for (const p of this.profiles.values()) {
      if (p.id !== userId && p.username?.toLowerCase() === lower) return "taken";
    }
    this.profiles.set(userId, { id: userId, username });
    return "ok";
  }

  async createLobby(lobby: LobbyRecord): Promise<void> {
    this.lobbies.set(lobby.id, copy(lobby));
  }
  async getLobby(id: string): Promise<LobbyRecord | null> {
    const l = this.lobbies.get(id);
    return l ? copy(l) : null;
  }
  async saveLobby(lobby: LobbyRecord): Promise<void> {
    this.lobbies.set(lobby.id, copy(lobby));
  }

  async startGame(lobby: LobbyRecord, game: GameRecord, players: GamePlayer[]): Promise<void> {
    this.games.set(game.id, copy({ game, players }));
    this.lobbies.set(lobby.id, copy(lobby));
  }
  async getGame(id: string) {
    const g = this.games.get(id);
    return g ? copy(g) : null;
  }

  async appendAction(gameId: string, action: StoredAction): Promise<void> {
    const list = this.actions.get(gameId) ?? [];
    if (list.length + 1 !== action.seq)
      throw new Error(`seq gap: have ${list.length}, got ${action.seq}`);
    list.push(copy(action));
    this.actions.set(gameId, list);
  }
  async actionsAfter(gameId: string, seq: number): Promise<StoredAction[]> {
    return copy((this.actions.get(gameId) ?? []).filter((a) => a.seq > seq));
  }

  async saveSnapshot(gameId: string, seq: number, state: StateSnapshot): Promise<void> {
    const list = this.snapshots.get(gameId) ?? [];
    list.push(copy({ seq, state }));
    this.snapshots.set(gameId, list);
  }
  async latestSnapshot(gameId: string) {
    const list = this.snapshots.get(gameId) ?? [];
    return list.length ? copy(list[list.length - 1]!) : null;
  }

  async close(): Promise<void> {}
}
