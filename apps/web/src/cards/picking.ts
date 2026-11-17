/**
 * Picking cards for an action, before it's sent: discards, trades, Bounty, Monopoly and gold.
 * These limits only shape the controls; the server validates the action that's sent.
 */
export type PickPurpose = "discard" | "bank" | "offer" | "bounty" | "monopoly" | "gold";

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

/** Bank and port trades: picking a resource takes your rate's worth of it, if you have that many. */
export function bankGive(
  p: Pick,
  resource: string,
  rate: number,
  hand: Record<string, number>,
): Pick {
  if ((hand[resource] ?? 0) < rate) return p;
  return { ...p, give: { [resource]: rate } };
}
