import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RunningServer } from "../server";
import type { Store } from "../store/types";
import { pick, startTestServer, TEST_SECOND_MS, TestClient } from "./harness";

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
    async function setUpGame(turnSeconds: 0 | 30 = 0) {
      const [ada, bo, cy, di] = await Promise.all(
        ["dev:Ada", "dev:Bo_b", "dev:Cyd", "dev:Dia"].map(connect),
      );
      const spec = await connect("dev:Watcher");
      const players = [ada!, bo!, cy!, di!];

      const created = await ada!.socket.emitWithAck("lobby:create", {
        maxSeats: 4,
        allowSpectators: true,
        turnSeconds,
      });
      if (!created.ok) throw new Error(created.code);
      const lobbyId = created.lobby.id;
      expect(created.lobby.turnSeconds).toBe(turnSeconds);

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

    it("sends build costs and disabled reasons only to the current actor", async () => {
      const { gameId, players, spec } = await setUpGame();
      const everyone = [...players, spec];
      for (let guard = 0; guard < 100; guard++) {
        const actor = players.find((c) => (c.state?.legal.length ?? 0) > 0)!;
        if (actor.state!.view.decisions.at(-1)?.kind === "MAIN") {
          const builds = actor.state!.builds;
          expect(builds.length).toBeGreaterThan(0);
          expect(builds.find((b) => b.piece === "road")?.cost).toEqual({ wood: 1, brick: 1 });
          expect(builds.filter((b) => !b.disabledReason).map((b) => b.action)).toEqual(
            actor.state!.legal.filter((a) => a.type.startsWith("BUILD_")),
          );
          expect(builds.some((b) => b.disabledReason)).toBe(true);
          for (const other of everyone.filter((c) => c !== actor))
            expect(other.state!.builds).toEqual([]);
          return;
        }
        const ack = await actor.act(gameId, pick(actor.state!));
        if (!ack.ok) throw new Error(ack.message);
        await Promise.all(everyone.map((c) => c.until(() => c.state!.seq === ack.seq)));
      }
      throw new Error("didn't reach main step");
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

    it("a one-seat lobby starts a solo game that plays like any other", async () => {
      const ada = await connect("dev:Ada");
      const created = await ada.socket.emitWithAck("lobby:create", {
        maxSeats: 1,
        allowSpectators: false,
      });
      if (!created.ok) throw new Error(created.code);
      const lobbyId = created.lobby.id;
      expect((await ada.socket.emitWithAck("lobby:ready", { lobbyId, ready: true })).ok).toBe(true);
      const started = await ada.socket.emitWithAck("lobby:start", { lobbyId });
      if (!started.ok) throw new Error(started.code);
      expect(await ada.socket.emitWithAck("game:join", { gameId: started.gameId })).toEqual({
        ok: true,
        you: "p0",
      });
      await playUntilTurn(started.gameId, [ada], 4);
      expect(ada.state!.view.players).toEqual(["p0"]);
    });

    it("maps: the host picks a built-in map; the game starts from it with its modules", async () => {
      const [ada, bo] = await Promise.all(["dev:Ada", "dev:Bo_b"].map(connect));
      const created = await ada!.socket.emitWithAck("lobby:create", {
        maxSeats: 2,
        allowSpectators: false,
      });
      if (!created.ok) throw new Error(created.code);
      const lobbyId = created.lobby.id;
      expect(created.lobby.map).toMatchObject({ id: "base-4p", name: "Standard Island" });

      expect((await bo!.socket.emitWithAck("lobby:join", { lobbyId })).ok).toBe(true);
      expect((await bo!.socket.emitWithAck("lobby:seat", { lobbyId, seat: 1 })).ok).toBe(true);
      for (const p of [ada!, bo!])
        expect((await p.socket.emitWithAck("lobby:ready", { lobbyId, ready: true })).ok).toBe(true);

      const choose = (who: TestClient, map: unknown) =>
        // Malformed payloads are part of the test.
        who.socket.emitWithAck("lobby:map", { lobbyId, map } as never);
      expect(await choose(bo!, { builtin: "grand-diamond" })).toMatchObject({
        ok: false,
        code: "NOT_HOST",
      });
      expect(await choose(ada!, { builtin: "no-such-map" })).toMatchObject({
        ok: false,
        code: "UNKNOWN_MAP",
      });
      expect(await choose(ada!, "grand-diamond")).toMatchObject({ ok: false, code: "BAD_REQUEST" });

      // Choosing a map clears the ready flags and everyone sees the new map.
      expect(await choose(ada!, { builtin: "grand-diamond" })).toEqual({ ok: true });
      await bo!.until(() => bo!.lobby?.map.id === "grand-diamond");
      expect(bo!.lobby!.map).toMatchObject({
        name: "Grand Diamond",
        players: { min: 2, max: 4 },
        vpToWin: 12,
      });
      expect(bo!.lobby!.seats.map((s) => s?.ready)).toEqual([false, false]);
      expect(await ada!.socket.emitWithAck("lobby:start", { lobbyId })).toMatchObject({
        ok: false,
        code: "NOT_READY",
      });

      for (const p of [ada!, bo!])
        expect((await p.socket.emitWithAck("lobby:ready", { lobbyId, ready: true })).ok).toBe(true);
      const started = await ada!.socket.emitWithAck("lobby:start", { lobbyId });
      if (!started.ok) throw new Error(started.code);
      expect(await choose(ada!, { builtin: "base-4p" })).toMatchObject({
        ok: false,
        code: "LOBBY_STARTED",
      });

      const stored = await store.getGame(started.gameId);
      expect(stored!.game.map.id).toBe("grand-diamond");
      expect(stored!.game.map.hexes.filter((h) => h.terrain !== "sea")).toHaveLength(49);
      expect(stored!.game.modules).toEqual(["base"]);

      expect((await ada!.socket.emitWithAck("game:join", { gameId: started.gameId })).ok).toBe(
        true,
      );
      await ada!.until(() => ada!.state !== null);
      expect(ada!.state!.view.map.id).toBe("grand-diamond");

      const history = await ada!.socket.emitWithAck("games:history", {});
      if (!history.ok) throw new Error(history.code);
      expect(history.games[0]!.mapName).toBe("Grand Diamond");
    });

    it("maps: a map that doesn't allow the lobby's seat count is refused", async () => {
      const ada = await connect("dev:Ada");
      const created = await ada.socket.emitWithAck("lobby:create", {
        maxSeats: 1,
        allowSpectators: false,
      });
      if (!created.ok) throw new Error(created.code);
      const ack = await ada.socket.emitWithAck("lobby:map", {
        lobbyId: created.lobby.id,
        map: { builtin: "grand-diamond" },
      });
      expect(ack).toMatchObject({ ok: false, code: "BAD_REQUEST" });
      if (!ack.ok) expect(ack.message).toMatch(/2.4 players/);
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
      expect(history.games.map((g) => [g.gameId, g.status, g.mapName, g.winner, g.scores])).toEqual(
        [[first.gameId, "active", "Standard Island", null, null]],
      );
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

    it("turn timers: idle players are moved by the system actor; replays match; nobody home stops the clock", async () => {
      const { gameId, spec } = await setUpGame(30);
      // Nobody acts: setup placements, rolls, robber moves and discards all come from timeouts.
      await spec.until(() => spec.state!.view.turn.number >= 4, 20_000);
      expect(spec.state!.clock).toMatchObject({ totalMs: 30 * TEST_SECOND_MS });
      const stored = await store.actionsAfter(gameId, 0);
      expect(stored.length).toBeGreaterThan(16); // 8 setup placements + 8 roads, at least
      expect(new Set(stored.map((a) => a.actor))).toEqual(new Set(["system"]));

      // Everyone leaves: no more timeouts.
      for (const c of clients.splice(0)) c.close();
      await new Promise((r) => setTimeout(r, 100));
      const settled = (await store.actionsAfter(gameId, 0)).length;
      await new Promise((r) => setTimeout(r, 300));
      expect((await store.actionsAfter(gameId, 0)).length).toBe(settled);

      // A restarted server replays the system actions to the same point.
      await server.close();
      server = await startTestServer(store);
      const back = await connect("dev:Ada");
      await back.socket.emitWithAck("game:join", { gameId });
      await back.until(() => back.state !== null);
      expect(back.state!.seq).toBe(settled);
      expect(back.state!.clock?.remainingMs).toBeGreaterThan(0);
    });

    it("a game without a timer never moves by itself", async () => {
      const { gameId, spec } = await setUpGame(0);
      await new Promise((r) => setTimeout(r, 200));
      expect(spec.state!.clock).toBeUndefined();
      expect(await store.actionsAfter(gameId, 0)).toEqual([]);
    });

    it("chat: players talk to everyone, spectators only to spectators; history on rejoin", async () => {
      const { gameId, players, spec } = await setUpGame();
      const watcher2 = await connect("dev:Watcher2");
      await watcher2.socket.emitWithAck("game:join", { gameId });
      const say = (c: TestClient, text: string) =>
        c.socket.emitWithAck("chat:send", { gameId, text });
      const texts = (c: TestClient) => c.chat.map((m) => `${m.username}: ${m.text}`);

      expect(await say(players[0]!, "  good luck all  ")).toEqual({ ok: true });
      expect(await say(spec, "Ada is going to win")).toEqual({ ok: true });
      await watcher2.until(() => watcher2.chat.length === 2);
      await players[3]!.until(() => players[3]!.chat.length === 1);
      expect(texts(watcher2)).toEqual(["Ada: good luck all", "Watcher: Ada is going to win"]);
      expect(texts(players[3]!)).toEqual(["Ada: good luck all"]);
      expect(watcher2.chat.map((m) => m.channel)).toEqual(["players", "spectators"]);

      // Rejoining sends the visible history.
      const again = await connect("dev:Dia");
      await again.socket.emitWithAck("game:join", { gameId });
      await again.until(() => again.chat.length === 1);
      expect(texts(again)).toEqual(["Ada: good luck all"]);

      // Limits: empty, too long, too fast, not in the game.
      expect(await say(players[1]!, "   ")).toMatchObject({ code: "BAD_REQUEST" });
      expect(await say(players[1]!, "x".repeat(301))).toMatchObject({ code: "BAD_REQUEST" });
      for (let i = 0; i < 5; i++) expect((await say(players[1]!, `msg ${i}`)).ok).toBe(true);
      expect(await say(players[1]!, "one too many")).toMatchObject({ code: "RATE_LIMITED" });
      const outsider = await connect("dev:Eve");
      expect(await say(outsider, "hi")).toMatchObject({ code: "NOT_FOUND" });
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
