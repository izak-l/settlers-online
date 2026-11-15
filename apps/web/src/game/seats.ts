import type { PlayerId } from "@settlers/engine";
import { ERROR_MESSAGES } from "@settlers/engine";
import { PROTOCOL_ERROR_MESSAGES } from "@settlers/protocol";
import type { Snapshot } from "./LocalGame";

export interface SeatInfo {
  id: PlayerId;
  name: string;
  color: string;
  connected: boolean;
}

/** Original palette; one colour per seat. */
export const SEAT_COLORS = ["#d64545", "#2f6fd6", "#e8a33a", "#3a9e5c", "#8a55c9", "#2aa3a3"];

export function seatsOf(snap: Snapshot): SeatInfo[] {
  return snap.players.map((p, i) => ({ ...p, color: SEAT_COLORS[i % SEAT_COLORS.length]! }));
}

/** Replace seat ids in engine log text with display names. */
export function withNames(text: string, seats: SeatInfo[]): string {
  return text.replace(/\bp\d+\b/g, (id) => seats.find((s) => s.id === id)?.name ?? id);
}

/** UI text for any error code from the engine or the server. */
export function errorText(code: string, message: string): string {
  if (code in ERROR_MESSAGES)
    return `${ERROR_MESSAGES[code as keyof typeof ERROR_MESSAGES]} ${message}`;
  return PROTOCOL_ERROR_MESSAGES[code as keyof typeof PROTOCOL_ERROR_MESSAGES] ?? message;
}
export type BuildMode = "road" | "settlement" | "city" | null;
