import type { Ack, Presence, FriendsState } from "@settlers/protocol";
import { fail } from "./errors";
import type { KeyedQueue } from "./queue";
import type { FriendshipRecord, Store } from "./store/types";

/** Changes to one pair of users run one at a time, so crossing requests can't race. */
const pairKey = (a: string, b: string) => `friends:${[a, b].sort().join("|")}`;

const other = (f: FriendshipRecord, me: string) =>
  f.requesterId === me ? f.addresseeId : f.requesterId;

/** Friend requests and friendships. Mutual: a request becomes a friendship only when accepted. */
export class FriendService {
  constructor(
    private store: Store,
    private queue: KeyedQueue,
  ) {}

  /** Ask `username` to be friends; if they already asked you, this accepts. Returns their id. */
  request(me: string, username: string): Promise<Ack<{ userId: string }>> {
    return this.store.findProfileByUsername(username).then((target) => {
      if (!target) return fail("USER_NOT_FOUND");
      if (target.id === me) return fail("BAD_REQUEST", "You can't add yourself.");
      return this.queue.run(pairKey(me, target.id), async () => {
        const existing = await this.between(me, target.id);
        if (existing?.status === "accepted" || existing?.requesterId === me)
          return fail("ALREADY_FRIENDS");
        await this.store.saveFriendship(
          existing
            ? { ...existing, status: "accepted" } // they asked first
            : { requesterId: me, addresseeId: target.id, status: "pending" },
        );
        return { ok: true, userId: target.id };
      });
    });
  }

  /** Accept or decline a request someone sent you. */
  respond(me: string, from: string, accept: boolean): Promise<Ack> {
    return this.queue.run(pairKey(me, from), async () => {
      const existing = await this.between(me, from);
      if (existing?.status !== "pending" || existing.addresseeId !== me) return fail("NOT_FOUND");
      if (accept) await this.store.saveFriendship({ ...existing, status: "accepted" });
      else await this.store.deleteFriendship(me, from);
      return { ok: true };
    });
  }

  /** Remove a friend, or withdraw or decline a request. */
  remove(me: string, otherId: string): Promise<Ack> {
    return this.queue.run(pairKey(me, otherId), async () => {
      if (!(await this.between(me, otherId))) return fail("NOT_FOUND");
      await this.store.deleteFriendship(me, otherId);
      return { ok: true };
    });
  }

  async friendIds(me: string): Promise<string[]> {
    return (await this.store.listFriendships(me))
      .filter((f) => f.status === "accepted")
      .map((f) => other(f, me));
  }

  async areFriends(a: string, b: string): Promise<boolean> {
    return (await this.between(a, b))?.status === "accepted";
  }

  /** The full list for `me`, with each friend's presence; sorted by name. */
  async stateFor(me: string, presenceOf: (userId: string) => Presence): Promise<FriendsState> {
    const rows = await this.store.listFriendships(me);
    const profiles = await this.store.getProfiles(rows.map((f) => other(f, me)));
    const name = new Map(profiles.map((p) => [p.id, p.username ?? "?"]));
    const summary = (f: FriendshipRecord) => {
      const userId = other(f, me);
      return { userId, username: name.get(userId) ?? "?" };
    };
    const byName = (a: { username: string }, b: { username: string }) =>
      a.username.localeCompare(b.username);
    return {
      friends: rows
        .filter((f) => f.status === "accepted")
        .map((f) => ({ ...summary(f), presence: presenceOf(other(f, me)) }))
        .sort(byName),
      incoming: rows
        .filter((f) => f.status === "pending" && f.addresseeId === me)
        .map(summary)
        .sort(byName),
      outgoing: rows
        .filter((f) => f.status === "pending" && f.requesterId === me)
        .map(summary)
        .sort(byName),
    };
  }

  private async between(a: string, b: string): Promise<FriendshipRecord | undefined> {
    return (await this.store.listFriendships(a)).find((f) => other(f, a) === b);
  }
}
