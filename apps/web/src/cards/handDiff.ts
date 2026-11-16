import { BASE_RESOURCES, type GameEvent } from "@settlers/engine";

/** What one viewer can count: their own hand by resource, and everyone else's card total. */
export interface HandCounts {
  mine: Record<string, number>;
  others: Record<string, number>;
}

/** Cards that moved into or out of your hand, and where they came from or went to. */
export interface CardMove {
  resource: string;
  n: number;
  dir: "in" | "out";
  /** A seat, or the bank (production, building, discards, bank trades, Bounty). */
  from: string;
}

/** The other player in a trade or steal you took part in, from that change's events. */
export function partnerFromEvents(events: GameEvent[], me: string): string | undefined {
  let partner: string | undefined;
  for (const e of events) {
    const d = e.data ?? {};
    const pair =
      e.type === "TRADED"
        ? [d["from"], d["with"]]
        : e.type === "STOLE"
          ? [d["thief"], d["victim"]]
          : [];
    if (pair[0] === me) partner = pair[1] as string;
    else if (pair[1] === me) partner = pair[0] as string;
  }
  return partner;
}

/**
 * Compare two snapshots of hand counts. With a known partner (a trade or steal), every move is
 * with them. Otherwise gains come from players whose totals dropped (Monopoly) and losses go to
 * players whose totals rose (someone's Monopoly), and the rest is the bank.
 */
export function handDiff(prev: HandCounts | null, next: HandCounts, partner?: string): CardMove[] {
  if (!prev) return [];
  const pool = (sign: 1 | -1) =>
    Object.keys(next.others)
      .map((seat) => ({ seat, left: sign * ((next.others[seat] ?? 0) - (prev.others[seat] ?? 0)) }))
      .filter((p) => p.left > 0);
  const droppers = pool(-1);
  const risers = pool(1);

  const known: readonly string[] = BASE_RESOURCES;
  const keys = [
    ...known,
    ...new Set(
      [...Object.keys(prev.mine), ...Object.keys(next.mine)].filter((r) => !known.includes(r)),
    ),
  ];
  const moves: CardMove[] = [];
  for (const resource of keys) {
    const d = (next.mine[resource] ?? 0) - (prev.mine[resource] ?? 0);
    if (d === 0) continue;
    const dir = d > 0 ? "in" : "out";
    let left = Math.abs(d);
    if (partner) {
      moves.push({ resource, n: left, dir, from: partner });
      continue;
    }
    for (const p of dir === "in" ? droppers : risers) {
      const n = Math.min(left, p.left);
      if (n === 0) continue;
      moves.push({ resource, n, dir, from: p.seat });
      p.left -= n;
      left -= n;
    }
    if (left > 0) moves.push({ resource, n: left, dir, from: "bank" });
  }
  return moves;
}
