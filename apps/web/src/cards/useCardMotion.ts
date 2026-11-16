import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../game/LocalGame";
import { handDiff, partnerFromEvents, type CardMove, type HandCounts } from "./handDiff";

const MOTION_MS = 900;

function countsOf(snap: Snapshot): HandCounts {
  const others: Record<string, number> = {};
  for (const p of snap.players)
    if (p.id !== snap.seat) others[p.id] = snap.view.zones[`hand-${p.id}`]?.count ?? 0;
  return { mine: { ...(snap.view.zones[`hand-${snap.seat}`]?.contents ?? {}) }, others };
}

/**
 * Cards that just moved into or out of your hand, for the fly-in / fly-out animation. Comes only
 * from comparing snapshots; nothing moves on the first snapshot, or when the seat changes (the dev
 * sandbox switches seats in one tab).
 */
export function useCardMotion(snap: Snapshot): CardMove[] {
  const prev = useRef<{ seat: string; counts: HandCounts; logLength: number } | null>(null);
  const [moves, setMoves] = useState<CardMove[]>([]);
  const counts = countsOf(snap);
  const key = JSON.stringify(counts) + snap.seat;

  useEffect(() => {
    const before = prev.current?.seat === snap.seat ? prev.current : null;
    const fresh = snap.log.slice(before?.logLength ?? snap.log.length);
    prev.current = { seat: snap.seat, counts, logLength: snap.log.length };
    const found = handDiff(before?.counts ?? null, counts, partnerFromEvents(fresh, snap.seat));
    setMoves(found);
    if (found.length === 0) return;
    const t = setTimeout(() => setMoves([]), MOTION_MS);
    return () => clearTimeout(t);
    // `key` captures every change to the counts (the objects are new on every snapshot).
  }, [key]);
  return moves;
}
