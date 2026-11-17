import { describe, expect, it } from "vitest";
import {
  atDefaults,
  clampTo,
  seatChoices,
  settingsSummary,
  withDefaults,
  type LobbySettingsValue,
} from "./lobbySettingsModel";

const value: LobbySettingsValue = {
  maxSeats: 3,
  vpToWin: 12,
  discardLimit: 9,
  turnSeconds: 60,
  allowSpectators: true,
};
const defaults = { maxSeats: 4, vpToWin: 10, discardLimit: 7 };

describe("lobby settings (spec 229)", () => {
  it("offers 1 up to the cap, disabling counts below the seated players", () => {
    expect(seatChoices(3, 2)).toEqual([
      { n: 1, disabled: true },
      { n: 2, disabled: false },
      { n: 3, disabled: false },
    ]);
  });

  it("keeps steppers within range", () => {
    expect(clampTo({ min: 3, max: 25 }, 2)).toBe(3);
    expect(clampTo({ min: 3, max: 25 }, 26)).toBe(25);
    expect(clampTo({ min: 3, max: 25 }, 11)).toBe(11);
  });

  it("resets players, points and discard limit to the map's defaults, keeping the rest", () => {
    const reset = withDefaults(value, defaults);
    expect(reset).toEqual({ ...value, maxSeats: 4, vpToWin: 10, discardLimit: 7 });
    expect(atDefaults(reset, defaults)).toBe(true);
    expect(atDefaults(value, defaults)).toBe(false);
  });

  it("sums the settings up in one line", () => {
    expect(settingsSummary(value)).toBe(
      "3 players · 12 VP to win · discard above 9 cards · 60 s per turn",
    );
    expect(settingsSummary({ ...value, maxSeats: 1, turnSeconds: 0 })).toMatch(
      /^1 player · .* · no turn timer$/,
    );
  });
});
