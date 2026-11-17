/**
 * Picking cards for an action, before it's sent: discards, trades, Bounty, Monopoly and gold.
 * These limits only shape the controls; the server validates the action that's sent.
 */
/** `trade` covers both a bank trade and an offer to players: you pick first, then choose (spec 232). */
export type PickPurpose = "discard" | "trade" | "bounty" | "monopoly" | "gold";

export interface Pick {
  purpose: PickPurpose;
  /** Cards from your hand. */
  give: Record<string, number>;
  /** Cards from the bank (what you want). */
  want: Record<string, number>;
  /** Most cards you may give in total (the discard amount). */
  giveLimit?: number;
  /** Most cards you may want; with a limit of 1, a new pick replaces the old one. */
  wantLimit?: number;
}

export type Side = "give" | "want";

export function startPick(
  purpose: PickPurpose,
  limits: { giveLimit?: number; wantLimit?: number } = {},
): Pick {
  return { purpose, give: {}, want: {}, ...limits };
}

export const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

/** Add one card. From your hand you can't pick more than you hold. */
export function addPick(p: Pick, side: Side, resource: string, hand: Record<string, number>): Pick {
  const picked = p[side];
  const n = picked[resource] ?? 0;
  if (side === "give") {
    if (n >= (hand[resource] ?? 0)) return p;
    if (p.giveLimit !== undefined && total(picked) >= p.giveLimit) return p;
    return { ...p, give: { ...picked, [resource]: n + 1 } };
  }
  if (p.wantLimit === 1) return { ...p, want: { [resource]: 1 } };
  if (p.wantLimit !== undefined && total(picked) >= p.wantLimit) return p;
  return { ...p, want: { ...picked, [resource]: n + 1 } };
}

/** Put one card back. */
export function removePick(p: Pick, side: Side, resource: string): Pick {
  const { [resource]: n = 0, ...rest } = p[side];
  return { ...p, [side]: n > 1 ? { ...rest, [resource]: n - 1 } : rest };
}

/**
 * The bank trade these picks make, if any: exactly your rate of one resource for one card of
 * another (`ratios` from the snapshot; 4:1 when unknown). The server still checks it.
 */
export function bankTrade(
  give: Record<string, number>,
  want: Record<string, number>,
  ratios: Record<string, number>,
): { give: string; get: string } | null {
  const gives = Object.entries(give).filter(([, n]) => n > 0);
  const wants = Object.entries(want).filter(([, n]) => n > 0);
  if (gives.length !== 1 || wants.length !== 1) return null;
  const [[g, gn]] = gives as [[string, number]];
  const [[w, wn]] = wants as [[string, number]];
  if (wn !== 1 || g === w || gn !== (ratios[g] ?? 4)) return null;
  return { give: g, get: w };
}

/**
 * When picks start over: a new decision for this seat (seat, turn, stack depth and kind). Others
 * answering the same decision (finishing their discard) doesn't change it (bug #1, spec 231).
 */
export function pickResetKey(snap: {
  seat: string;
  view: { turn: { number: number }; decisions: { kind: string }[] };
}): string {
  const { decisions, turn } = snap.view;
  return `${snap.seat}|${turn.number}|${decisions.length}|${decisions.at(-1)?.kind ?? ""}`;
}
