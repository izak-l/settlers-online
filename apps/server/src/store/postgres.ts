import type { StateSnapshot } from "@settlers/engine";
import pg from "pg";
import type { ChatChannel, ChatMessage, GameSummary } from "@settlers/protocol";
import type {
  FriendshipRecord,
  GameResult,
  GamePlayer,
  GameRecord,
  LobbyRecord,
  Profile,
  Store,
  StoredAction,
} from "./types";

/** jsonb parameters are always passed as JSON text: node-postgres would turn JS arrays into Postgres arrays. */
const json = (v: unknown) => JSON.stringify(v);

interface LobbyRow {
  id: string;
  host_id: string;
  max_seats: number;
  allow_spectators: boolean;
  turn_seconds: number;
  seats: LobbyRecord["seats"];
  status: LobbyRecord["status"];
  game_id: string | null;
}

const toLobby = (r: LobbyRow): LobbyRecord => ({
  id: r.id,
  hostId: r.host_id,
  maxSeats: r.max_seats,
  allowSpectators: r.allow_spectators,
  turnSeconds: r.turn_seconds,
  seats: r.seats,
  status: r.status,
  gameId: r.game_id,
});

interface ChatRow {
  id: string; // bigserial comes back as a string
  channel: ChatChannel;
  user_id: string;
  text: string;
  created_at: Date;
  username: string | null;
}

const toChat = (r: ChatRow): ChatMessage => ({
  id: Number(r.id),
  channel: r.channel,
  userId: r.user_id,
  username: r.username ?? "?",
  text: r.text,
  at: r.created_at.toISOString(),
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

  async findProfileByUsername(username: string): Promise<Profile | null> {
    const { rows } = await this.pool.query<Profile>(
      "select id, username from profiles where lower(username) = lower($1)",
      [username],
    );
    return rows[0] ?? null;
  }

  async listFriendships(userId: string): Promise<FriendshipRecord[]> {
    const { rows } = await this.pool.query<FriendshipRecord>(
      `select requester_id as "requesterId", addressee_id as "addresseeId", status
       from friendships where requester_id = $1 or addressee_id = $1`,
      [userId],
    );
    return rows;
  }

  async saveFriendship(f: FriendshipRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `delete from friendships where (requester_id = $1 and addressee_id = $2)
                                    or (requester_id = $2 and addressee_id = $1)`,
        [f.requesterId, f.addresseeId],
      );
      await client.query(
        "insert into friendships (requester_id, addressee_id, status) values ($1, $2, $3)",
        [f.requesterId, f.addresseeId, f.status],
      );
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteFriendship(a: string, b: string): Promise<void> {
    await this.pool.query(
      `delete from friendships where (requester_id = $1 and addressee_id = $2)
                                  or (requester_id = $2 and addressee_id = $1)`,
      [a, b],
    );
  }

  async createLobby(l: LobbyRecord): Promise<void> {
    await this.pool.query(
      `insert into lobbies
         (id, host_id, max_seats, allow_spectators, seats, status, game_id, turn_seconds)
       values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
      [
        l.id,
        l.hostId,
        l.maxSeats,
        l.allowSpectators,
        json(l.seats),
        l.status,
        l.gameId,
        l.turnSeconds,
      ],
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
        `insert into games (id, lobby_id, map, modules, seed, seats, status, turn_seconds)
         values ($1, $2, $3::jsonb, $4, $5, $6, $7, $8)`,
        [
          game.id,
          game.lobbyId,
          json(game.map),
          game.modules,
          game.seed,
          game.seats,
          game.status,
          game.turnSeconds,
        ],
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
      turn_seconds: number;
    }>(
      "select id, lobby_id, map, modules, seed, seats, status, turn_seconds from games where id = $1",
      [id],
    );
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
        turnSeconds: g.turn_seconds,
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

  async finishGame(
    gameId: string,
    seq: number,
    state: StateSnapshot,
    result: GameResult,
  ): Promise<void> {
    await this.saveSnapshot(gameId, seq, state);
    await this.pool.query(
      `update games set status = 'finished', ended_at = now(), winner_seat = $2,
         final_scores = $3::jsonb where id = $1`,
      [gameId, result.winner, json(result.scores)],
    );
  }

  async addChat(
    gameId: string,
    channel: ChatChannel,
    userId: string,
    text: string,
  ): Promise<ChatMessage> {
    const { rows } = await this.pool.query<ChatRow>(
      `with m as (
         insert into chat_messages (game_id, channel, user_id, text) values ($1, $2, $3, $4)
         returning id, channel, user_id, text, created_at
       )
       select m.*, p.username from m join profiles p on p.id = m.user_id`,
      [gameId, channel, userId, text],
    );
    return toChat(rows[0]!);
  }

  async recentChat(gameId: string, channels: ChatChannel[], limit: number) {
    const { rows } = await this.pool.query<ChatRow>(
      `select * from (
         select c.id, c.channel, c.user_id, c.text, c.created_at, p.username
           from chat_messages c join profiles p on p.id = c.user_id
          where c.game_id = $1 and c.channel = any($2)
          order by c.id desc limit $3
       ) recent order by id`,
      [gameId, channels, limit],
    );
    return rows.map(toChat);
  }

  async gamesForUser(userId: string, limit: number): Promise<GameSummary[]> {
    const { rows } = await this.pool.query<{
      id: string;
      status: GameSummary["status"];
      created_at: Date;
      ended_at: Date | null;
      you: string;
      players: { seat: string; username: string | null }[];
      winner_seat: string | null;
      final_scores: Record<string, number> | null;
    }>(
      `select g.id, g.status, g.created_at, g.ended_at, me.seat as you, g.winner_seat,
              g.final_scores,
              (select json_agg(json_build_object('seat', gp.seat, 'username', p.username)
                               order by gp.seat)
                 from game_players gp join profiles p on p.id = gp.user_id
                where gp.game_id = g.id) as players
         from game_players me join games g on g.id = me.game_id
        where me.user_id = $1
        order by g.created_at desc
        limit $2`,
      [userId, limit],
    );
    return rows.map((r) => ({
      gameId: r.id,
      status: r.status,
      createdAt: r.created_at.toISOString(),
      endedAt: r.ended_at?.toISOString() ?? null,
      you: r.you,
      players: r.players.map((p) => ({ seat: p.seat, username: p.username ?? "?" })),
      winner: r.winner_seat,
      scores: r.final_scores,
    }));
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
