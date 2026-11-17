import { describe, it, expect } from "vitest";
import {
  ActionSchema,
  CreateLobbySchema,
  GameActionSchema,
  PROTOCOL_ERROR_MESSAGES,
  SetLobbyFeaturesSchema,
  SetLobbyMapSchema,
  UsernameSchema,
} from "./index";

describe("protocol schemas", () => {
  it("accepts every engine action shape", () => {
    for (const a of [
      { type: "PLACE_SETTLEMENT", vertex: "0,0|1,-1|1,0" },
      { type: "PLACE_ROAD", edge: "0,0|1,0" },
      { type: "ROLL" },
      { type: "BUILD_ROAD", edge: "0,0|1,0" },
      { type: "BUILD_SETTLEMENT", vertex: "0,0|1,-1|1,0" },
      { type: "BUILD_CITY", vertex: "0,0|1,-1|1,0" },
      { type: "END_TURN" },
    ]) {
      expect(ActionSchema.safeParse(a).success, a.type).toBe(true);
    }
  });

  it("rejects unknown actions and missing fields", () => {
    expect(ActionSchema.safeParse({ type: "STEAL_EVERYTHING" }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: "BUILD_ROAD" }).success).toBe(false);
    expect(GameActionSchema.safeParse({ gameId: "", action: { type: "ROLL" } }).success).toBe(
      false,
    );
  });

  it("validates usernames", () => {
    expect(UsernameSchema.safeParse("ada_99").success).toBe(true);
    expect(UsernameSchema.safeParse("ab").success).toBe(false);
    expect(UsernameSchema.safeParse("no spaces").success).toBe(false);
  });

  it("allows 1 to 4 seats", () => {
    for (const maxSeats of [1, 2, 3, 4])
      expect(CreateLobbySchema.safeParse({ maxSeats, allowSpectators: true }).success).toBe(true);
    for (const maxSeats of [0, 5, 6])
      expect(CreateLobbySchema.safeParse({ maxSeats, allowSpectators: true }).success).toBe(false);
  });

  it("accepts a built-in map choice for a lobby", () => {
    expect(
      SetLobbyMapSchema.safeParse({ lobbyId: "abc", map: { builtin: "grand-diamond" } }).success,
    ).toBe(true);
    // Unknown ids parse; the server decides whether they exist.
    expect(SetLobbyMapSchema.safeParse({ lobbyId: "abc", map: { builtin: "nope" } }).success).toBe(
      true,
    );
  });

  it("accepts a scenario choice with a setup mode", () => {
    const ok = (map: unknown) => SetLobbyMapSchema.safeParse({ lobbyId: "abc", map }).success;
    expect(ok({ scenario: "new-horizons", setup: "fixed" })).toBe(true);
    expect(ok({ scenario: "new-horizons", setup: "variable" })).toBe(true);
    expect(ok({ scenario: "new-horizons" })).toBe(false);
    expect(ok({ scenario: "new-horizons", setup: "random" })).toBe(false);
    expect(ok({ builtin: "base-4p", setup: "fixed" })).toBe(false);
  });

  it("accepts the new seafaring actions", () => {
    for (const a of [
      { type: "BUILD_SHIP", edge: "0,0|1,0" },
      { type: "PLACE_SHIP", edge: "0,0|1,0" },
      { type: "PLACE_FREE_SHIP", edge: "0,0|1,0" },
      { type: "MOVE_SHIP", from: "0,0|1,0", to: "1,0|2,0" },
      { type: "MOVE_PIRATE", hex: "3,0" },
      { type: "MOVE_PIRATE", hex: null },
      { type: "CHOOSE_GOLD", resources: { ore: 1 } },
      { type: "PLACE_HARBOR", edge: "2,-1|2,0" },
    ]) {
      expect(ActionSchema.safeParse(a).success, a.type).toBe(true);
    }
    expect(ActionSchema.safeParse({ type: "MOVE_SHIP", from: "0,0|1,0" }).success).toBe(false);
  });

  it("rejects malformed map choices", () => {
    for (const map of [{}, { builtin: "" }, { builtin: "x".repeat(65) }, "base-4p", null]) {
      expect(SetLobbyMapSchema.safeParse({ lobbyId: "abc", map }).success).toBe(false);
    }
  });

  it("accepts house rules and rejects unknown switches", () => {
    const ok = (features: unknown) =>
      SetLobbyFeaturesSchema.safeParse({ lobbyId: "abc", features }).success;
    expect(ok({})).toBe(true);
    expect(ok({ devCards: false, robber: true, ports: false })).toBe(true);
    expect(ok({ flying: true })).toBe(false);
    expect(ok({ devCards: "no" })).toBe(false);
    expect(ok(null)).toBe(false);
  });

  it("has a UI message for UNKNOWN_MAP", () => {
    expect(PROTOCOL_ERROR_MESSAGES.UNKNOWN_MAP).toMatch(/map/i);
  });
});
