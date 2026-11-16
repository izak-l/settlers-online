import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RunningServer } from "../server";
import type { Store } from "../store/types";
import { pick, startTestServer, TestClient } from "./harness";

/**
 * The M4 "done when" scenario, end to end over real sockets:
 * 4 signed-in players + 1 spectator play 10 turns; a refresh mid-game recovers the seat;
 * a server restart picks the game up from storage.
 */
export function onlineSuite(name: string, makeStore: () => Promise<Store>) {
  describe(name, () => {
    let store: Store;
    let server: RunningServer;
    const clients: TestClient[] = [];
    const connect = async (token: string) => {
      const c = await TestClient.connect(server.url, token);
      clients.push(c);
      return c;
    };

    beforeEach(async () => {
      store = await makeStore();
      server = await startTestServer(store);
    });
    afterEach(async () => {
      for (const c of clients.splice(0)) c.close();
      await server.close();
      await store.close();
    });

    /** Lobby → started game with all five clients joined. */
    async function setUpGame() {
      const [ada, bo, cy, di] = await Promise.all(
        ["dev:Ada", "dev:Bo_b", "dev:Cyd", "dev:Dia"].map(connect),
      );
      const spec = await connect("dev:Watcher");
      const players = [ada!, bo!, cy!, di!];

      const created = await ada!.socket.emitWithAck("lobby:create", {
        maxSeats: 4,
        allowSpectators: true,
      });
      if (!created.ok) throw new Error(created.code);
      const lobbyId = created.lobby.id;

      for (const [i, p] of players.entries()) {
        if (i > 0) {
          expect((await p.socket.emitWithAck("lobby:join", { lobbyId })).ok).toBe(true);
          expect((await p.socket.emitWithAck("lobby:seat", { lobbyId, seat: i })).ok).toBe(true);
        }
      }
      // Not everyone is ready yet
      expect(await ada!.socket.emitWithAck("lobby:start", { lobbyId })).toMatchObject({
        ok: false,
        code: "NOT_READY",
      });
      for (const p of players)
        expect((await p.socket.emitWithAck("lobby:ready", { lobbyId, ready: true })).ok).toBe(true);
      // Only the host can start
      expect(await bo!.socket.emitWithAck("lobby:start", { lobbyId })).toMatchObject({
        ok: false,
        code: "NOT_HOST",
      });

      const started = await ada!.socket.emitWithAck("lobby:start", { lobbyId });
      if (!started.ok) throw new Error(started.code);
      const gameId = started.gameId;
      await bo!.until(() => bo!.lobby?.status === "started" && bo!.lobby.gameId === gameId);

      for (const [i, p] of players.entries()) {
        expect(await p.socket.emitWithAck("game:join", { gameId })).toEqual({
          ok: true,
          you: `p${i}`,
        });
      }
      expect(await spec.socket.emitWithAck("game:join", { gameId })).toEqual({
        ok: true,
        you: "spectator",
      });
      return { gameId, players, spec };
    }

    /** Whoever the game is waiting on acts, until `turns` full turns have been played. */
    async function playUntilTurn(gameId: string, everyone: TestClient[], turn: number) {
      for (let guard = 0; guard < 2000; guard++) {
        const actor = everyone.find((c) => (c.state?.legal.length ?? 0) > 0);
        if (!actor) throw new Error("nobody can act");
        if (
          actor.state!.view.turn.number >= turn &&
          actor.state!.view.decisions.at(-1)?.kind === "ROLL"
        )
          return;
        const ack = await actor.act(gameId, pick(actor.state!));
        if (!ack.ok) throw new Error(`${ack.code}: ${ack.message}`);
        await Promise.all(everyone.map((c) => c.until(() => c.state!.seq === ack.seq)));
      }
      throw new Error("game didn't reach the turn");
    }

    it("4 players + a spectator play 10 turns; hidden info stays hidden", async () => {
      const { gameId, players, spec } = await setUpGame();
      const everyone = [...players, spec];
      await playUntilTurn(gameId, everyone, 11);

      const seq = players[0]!.state!.seq;
      for (const c of everyone) expect(c.state!.seq).toBe(seq);

      for (const [i, p] of players.entries()) {
        for (let j = 0; j < 4; j++) {
          const zone = p.state!.view.zones[`hand-p${j}`]!;
          if (i === j) expect(zone.contents).toBeDefined();
          else expect(zone.contents).toBeUndefined();
        }
      }
      expect(spec.state!.legal).toEqual([]);
      for (let j = 0; j < 4; j++)
        expect(spec.state!.view.zones[`hand-p${j}`]!.contents).toBeUndefined();
      expect("rng" in spec.state!.view).toBe(false);
      // Everyone saw the same public events (e.g. every roll); the spectator never sees a secret:
      // which card was stolen, or which dev card someone drew.
      const rolls = (log: string[]) => log.filter((l) => / rolled \d+$/.test(l));
      for (const p of players) expect(rolls(p.log)).toEqual(rolls(spec.log));
      expect(rolls(spec.log).length).toBeGreaterThanOrEqual(10);
      expect(spec.log.filter((l) => / stole 1 | drew /.test(l))).toEqual([]);
    });

    it("plays a whole game to a winner; everyone sees it and the game is stored as finished", async () => {
      const { gameId, players, spec } = await setUpGame();
      const everyone = [...players, spec];
      for (
        let guard = 0;
        guard < 20_000 && everyone[0]!.state!.view.winner === undefined;
        guard++
      ) {
        const actor = everyone.find((c) => (c.state?.legal.length ?? 0) > 0);
        if (!actor) throw new Error("nobody can act");
        const ack = await actor.act(gameId, pick(actor.state!));
        if (!ack.ok) throw new Error(`${ack.code}: ${ack.message}`);
        await Promise.all(everyone.map((c) => c.until(() => c.state!.seq === ack.seq)));
      }
      const winner = spec.state!.view.winner;
      expect(winner).toBeDefined();
      expect(spec.log.at(-1)).toMatch(/won the game/);
      // After the game, every viewer sees the full score (VP cards included).
      expect(spec.state!.scores[winner!]).toBeGreaterThanOrEqual(10);
      for (const p of players) expect(p.state!.legal).toEqual([]);
      expect((await store.getGame(gameId))!.game.status).toBe("finished");

      // History: each player sees the finished game with the winner and full scores.
      const history = await players[1]!.socket.emitWithAck("games:history", {});
      if (!history.ok) throw new Error(history.code);
      expect(history.games).toHaveLength(1);
      expect(history.games[0]).toMatchObject({
        gameId,
        status: "finished",
        you: "p1",
        winner,
        players: [
          { seat: "p0", username: "Ada" },
          { seat: "p1", username: "Bo_b" },
          { seat: "p2", username: "Cyd" },
          { seat: "p3", username: "Dia" },
        ],
      });
      expect(history.games[0]!.scores![winner!]).toBeGreaterThanOrEqual(10);
      expect(history.games[0]!.endedAt).not.toBeNull();
      // A spectator has no games of their own.
      expect(await spec.socket.emitWithAck("games:history", {})).toEqual({ ok: true, games: [] });
    });

    it("history lists games in progress, newest first", async () => {
      const first = await setUpGame();
      const again = await first.players[0]!.socket.emitWithAck("lobby:create", {
        maxSeats: 3,
        allowSpectators: false,
      });
      if (!again.ok) throw new Error(again.code);
      const history = await first.players[0]!.socket.emitWithAck("games:history", {});
      if (!history.ok) throw new Error(history.code);
      expect(history.games.map((g) => [g.gameId, g.status, g.winner, g.scores])).toEqual([
        [first.gameId, "active", null, null],
      ]);
    });

    it("rejects acting out of turn, spectators acting, and malformed actions", async () => {
      const { gameId, players, spec } = await setUpGame();
      expect(await players[1]!.act(gameId, { type: "ROLL" })).toMatchObject({
        ok: false,
        code: "WRONG_DECISION",
      });
      const wait = players[1]!.state!.legal.length === 0;
      expect(wait).toBe(true);
      expect(await spec.act(gameId, { type: "END_TURN" })).toMatchObject({
        ok: false,
        code: "NOT_YOUR_TURN",
      });
      const bad = await players[0]!.socket.emitWithAck("game:action", {
        gameId,
        action: { type: "TELEPORT" },
      } as never);
      expect(bad).toMatchObject({ ok: false, code: "BAD_REQUEST" });
    });

    it("a player who refreshes gets the same seat, view and log back", async () => {
      const { gameId, players, spec } = await setUpGame();
      await playUntilTurn(gameId, [...players, spec], 3);

      const before = players[2]!.state!;
      const beforeLog = players[2]!.log;
      players[2]!.close();
      await players[0]!.until(() => players[0]!.state!.players[2]!.connected === false);

      const again = await connect("dev:Cyd");
      expect(await again.socket.emitWithAck("game:join", { gameId })).toEqual({
        ok: true,
        you: "p2",
      });
      await again.until(() => again.state !== null);
      expect(again.state!.view).toEqual(before.view);
      expect(again.log).toEqual(beforeLog);
      await players[0]!.until(() => players[0]!.state!.players[2]!.connected === true);

      players[2] = again;
      await playUntilTurn(gameId, [...players, spec], 5);
    });

    it("a restarted server resumes the game from storage", async () => {
      const { gameId, players, spec } = await setUpGame();
      await playUntilTurn(gameId, [...players, spec], 6);
      const before = players[0]!.state!;
      for (const c of clients.splice(0)) c.close();
      await server.close();

      server = await startTestServer(store); // same storage, fresh process state
      const back = await Promise.all(["dev:Ada", "dev:Bo_b", "dev:Cyd", "dev:Dia"].map(connect));
      for (const p of back) await p.socket.emitWithAck("game:join", { gameId });
      await Promise.all(back.map((p) => p.until(() => p.state !== null)));
      expect(back[0]!.state!.seq).toBe(before.seq);
      expect(back[0]!.state!.view).toEqual(before.view);
      await playUntilTurn(gameId, back, 8);
    });

    it("lobby rules: seats can't be stolen, unknown lobbies 404, usernames are unique", async () => {
      const ada = await connect("dev:Ada");
      const bob = await connect("dev:Bo_b");
      const created = await ada.socket.emitWithAck("lobby:create", {
        maxSeats: 3,
        allowSpectators: false,
      });
      if (!created.ok) throw new Error(created.code);
      const lobbyId = created.lobby.id;
      await bob.socket.emitWithAck("lobby:join", { lobbyId });
      expect(await bob.socket.emitWithAck("lobby:seat", { lobbyId, seat: 0 })).toMatchObject({
        code: "SEAT_TAKEN",
      });
      expect(await bob.socket.emitWithAck("lobby:join", { lobbyId: "nope" })).toMatchObject({
        code: "NOT_FOUND",
      });
      expect(
        await bob.socket.emitWithAck("profile:setUsername", { username: "ada" }),
      ).toMatchObject({
        code: "USERNAME_TAKEN",
      });
      expect(await bob.socket.emitWithAck("profile:setUsername", { username: "x" })).toMatchObject({
        code: "BAD_REQUEST",
      });
    });

    it("refuses connections without a valid token", async () => {
      await expect(TestClient.connect(server.url, "not-a-token")).rejects.toThrow(
        "UNAUTHENTICATED",
      );
    });
  });
}
