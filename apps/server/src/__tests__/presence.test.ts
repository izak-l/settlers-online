import { describe, expect, it } from "vitest";
import { PresenceTracker } from "../presence";

describe("PresenceTracker", () => {
  it("reports the busiest place across a user's tabs, and only real changes", () => {
    const p = new PresenceTracker();
    expect(p.connect("s1", "u")).toEqual({ state: "online" });
    expect(p.connect("s2", "u")).toBeNull(); // second tab, still just online
    expect(p.move("s1", { kind: "lobby", lobbyId: "L" })).toEqual({ state: "lobby", lobbyId: "L" });
    expect(p.move("s2", { kind: "game", gameId: "G", playing: false })).toEqual({
      state: "game",
      gameId: "G",
      playing: false,
    });
    // Leaving a place you're no longer at does nothing.
    expect(p.leave("s1", (pl) => pl.kind === "game")).toBeNull();
    expect(p.disconnect("s2")).toEqual({ state: "lobby", lobbyId: "L" });
    expect(p.disconnect("s1")).toEqual({ state: "offline" });
    expect(p.isOnline("u")).toBe(false);
  });
});
