import { findGameType, mapDefaults, type MapDefaults } from "@settlers/maps";
import { LOBBY_LIMITS, type LobbyState, type SetLobbySettings } from "@settlers/protocol";

/** What the host edits in the lobby (spec 229), without the lobby id. */
export type LobbySettingsValue = Omit<SetLobbySettings, "lobbyId">;

export function settingsOf(lobby: LobbyState): LobbySettingsValue {
  return {
    maxSeats: lobby.maxSeats,
    vpToWin: lobby.vpToWin,
    discardLimit: lobby.discardLimit,
    turnSeconds: lobby.turnSeconds as LobbySettingsValue["turnSeconds"],
    allowSpectators: lobby.allowSpectators,
  };
}

/** The lobby map's defaults in its game type: the most seats it takes, its points and limit. */
export function lobbyDefaults(lobby: LobbyState): MapDefaults | undefined {
  const type = findGameType(lobby.gameType);
  return type ? mapDefaults(type, lobby.map.def) : undefined;
}

/** The player counts the host can pick: 1 up to the cap; fewer than are seated is disabled. */
export function seatChoices(cap: number, seated: number): { n: number; disabled: boolean }[] {
  return Array.from({ length: cap }, (_, i) => ({ n: i + 1, disabled: i + 1 < seated }));
}

export const clampTo = (range: { min: number; max: number }, n: number) =>
  Math.min(range.max, Math.max(range.min, n));

/** The settings with players, points and discard limit back at the map's defaults. */
export function withDefaults(value: LobbySettingsValue, d: MapDefaults): LobbySettingsValue {
  return { ...value, maxSeats: d.maxSeats, vpToWin: d.vpToWin, discardLimit: d.discardLimit };
}

export function atDefaults(value: LobbySettingsValue, d: MapDefaults): boolean {
  return (
    value.maxSeats === d.maxSeats &&
    value.vpToWin === d.vpToWin &&
    value.discardLimit === d.discardLimit
  );
}

export function timerText(turnSeconds: number): string {
  return turnSeconds > 0 ? `${turnSeconds} s per turn` : "No turn timer";
}

/** One line for the summary card: "3 players · 12 VP to win · discard above 9 cards". */
export function settingsSummary(value: LobbySettingsValue): string {
  const p = value.maxSeats;
  return [
    `${p} player${p === 1 ? "" : "s"}`,
    `${value.vpToWin} VP to win`,
    `discard above ${value.discardLimit} cards`,
    timerText(value.turnSeconds).toLowerCase(),
  ].join(" · ");
}

export { LOBBY_LIMITS };
