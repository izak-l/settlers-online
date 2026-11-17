import { describe, expect, it } from "vitest";
import pg from "pg";
import type { LobbyRecord } from "../store/types";
import { BASE_4P, findMap } from "@settlers/maps";
import { loadEnvFiles } from "../config";
import { migrate } from "../db/migrate";
import { PgStore } from "../store/postgres";
import { onlineSuite } from "./online-suite";
import { socialSuite } from "./social-suite";

loadEnvFiles();
const url = process.env["TEST_DATABASE_URL"];

/** A fresh, migrated, empty test database for each test. */
async function freshStore(): Promise<PgStore> {
  const pool = new pg.Pool({ connectionString: url });
  await migrate(pool, () => undefined);
  await pool.query(
    "truncate profiles, lobbies, games, game_players, actions, snapshots, friendships, chat_messages cascade",
  );
  return new PgStore(pool);
}

if (!url) {
  describe.skip("online play (Postgres) — set TEST_DATABASE_URL to run", () => {
    it("skipped", () => undefined);
  });
} else {
  onlineSuite("online play (Postgres)", freshStore);
  socialSuite("friends, presence and invites (Postgres)", freshStore);

  describe("PgStore", () => {
    it("refuses a duplicate action sequence number", async () => {
      const store = await freshStore();
      try {
        await store.ensureProfile("u1");
        await store.createLobby({
          id: "L1",
          hostId: "u1",
          maxSeats: 3,
          allowSpectators: false,
          turnSeconds: 0,
          seats: [null, null, null],
          status: "open",
          gameId: null,
          map: BASE_4P,
          features: {},
          gameType: "base" as const,
          vpToWin: 10,
          discardLimit: 7,
        });
        const game = {
          id: "00000000-0000-0000-0000-000000000001",
          lobbyId: "L1",
          modules: ["base"],
          seed: "s",
          seats: ["p0"],
          status: "active" as const,
          turnSeconds: 0,
          map: { id: "m", vpToWin: 10, hexes: [], ports: [] },
        };
        await store.startGame(
          {
            id: "L1",
            hostId: "u1",
            maxSeats: 3,
            allowSpectators: false,
            turnSeconds: 0,
            seats: [null, null, null],
            status: "started",
            gameId: game.id,
            map: BASE_4P,
            features: {},
            gameType: "base" as const,
            vpToWin: 10,
            discardLimit: 7,
          },
          game,
          [{ seat: "p0", userId: "u1" }],
        );
        const a = { seq: 1, actor: "p0", action: { type: "ROLL" as const }, events: [] };
        await store.appendAction(game.id, a);
        await expect(store.appendAction(game.id, a)).rejects.toThrow();
        expect(await store.actionsAfter(game.id, 0)).toEqual([a]);
      } finally {
        await store.close();
      }
    });

    it("stores arrays in jsonb columns as arrays", async () => {
      const store = await freshStore();
      try {
        await store.ensureProfile("u1");
        const lobby = {
          id: "L2",
          hostId: "u1",
          maxSeats: 3,
          allowSpectators: true,
          turnSeconds: 0,
          seats: [{ userId: "u1", ready: true }, null, null],
          status: "open" as const,
          gameId: null,
          map: findMap("grand-diamond")!.def,
          features: { devCards: false } as LobbyRecord["features"],
          gameType: "base" as const,
          vpToWin: 10,
          discardLimit: 7,
        };
        await store.createLobby(lobby);
        expect(await store.getLobby("L2")).toEqual(lobby);
        lobby.map = BASE_4P;
        lobby.features = { robber: false };
        await store.saveLobby(lobby);
        expect((await store.getLobby("L2"))!.map).toEqual(BASE_4P);
        expect((await store.getLobby("L2"))!.features).toEqual({ robber: false });
        // Lobby settings (spec 229) are saved; lobbies from before them read the map's values.
        Object.assign(lobby, {
          vpToWin: 13,
          discardLimit: 9,
          turnSeconds: 60,
          allowSpectators: false,
        });
        await store.saveLobby(lobby);
        expect(await store.getLobby("L2")).toEqual(lobby);
        const pool = new pg.Pool({ connectionString: url });
        await pool.query(
          "update lobbies set vp_to_win = null, discard_limit = null where id = 'L2'",
        );
        await pool.end();
        expect(await store.getLobby("L2")).toMatchObject({
          vpToWin: BASE_4P.vpToWin,
          discardLimit: 7,
        });
      } finally {
        await store.close();
      }
    });

    it("reads a lobby saved before maps existed (map is null) as the base map", async () => {
      const store = await freshStore();
      try {
        await store.ensureProfile("u1");
        await store.createLobby({
          id: "L3",
          hostId: "u1",
          maxSeats: 2,
          allowSpectators: false,
          turnSeconds: 0,
          seats: [null, null],
          status: "open",
          gameId: null,
          map: BASE_4P,
          features: {},
          gameType: "base" as const,
          vpToWin: 10,
          discardLimit: 7,
        });
        const pool = new pg.Pool({ connectionString: url });
        await pool.query("update lobbies set map = null where id = 'L3'");
        await pool.end();
        expect((await store.getLobby("L3"))!.map).toEqual(BASE_4P);
      } finally {
        await store.close();
      }
    });
  });
}
