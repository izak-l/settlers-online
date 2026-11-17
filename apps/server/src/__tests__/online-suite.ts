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

    /** Shrink a lobby to two seats, keeping the given points to win and the usual discard limit. */
    function twoSeats(host: TestClient, lobbyId: string, vpToWin = 12) {
      return host.socket.emitWithAck("lobby:settings", {
        lobbyId,
        maxSeats: 2,
        vpToWin,
        discardLimit: 7,
        turnSeconds: 0,
        allowSpectators: false,
      });
    }

    /**
     * Whoever the game is waiting on takes one action, and everyone waits to see it. The server
     * may have moved first (the auto-roll, spec 231): then nothing is sent and the caller looks
     * at the new state.
     */
    async function actOnce(gameId: string, everyone: TestClient[]): Promise<void> {
      const actor = everyone.find((c) => (c.state?.legal.length ?? 0) > 0);
      if (!actor) throw new Error("nobody can act");
      const seqBefore = actor.state!.seq;
      const ack = await actor.act(gameId, pick(actor.state!));
      if (!ack.ok) {
        const moved = await actor
          .until(() => actor.state!.seq > seqBefore, 1000)
          .then(() => true)
          .catch(() => false);
        if (!moved) throw new Error(`${ack.code}: ${ack.message}`);
        return;
      }
      await Promise.all(everyone.map((c) => c.until(() => c.state!.seq >= ack.seq)));
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
        await actOnce(gameId, everyone);
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
        await actOnce(gameId, everyone);
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
        players: { min: 1, max: 4 },
        vpToWin: 12,
      });
      // The map's defaults (spec 229): four seats again, ready flags cleared.
      expect(bo!.lobby!.seats.map((s) => s?.ready)).toEqual([false, false, undefined, undefined]);
      expect(await ada!.socket.emitWithAck("lobby:start", { lobbyId })).toMatchObject({
        ok: false,
        code: "NOT_READY",
      });
      expect(await twoSeats(ada!, lobbyId)).toEqual({ ok: true });

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

    it("lobby settings: seats, points, discard limit, timer and spectators (spec 229)", async () => {
      const [ada, bo, cy] = await Promise.all(["dev:Ada", "dev:Bo_b", "dev:Cyd"].map(connect));
      // Home sends only the game type; the rest start at the map's defaults.
      const created = await ada!.socket.emitWithAck("lobby:create", { gameType: "base" });
      if (!created.ok) throw new Error(created.code);
      const lobbyId = created.lobby.id;
      expect(created.lobby).toMatchObject({
        maxSeats: 4,
        vpToWin: 10,
        discardLimit: 7,
        turnSeconds: 0,
        allowSpectators: true,
      });
      for (const [who, seat] of [
        [bo!, 3],
        [cy!, 1],
      ] as const) {
        expect((await who.socket.emitWithAck("lobby:join", { lobbyId })).ok).toBe(true);
        expect((await who.socket.emitWithAck("lobby:seat", { lobbyId, seat })).ok).toBe(true);
      }
      for (const p of [ada!, bo!, cy!])
        expect((await p.socket.emitWithAck("lobby:ready", { lobbyId, ready: true })).ok).toBe(true);

      const settings = {
        maxSeats: 3,
        vpToWin: 12,
        discardLimit: 9,
        turnSeconds: 60,
        allowSpectators: false,
      };
      const set = (who: TestClient, over: object = {}) =>
        // Malformed payloads are part of the test.
        who.socket.emitWithAck("lobby:settings", { lobbyId, ...settings, ...over } as never);
      expect(await set(bo!)).toMatchObject({ ok: false, code: "NOT_HOST" });
      expect(await set(ada!, { maxSeats: 2 })).toMatchObject({ ok: false, code: "BAD_REQUEST" });
      expect(await set(ada!, { vpToWin: 30 })).toMatchObject({ ok: false, code: "BAD_REQUEST" });
      expect(await set(ada!, { discardLimit: 4 })).toMatchObject({
        ok: false,
        code: "BAD_REQUEST",
      });
      // Three seats: Bo moves up from the fourth seat; everyone readies up again.
      expect(await set(ada!)).toEqual({ ok: true });
      await bo!.until(() => bo!.lobby?.maxSeats === 3);
      expect(bo!.lobby).toMatchObject(settings);
      expect(bo!.lobby!.seats.map((s) => s?.username)).toEqual(["Ada", "Cyd", "Bo_b"]);
      expect(bo!.lobby!.seats.map((s) => s?.ready)).toEqual([false, false, false]);

      // A map change resets seats, points and discard limit to that map's defaults.
      const choose = (id: string) =>
        ada!.socket.emitWithAck("lobby:map", { lobbyId, map: { builtin: id } });
      expect(await choose("grand-diamond")).toEqual({ ok: true });
      await bo!.until(() => bo!.lobby?.map.id === "grand-diamond");
      expect(bo!.lobby).toMatchObject({
        maxSeats: 4,
        vpToWin: 12,
        discardLimit: 7,
        turnSeconds: 60,
      });
      expect(await choose("little-harbour")).toEqual({ ok: true });
      await bo!.until(() => bo!.lobby?.map.id === "little-harbour");
      expect(bo!.lobby!.maxSeats).toBe(3);
      // More seats than the map takes are refused.
      expect(await set(ada!, { maxSeats: 4 })).toMatchObject({ ok: false, code: "BAD_REQUEST" });

      expect(await set(ada!, { vpToWin: 3, discardLimit: 5, turnSeconds: 0 })).toEqual({
        ok: true,
      });
      await bo!.until(() => bo!.lobby?.vpToWin === 3);
      for (const p of [ada!, bo!, cy!])
        expect((await p.socket.emitWithAck("lobby:ready", { lobbyId, ready: true })).ok).toBe(true);
      const started = await ada!.socket.emitWithAck("lobby:start", { lobbyId });
      if (!started.ok) throw new Error(started.code);
      expect(await set(ada!)).toMatchObject({ ok: false, code: "LOBBY_STARTED" });
      const stored = await store.getGame(started.gameId);
      expect(stored!.game.map).toMatchObject({ vpToWin: 3, discardLimit: 5 });
      expect((await ada!.socket.emitWithAck("game:join", { gameId: started.gameId })).ok).toBe(
        true,
      );
      await ada!.until(() => ada!.state !== null);
      expect(ada!.state!.view.options).toMatchObject({ vpToWin: 3, discardLimit: 5 });
    });

    it("scenarios: a seafaring lobby picks a scenario; its game type picks the map size", async () => {
      const [ada, bo] = await Promise.all(["dev:Ada", "dev:Bo_b"].map(connect));
      const created = await ada!.socket.emitWithAck("lobby:create", {
        gameType: "seafaring-3",
        maxSeats: 2,
        allowSpectators: false,
      });
      if (!created.ok) throw new Error(created.code);
      const lobbyId = created.lobby.id;
      expect(created.lobby.gameType).toBe("seafaring-3");
      const choose = (map: unknown) =>
        ada!.socket.emitWithAck("lobby:map", { lobbyId, map } as never);
      // A base map isn't part of a seafaring game type.
      expect(await choose({ builtin: "base-4p" })).toMatchObject({
        ok: false,
        code: "UNKNOWN_MAP",
      });
      expect(await choose({ scenario: "no-such", setup: "fixed" })).toMatchObject({
        ok: false,
        code: "UNKNOWN_MAP",
      });
      // Variable setup (spec 017) picks the random map for the seat count.
      expect(await choose({ scenario: "new-horizons", setup: "variable" })).toEqual({ ok: true });
      expect((await bo!.socket.emitWithAck("lobby:join", { lobbyId })).ok).toBe(true);
      expect(await choose({ scenario: "new-horizons", setup: "fixed" })).toEqual({ ok: true });
      await bo!.until(() => bo!.lobby?.map.scenario?.id === "new-horizons");
      expect(bo!.lobby!.map).toMatchObject({
        id: "new-horizons-3p-fixed",
        name: "New Horizons",
        vpToWin: 14,
        scenario: { id: "new-horizons", setup: "fixed" },
      });

      expect((await bo!.socket.emitWithAck("lobby:seat", { lobbyId, seat: 1 })).ok).toBe(true);
      expect(await twoSeats(ada!, lobbyId, 14)).toEqual({ ok: true });
      for (const p of [ada!, bo!])
        expect((await p.socket.emitWithAck("lobby:ready", { lobbyId, ready: true })).ok).toBe(true);
      const started = await ada!.socket.emitWithAck("lobby:start", { lobbyId });
      if (!started.ok) throw new Error(started.code);
      const stored = await store.getGame(started.gameId);
      expect(stored!.game.modules).toEqual(["base", "seafaring"]);
      expect(stored!.game.map.id).toBe("new-horizons-3p-fixed");

      expect((await ada!.socket.emitWithAck("game:join", { gameId: started.gameId })).ok).toBe(
        true,
      );
      await ada!.until(() => ada!.state !== null);
      expect(ada!.state!.view.pieces["pirate"]).toBeDefined();
      // Starting settlements only on the main island; the legal list says so.
      expect(ada!.state!.legal.every((a) => a.type === "PLACE_SETTLEMENT")).toBe(true);

      const history = await ada!.socket.emitWithAck("games:history", {});
      if (!history.ok) throw new Error(history.code);
      expect(history.games[0]!.mapName).toBe("New Horizons");
    });

    it("game types: maps outside the type are refused; the host can switch type (spec 023)", async () => {
      const [ada, bo, cy] = await Promise.all(["dev:Ada", "dev:Bo_b", "dev:Cyd"].map(connect));
      // A type that can't take the seat count is refused.
      expect(
        await ada!.socket.emitWithAck("lobby:create", {
          gameType: "seafaring-3",
          maxSeats: 4,
          allowSpectators: false,
        }),
      ).toMatchObject({ ok: false, code: "BAD_REQUEST" });

      const created = await ada!.socket.emitWithAck("lobby:create", {
        maxSeats: 4,
        allowSpectators: false,
      });
      if (!created.ok) throw new Error(created.code);
      const lobbyId = created.lobby.id;
      expect(created.lobby.gameType).toBe("base");
      expect(
        await ada!.socket.emitWithAck("lobby:map", {
          lobbyId,
          map: { scenario: "new-horizons", setup: "fixed" },
        }),
      ).toMatchObject({ ok: false, code: "UNKNOWN_MAP" });

      // Bo sits in the last seat, Cy in the second: switching to a 3-player type moves them up
      // into the first three seats and drops the fourth.
      for (const [who, seat] of [
        [bo!, 3],
        [cy!, 1],
      ] as const) {
        expect((await who.socket.emitWithAck("lobby:join", { lobbyId })).ok).toBe(true);
        expect((await who.socket.emitWithAck("lobby:seat", { lobbyId, seat })).ok).toBe(true);
      }
      const setType = (who: TestClient, gameType: unknown) =>
        who.socket.emitWithAck("lobby:type", { lobbyId, gameType } as never);
      expect(await setType(bo!, "seafaring-3")).toMatchObject({ ok: false, code: "NOT_HOST" });
      expect(await setType(ada!, "seafaring-6")).toMatchObject({ ok: false, code: "BAD_REQUEST" });
      expect(await setType(ada!, "seafaring-3")).toEqual({ ok: true });
      await bo!.until(() => bo!.lobby?.gameType === "seafaring-3");
      expect(bo!.lobby!.maxSeats).toBe(3);
      expect(bo!.lobby!.seats.map((s) => s?.username)).toEqual(["Ada", "Cyd", "Bo_b"]);
      expect(bo!.lobby!.map.scenario).toMatchObject({ setup: "fixed" });
      expect(bo!.lobby!.map.id).toMatch(/-3p-fixed$/);

      const dee = await connect("dev:Dee");
      expect(await setType(ada!, "seafaring-4")).toEqual({ ok: true });
      expect((await dee.socket.emitWithAck("lobby:join", { lobbyId })).ok).toBe(true);
      // The new type's map takes four, so the lobby has four seats again (spec 229).
      expect((await dee.socket.emitWithAck("lobby:seat", { lobbyId, seat: 3 })).ok).toBe(true);
      // With four seated, a 3-player type is refused.
      expect(await setType(ada!, "seafaring-3")).toMatchObject({ ok: false, code: "BAD_REQUEST" });
      expect(await setType(ada!, "base")).toEqual({ ok: true });
      await ada!.until(() => ada!.lobby?.gameType === "base");
      expect(ada!.lobby!.map.id).toBe("base-4p");
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
      // The roll-off picks who starts (spec 231): test with someone who isn't placing first.
      const first = spec.state!.view.turn.activePlayer;
      const other = players.find((p) => p.state!.you !== first)!;
      expect(await other.act(gameId, { type: "ROLL" })).toMatchObject({
        ok: false,
        code: "WRONG_DECISION",
      });
      expect(other.state!.legal).toEqual([]);
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

      // Let the auto-roll (spec 231) happen first, so nothing moves while Cyd is away.
      await players[2]!.until(() => players[2]!.state!.view.decisions.at(-1)?.kind !== "ROLL");
      await new Promise((r) => setTimeout(r, 50));
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
      expect(spec.state!.clock).toBeDefined();
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

    it("every game opens with a logged roll-off; untimed games wait during setup (spec 231)", async () => {
      const { gameId, spec } = await setUpGame(0);
      await new Promise((r) => setTimeout(r, 200));
      expect(spec.state!.clock).toBeUndefined();
      const stored = await store.actionsAfter(gameId, 0);
      expect(stored.map((a) => [a.actor, a.action.type])).toEqual([["system", "ROLL_FOR_ORDER"]]);
      const first = stored[0]!.events.find((e) => e.type === "FIRST_PLAYER")!;
      expect(spec.log.at(-1)).toBe(first.text);
      expect(spec.state!.view.turn.activePlayer).toBe(first.data!["player"]);
    });

    it("untimed games still auto-roll, then wait; a declined offer withdraws itself (spec 231)", async () => {
      const { gameId, players, spec } = await setUpGame(0);
      const everyone = [...players, spec];
      await playUntilTurn(gameId, everyone, 1);
      // Nobody rolls: the server does, after 5 (test) seconds.
      await spec.until(() => spec.state!.view.decisions.at(-1)?.kind !== "ROLL", 2000);
      const rolled = (await store.actionsAfter(gameId, 0)).filter((a) => a.action.type === "ROLL");
      expect(rolled.map((a) => a.actor)).toEqual(["system"]);
      // Settle any robber step a 7 brought, by hand, until the main step.
      for (let i = 0; i < 20 && spec.state!.view.decisions.at(-1)?.kind !== "MAIN"; i++) {
        const actor = players.find((c) => (c.state?.legal.length ?? 0) > 0)!;
        const ack = await actor.act(gameId, pick(actor.state!));
        if (ack.ok) await spec.until(() => spec.state!.seq >= ack.seq);
      }
      const seq = spec.state!.seq;
      await new Promise((r) => setTimeout(r, 100));
      expect(spec.state!.seq).toBe(seq); // no turn timer: the turn doesn't end by itself

      const active = players.find((c) => c.state!.you === spec.state!.view.turn.activePlayer)!;
      const offer = active.state!.legal.find((a) => a.type === "OFFER_TRADE");
      if (!offer) return; // nothing in hand to offer: the rest needs cards
      expect((await active.act(gameId, offer)).ok).toBe(true);
      for (const p of players.filter((c) => c !== active)) {
        await p.until(() => p.state!.view.decisions.at(-1)?.kind === "TRADE_OFFER");
        expect((await p.act(gameId, { type: "RESPOND_TRADE", accept: false })).ok).toBe(true);
        // Declining twice is refused (spec 231).
        expect((await p.act(gameId, { type: "RESPOND_TRADE", accept: false })).ok).toBe(false);
      }
      await spec.until(() => spec.state!.view.decisions.at(-1)?.kind === "MAIN", 2000);
      const cancel = (await store.actionsAfter(gameId, 0)).find(
        (a) => a.action.type === "CANCEL_TRADE",
      );
      expect(cancel?.actor).toBe("system");
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
