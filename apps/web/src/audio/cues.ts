import type { GameEvent } from "@settlers/engine";

/**
 * Which sounds a change should play. Pure: it compares two snapshots (the new events, the top
 * decision and your hand) and never asks the server. Highest priority first; at most two per
 * change, so a busy moment doesn't become noise.
 */
export type Cue =
  | "win"
  | "yourTurn"
  | "discard"
  | "steal"
  | "offer"
  | "respond"
  | "dice"
  | "robber"
  | "city"
  | "build"
  | "devcard"
  | "award"
  | "gain"
  | "chat";

const PRIORITY: Cue[] = [
  "win",
  "yourTurn",
  "discard",
  "steal",
  "offer",
  "respond",
  "dice",
  "robber",
  "city",
  "build",
  "devcard",
  "award",
  "gain",
  "chat",
];

const MAX_CUES = 2;

const EVENT_CUE: Record<string, Cue> = {
  ROLLED: "dice",
  BUILT_ROAD: "build",
  PLACED_ROAD: "build",
  BUILT_SETTLEMENT: "build",
  PLACED_SETTLEMENT: "build",
  BUILT_CITY: "city",
  BOUGHT_DEV_CARD: "devcard",
  MOVED_ROBBER: "robber",
  // Seafaring: ships sound like building, the pirate like the robber, a new island like an award.
  BUILT_SHIP: "build",
  PLACED_SHIP: "build",
  MOVED_SHIP: "build",
  MOVED_PIRATE: "robber",
  ISLAND_SETTLED: "award",
  AWARD: "award",
  GAME_WON: "win",
};

/** The slice of a snapshot that cues depend on. */
export interface CueInput {
  seat: string;
  log: GameEvent[];
  top: { kind: string; pendingFrom: string[]; data?: Record<string, unknown> } | undefined;
  /** Your hand (empty for spectators). */
  hand: Record<string, number>;
}

const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

/** You're asked to act on this decision now, and weren't before. */
function newlyAsked(prev: CueInput, next: CueInput, kind: string): boolean {
  const asked = (s: CueInput) => s.top?.kind === kind && s.top.pendingFrom.includes(s.seat);
  return asked(next) && !asked(prev);
}

export function cuesFor(prev: CueInput | null, next: CueInput, opts: { hidden: boolean }): Cue[] {
  if (!prev) return [];
  const me = next.seat;
  const fresh = next.log.slice(prev.log.length);
  // Cues that are about you, and so still play when the tab is hidden.
  const personal = new Set<Cue>(["win", "yourTurn", "discard"]);
  const found = new Set<Cue>();

  for (const e of fresh) {
    const cue = EVENT_CUE[e.type];
    if (cue) found.add(cue);
    if (e.type === "STOLE") {
      found.add("steal");
      if (e.data?.["thief"] === me || e.data?.["victim"] === me) personal.add("steal");
    }
    if (e.type === "OFFERED_TRADE") {
      found.add("offer");
      // Everyone but the offerer is asked to answer.
      if (next.top?.kind === "TRADE_OFFER" && next.top.data?.["from"] !== me && me !== "spectator")
        personal.add("offer");
    }
    // Answers to your own offer.
    if (e.type === "RESPONDED_TRADE" && prev.top?.data?.["from"] === me) {
      found.add("respond");
      personal.add("respond");
    }
  }
  if (newlyAsked(prev, next, "ROLL")) found.add("yourTurn");
  if (newlyAsked(prev, next, "DISCARD")) found.add("discard");
  if (fresh.length > 0 && total(next.hand) > total(prev.hand)) found.add("gain");

  return PRIORITY.filter((c) => found.has(c) && (!opts.hidden || personal.has(c))).slice(
    0,
    MAX_CUES,
  );
}
