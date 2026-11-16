import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RunningServer } from "../server";
import type { Store } from "../store/types";
import { startTestServer, TestClient } from "./harness";

/** Friends, presence and invites over real sockets (feature 001). */
export function socialSuite(name: string, makeStore: () => Promise<Store>) {
  describe(name, () => {
    let store: Store;
    let server: RunningServer;
    const clients: TestClient[] = [];
    const connect = async (token: string) => {
      const c = await TestClient.connect(server.url, token);
      clients.push(c);
      await c.until(() => c.friends !== null);
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

    async function befriend(a: TestClient, b: TestClient) {
      expect(await a.socket.emitWithAck("friends:request", { username: b.me!.username! })).toEqual({
        ok: true,
      });
      await b.until(() => b.friends!.incoming.some((u) => u.userId === a.me!.id));
      expect(
        await b.socket.emitWithAck("friends:respond", { userId: a.me!.id, accept: true }),
      ).toEqual({ ok: true });
      await a.until(() => a.friends!.friends.some((f) => f.userId === b.me!.id));
    }

    it("a request, once accepted, makes both people friends who see each other online", async () => {
      const ada = await connect("dev:Ada");
      const bob = await connect("dev:Bo_b");
      await ada.socket.emitWithAck("friends:request", { username: "bo_b" }); // any case
      await ada.until(() => ada.friends!.outgoing.length === 1);
      await bob.until(() => bob.friends!.incoming.length === 1);
      expect(bob.friends!.incoming).toEqual([{ userId: "dev:ada", username: "Ada" }]);
      expect(bob.friends!.friends).toEqual([]);

      await bob.socket.emitWithAck("friends:respond", { userId: "dev:ada", accept: true });
      await ada.until(() => ada.friends!.friends.length === 1);
      expect(ada.friends).toEqual({
        friends: [{ userId: "dev:bo_b", username: "Bo_b", presence: { state: "online" } }],
        incoming: [],
        outgoing: [],
      });
      await bob.until(() => bob.friends!.friends[0]?.userId === "dev:ada");
    });

    it("crossing requests become a friendship; declining and removing clear the row", async () => {
      const ada = await connect("dev:Ada");
      const bob = await connect("dev:Bo_b");
      await ada.socket.emitWithAck("friends:request", { username: "Bo_b" });
      expect(await bob.socket.emitWithAck("friends:request", { username: "Ada" })).toEqual({
        ok: true,
      });
      await ada.until(() => ada.friends!.friends.length === 1);

      expect(await ada.socket.emitWithAck("friends:remove", { userId: "dev:bo_b" })).toEqual({
        ok: true,
      });
      await bob.until(() => bob.friends!.friends.length === 0);

      await ada.socket.emitWithAck("friends:request", { username: "Bo_b" });
      await bob.until(() => bob.friends!.incoming.length === 1);
      await bob.socket.emitWithAck("friends:respond", { userId: "dev:ada", accept: false });
      await ada.until(() => ada.friends!.outgoing.length === 0);
      expect(bob.friends).toEqual({ friends: [], incoming: [], outgoing: [] });
    });

    it("refuses unknown users, yourself, duplicates and answering requests that don't exist", async () => {
      const ada = await connect("dev:Ada");
      const bob = await connect("dev:Bo_b");
      const req = (c: TestClient, username: string) =>
        c.socket.emitWithAck("friends:request", { username });
      expect(await req(ada, "Nobody")).toMatchObject({ code: "USER_NOT_FOUND" });
      expect(await req(ada, "Ada")).toMatchObject({ code: "BAD_REQUEST" });
      expect(await req(ada, "x!")).toMatchObject({ code: "BAD_REQUEST" });
      await req(ada, "Bo_b");
      expect(await req(ada, "Bo_b")).toMatchObject({ code: "ALREADY_FRIENDS" });
      expect(
        await ada.socket.emitWithAck("friends:respond", { userId: "dev:bo_b", accept: true }),
      ).toMatchObject({ code: "NOT_FOUND" }); // only the addressee answers
      expect(await bob.socket.emitWithAck("friends:remove", { userId: "dev:cyd" })).toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("friends see each other move between home, lobby and offline; others see nothing", async () => {
      const ada = await connect("dev:Ada");
      const bob = await connect("dev:Bo_b");
      const cyd = await connect("dev:Cyd");
      await befriend(ada, bob);

      const created = await bob.socket.emitWithAck("lobby:create", {
        maxSeats: 3,
        allowSpectators: true,
      });
      if (!created.ok) throw new Error(created.code);
      const lobbyId = created.lobby.id;
      await ada.until(() => ada.presence.get("dev:bo_b")?.state === "lobby");
      expect(ada.presence.get("dev:bo_b")).toEqual({ state: "lobby", lobbyId });

      await bob.socket.emitWithAck("lobby:leave", { lobbyId });
      await ada.until(() => ada.presence.get("dev:bo_b")?.state === "online");

      // A second tab doesn't make Bob "offline" when one tab closes.
      const bob2 = await connect("dev:Bo_b");
      bob.close();
      await new Promise((r) => setTimeout(r, 30));
      expect(ada.presence.get("dev:bo_b")?.state).toBe("online");
      bob2.close();
      await ada.until(() => ada.presence.get("dev:bo_b")?.state === "offline");
      expect(cyd.presence.size).toBe(0);
    });

    it("invites go only to online friends, and are withdrawn when the lobby starts", async () => {
      const ada = await connect("dev:Ada");
      const bob = await connect("dev:Bo_b");
      const cyd = await connect("dev:Cyd");
      await befriend(ada, bob);
      await befriend(ada, cyd);
      const dia = await connect("dev:Dia"); // not a friend

      const created = await ada.socket.emitWithAck("lobby:create", {
        maxSeats: 3,
        allowSpectators: false,
      });
      if (!created.ok) throw new Error(created.code);
      const lobbyId = created.lobby.id;
      const invite = (userId: string) =>
        ada.socket.emitWithAck("lobby:invite", { lobbyId, userId });

      expect(await invite("dev:dia")).toMatchObject({ code: "NOT_FRIENDS" });
      expect(await invite("dev:bo_b")).toEqual({ ok: true });
      await bob.until(() => bob.invites.length === 1);
      expect(bob.invites[0]).toEqual({ lobbyId, from: { userId: "dev:ada", username: "Ada" } });
      expect(dia.invites).toEqual([]);

      cyd.close();
      await ada.until(() => ada.presence.get("dev:cyd")?.state === "offline");
      expect(await invite("dev:cyd")).toMatchObject({ code: "FRIEND_OFFLINE" });
      // Someone who isn't in the lobby can't invite to it.
      expect(
        await dia.socket.emitWithAck("lobby:invite", { lobbyId, userId: "dev:ada" }),
      ).toMatchObject({ code: "NOT_FOUND" });

      const cyd2 = await connect("dev:Cyd");
      for (const [i, c] of [bob, cyd2].entries()) {
        await c.socket.emitWithAck("lobby:join", { lobbyId });
        await c.socket.emitWithAck("lobby:seat", { lobbyId, seat: i + 1 });
      }
      for (const c of [ada, bob, cyd2])
        await c.socket.emitWithAck("lobby:ready", { lobbyId, ready: true });
      const started = await ada.socket.emitWithAck("lobby:start", { lobbyId });
      expect(started.ok).toBe(true);
      await bob.until(() => bob.closedInvites.includes(lobbyId));
      expect(await invite("dev:bo_b")).toMatchObject({ code: "LOBBY_STARTED" });

      // Joining the game shows up as "playing" for friends.
      if (!started.ok) return;
      await bob.socket.emitWithAck("game:join", { gameId: started.gameId });
      await ada.until(() => ada.presence.get("dev:bo_b")?.state === "game");
      expect(ada.presence.get("dev:bo_b")).toEqual({
        state: "game",
        gameId: started.gameId,
        playing: true,
      });
    });
  });
}
