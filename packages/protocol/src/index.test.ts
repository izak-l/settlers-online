import { describe, it, expect } from "vitest";
import {
  ActionSchema,
  CreateLobbySchema,
  GameActionSchema,
  PROTOCOL_ERROR_MESSAGES,
  LOBBY_LIMITS,
  SetLobbyMapSchema,
  SetLobbySettingsSchema,
  SetLobbyTypeSchema,
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

  it("takes a game type when creating a lobby, defaulting to the base game (spec 023)", () => {
    const parsed = CreateLobbySchema.parse({ maxSeats: 3, allowSpectators: true });
    expect(parsed.gameType).toBe("base");
    expect(
      CreateLobbySchema.safeParse({ gameType: "seafaring-3", maxSeats: 3, allowSpectators: true })
        .success,
    ).toBe(true);
    expect(
      CreateLobbySchema.safeParse({ gameType: "seafaring-6", maxSeats: 3, allowSpectators: true })
        .success,
    ).toBe(false);
    expect(SetLobbyTypeSchema.safeParse({ lobbyId: "abc", gameType: "seafaring-4" }).success).toBe(
      true,
    );
    expect(SetLobbyTypeSchema.safeParse({ lobbyId: "abc", gameType: "knights" }).success).toBe(
      false,
    );
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

  it("creates a lobby from the game type alone; the rest are lobby settings (spec 229)", () => {
    const parsed = CreateLobbySchema.parse({ gameType: "seafaring-4" });
    expect(parsed).toEqual({ gameType: "seafaring-4", allowSpectators: true, turnSeconds: 0 });
  });

  it("accepts lobby settings within range and rejects the rest (spec 229)", () => {
    const good = {
      lobbyId: "abc",
      maxSeats: 3,
      vpToWin: 12,
      discardLimit: 9,
      turnSeconds: 60,
      allowSpectators: false,
    };
    const ok = (over: object) => SetLobbySettingsSchema.safeParse({ ...good, ...over }).success;
    expect(ok({})).toBe(true);
    const { vpToWin: vp, discardLimit: dl } = LOBBY_LIMITS;
    for (const v of [vp.min, vp.max]) expect(ok({ vpToWin: v })).toBe(true);
    for (const v of [vp.min - 1, vp.max + 1, 10.5]) expect(ok({ vpToWin: v })).toBe(false);
    for (const v of [dl.min, dl.max]) expect(ok({ discardLimit: v })).toBe(true);
    for (const v of [dl.min - 1, dl.max + 1]) expect(ok({ discardLimit: v })).toBe(false);
    expect(ok({ maxSeats: 0 })).toBe(false);
    expect(ok({ maxSeats: 5 })).toBe(false);
    expect(ok({ turnSeconds: 45 })).toBe(false);
    expect(ok({ features: { robber: false } })).toBe(false);
    const { allowSpectators: _, ...missing } = good;
    expect(SetLobbySettingsSchema.safeParse(missing).success).toBe(false);
  });

  it("has a UI message for UNKNOWN_MAP", () => {
    expect(PROTOCOL_ERROR_MESSAGES.UNKNOWN_MAP).toMatch(/map/i);
  });
});
