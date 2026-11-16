import type { Presence as PresenceStatus } from "@settlers/protocol";

/** Where one socket is right now. */
export type Place =
  | { kind: "home" }
  | { kind: "lobby"; lobbyId: string }
  | { kind: "game"; gameId: string; playing: boolean };

/** Higher wins when a user has several tabs open. */
function rank(p: Place): number {
  if (p.kind === "game") return p.playing ? 3 : 2;
  return p.kind === "lobby" ? 1 : 0;
}

function toStatus(p: Place | undefined): PresenceStatus {
  if (!p) return { state: "offline" };
  if (p.kind === "home") return { state: "online" };
  if (p.kind === "lobby") return { state: "lobby", lobbyId: p.lobbyId };
  return { state: "game", gameId: p.gameId, playing: p.playing };
}

const same = (a: PresenceStatus, b: PresenceStatus) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Who is online and where, from their open sockets. Each method returns the user's new status
 * when it changed (so the caller can tell their friends), or null when it didn't.
 */
export class PresenceTracker {
  private sockets = new Map<string, { userId: string; place: Place }>();

  isOnline(userId: string): boolean {
    for (const s of this.sockets.values()) if (s.userId === userId) return true;
    return false;
  }

  status(userId: string): PresenceStatus {
    let best: Place | undefined;
    for (const s of this.sockets.values()) {
      if (s.userId === userId && (!best || rank(s.place) > rank(best))) best = s.place;
    }
    return toStatus(best);
  }

  connect(socketId: string, userId: string): PresenceStatus | null {
    return this.change(userId, () =>
      this.sockets.set(socketId, { userId, place: { kind: "home" } }),
    );
  }

  move(socketId: string, place: Place): PresenceStatus | null {
    const s = this.sockets.get(socketId);
    if (!s) return null;
    return this.change(s.userId, () => (s.place = place));
  }

  /** Back home, but only if the socket is still at `from` (it may have moved on already). */
  leave(socketId: string, from: (p: Place) => boolean): PresenceStatus | null {
    const s = this.sockets.get(socketId);
    if (!s || !from(s.place)) return null;
    return this.move(socketId, { kind: "home" });
  }

  disconnect(socketId: string): PresenceStatus | null {
    const s = this.sockets.get(socketId);
    if (!s) return null;
    return this.change(s.userId, () => this.sockets.delete(socketId));
  }

  private change(userId: string, work: () => void): PresenceStatus | null {
    const before = this.status(userId);
    work();
    const after = this.status(userId);
    return same(before, after) ? null : after;
  }
}
