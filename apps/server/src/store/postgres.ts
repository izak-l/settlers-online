import type { StateSnapshot } from "@settlers/engine";
import pg from "pg";
import type { GamePlayer, GameRecord, LobbyRecord, Profile, Store, StoredAction } from "./types";

/** jsonb parameters are always passed as JSON text: node-postgres would turn JS arrays into Postgres arrays. */
const json = (v: unknown) => JSON.stringify(v);

interface LobbyRow {
  id: string;
  host_id: string;
  max_seats: number;
  allow_spectators: boolean;
  seats: LobbyRecord["seats"];
  status: LobbyRecord["status"];
  game_id: string | null;
}

const toLobby = (r: LobbyRow): LobbyRecord => ({
  id: r.id,
  hostId: r.host_id,
  maxSeats: r.max_seats,
  allowSpectators: r.allow_spectators,
  seats: r.seats,
  status: r.status,
  gameId: r.game_id,
});

export class PgStore implements Store {
  constructor(readonly pool: pg.Pool) {}

  async ensureProfile(userId: string): Promise<Profile> {
    const { rows } = await this.pool.query<Profile>(
      `insert into profiles (id) values ($1)
       on conflict (id) do update set id = excluded.id
       returning id, username`,
      [userId],
    );
    return rows[0]!;
  }

  async getProfiles(userIds: string[]): Promise<Profile[]> {
    if (userIds.length === 0) return [];
    const { rows } = await this.pool.query<Profile>(
      "select id, username from profiles where id = any($1)",
      [userIds],
    );
    return rows;
  }

  async setUsername(userId: string, username: string): Promise<"ok" | "taken"> {
    try {
      await this.pool.query(
        `insert into profiles (id, username) values ($1, $2)
         on conflict (id) do update set username = excluded.username`,
        [userId, username],
      );
      return "ok";
    } catch (err) {
      if ((err as { code?: string }).code === "23505") return "taken"; // unique_violation
      throw err;
    }
  }

  async createLobby(l: LobbyRecord): Promise<void> {
    await this.pool.query(
      `insert into lobbies (id, host_id, max_seats, allow_spectators, seats, status, game_id)
       values ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [l.id, l.hostId, l.maxSeats, l.allowSpectators, json(l.seats), l.status, l.gameId],
    );
  }

  async getLobby(id: string): Promise<LobbyRecord | null> {
    const { rows } = await this.pool.query<LobbyRow>("select * from lobbies where id = $1", [id]);
    return rows[0] ? toLobby(rows[0]) : null;
  }

  async saveLobby(l: LobbyRecord): Promise<void> {
    await this.pool.query(
      "update lobbies set seats = $2::jsonb, status = $3, game_id = $4 where id = $1",
      [l.id, json(l.seats), l.status, l.gameId],
    );
  }

  async startGame(lobby: LobbyRecord, game: GameRecord, players: GamePlayer[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into games (id, lobby_id, map, modules, seed, seats, status)
         values ($1, $2, $3::jsonb, $4, $5, $6, $7)`,
        [game.id, game.lobbyId, json(game.map), game.modules, game.seed, game.seats, game.status],
      );
      for (const p of players) {
        await client.query(
          "insert into game_players (game_id, seat, user_id) values ($1, $2, $3)",
          [game.id, p.seat, p.userId],
        );
      }
      await client.query(
        "update lobbies set seats = $2::jsonb, status = $3, game_id = $4 where id = $1",
        [lobby.id, json(lobby.seats), lobby.status, lobby.gameId],
      );
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async getGame(id: string): Promise<{ game: GameRecord; players: GamePlayer[] } | null> {
    const { rows } = await this.pool.query<{
      id: string;
      lobby_id: string;
      map: GameRecord["map"];
      modules: string[];
      seed: string;
      seats: string[];
      status: GameRecord["status"];
    }>("select id, lobby_id, map, modules, seed, seats, status from games where id = $1", [id]);
    const g = rows[0];
    if (!g) return null;
    const players = await this.pool.query<GamePlayer & { user_id: string }>(
      "select seat, user_id from game_players where game_id = $1 order by seat",
      [id],
    );
    return {
      game: {
        id: g.id,
        lobbyId: g.lobby_id,
        map: g.map,
        modules: g.modules,
        seed: g.seed,
        seats: g.seats,
        status: g.status,
      },
      players: players.rows.map((r) => ({ seat: r.seat, userId: r.user_id })),
    };
  }

  async appendAction(gameId: string, a: StoredAction): Promise<void> {
    await this.pool.query(
      "insert into actions (game_id, seq, actor, action, events) values ($1, $2, $3, $4::jsonb, $5::jsonb)",
      [gameId, a.seq, a.actor, json(a.action), json(a.events)],
    );
  }

  async actionsAfter(gameId: string, seq: number): Promise<StoredAction[]> {
    const { rows } = await this.pool.query<StoredAction>(
      "select seq, actor, action, events from actions where game_id = $1 and seq > $2 order by seq",
      [gameId, seq],
    );
    return rows;
  }

  async saveSnapshot(gameId: string, seq: number, state: StateSnapshot): Promise<void> {
    await this.pool.query(
      `insert into snapshots (game_id, seq, state) values ($1, $2, $3::jsonb)
       on conflict (game_id, seq) do nothing`,
      [gameId, seq, json(state)],
    );
  }

  async latestSnapshot(gameId: string): Promise<{ seq: number; state: StateSnapshot } | null> {
    const { rows } = await this.pool.query<{ seq: number; state: StateSnapshot }>(
      "select seq, state from snapshots where game_id = $1 order by seq desc limit 1",
      [gameId],
    );
    return rows[0] ?? null;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
