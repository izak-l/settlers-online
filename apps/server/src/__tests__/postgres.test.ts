import { describe, expect, it } from "vitest";
import pg from "pg";
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
    "truncate profiles, lobbies, games, game_players, actions, snapshots, friendships cascade",
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
        };
        await store.createLobby(lobby);
        expect(await store.getLobby("L2")).toEqual(lobby);
      } finally {
        await store.close();
      }
    });
  });
}
