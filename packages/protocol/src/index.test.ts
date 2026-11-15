import { describe, it, expect } from "vitest";
import { ActionSchema, CreateLobbySchema, GameActionSchema, UsernameSchema } from "./index";

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

  it("only allows 3 or 4 seats for now", () => {
    expect(CreateLobbySchema.safeParse({ maxSeats: 4, allowSpectators: true }).success).toBe(true);
    expect(CreateLobbySchema.safeParse({ maxSeats: 6, allowSpectators: true }).success).toBe(false);
  });
});
