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
  | "city"
  | "build"
  | "road"
  | "settlement"
  | "turnWarning"
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
  "city",
  "road",
  "settlement",
  "build",
  "devcard",
  "award",
  "gain",
  "chat",
];

const MAX_CUES = 2;

const EVENT_CUE: Record<string, Cue> = {
  ROLLED: "dice",
  BUILT_ROAD: "road",
  PLACED_ROAD: "road",
  BUILT_SETTLEMENT: "settlement",
  PLACED_SETTLEMENT: "settlement",
  BUILT_CITY: "city",
  // Buying a dev card sounds like drawing a resource card.
  BOUGHT_DEV_CARD: "gain",
  // Ship placement shares roads; moving an existing ship keeps its original cue.
  BUILT_SHIP: "road",
  PLACED_SHIP: "road",
  MOVED_SHIP: "build",
  ISLAND_SETTLED: "award",
  REVEALED: "devcard",
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
  const sameSeat = prev.seat === next.seat;
  // The sandbox changes viewer after setup placements. Private log entries and hand
  // counts can differ by viewer, but genuinely public events form a common timeline.
  const publicLog = (log: GameEvent[]) => log.filter((e) => !e.visibleTo && !e.hiddenFrom);
  const fresh = sameSeat
    ? next.log.slice(prev.log.length)
    : publicLog(next.log).slice(publicLog(prev.log).length);
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
  if (sameSeat && newlyAsked(prev, next, "ROLL")) found.add("yourTurn");
  if (sameSeat && newlyAsked(prev, next, "DISCARD")) found.add("discard");
  if (sameSeat && fresh.length > 0 && total(next.hand) > total(prev.hand)) found.add("gain");

  return PRIORITY.filter((c) => found.has(c) && (!opts.hidden || personal.has(c))).slice(
    0,
    MAX_CUES,
  );
}
