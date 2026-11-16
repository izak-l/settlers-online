import { useEffect, useRef, useState } from "react";
import { BASE_RESOURCES } from "@settlers/engine";
import type { Snapshot } from "../game/LocalGame";

const GAIN_MS = 1500;

/** Resources that just went up, and by how much; cleared after a moment. */
function useGains(hand: Record<string, number>): Record<string, number> {
  const before = useRef<Record<string, number> | null>(null);
  const [gains, setGains] = useState<Record<string, number>>({});
  const key = BASE_RESOURCES.map((r) => hand[r] ?? 0).join(",");
  useEffect(() => {
    const prev = before.current;
    before.current = { ...hand };
    const up: Record<string, number> = {};
    for (const r of BASE_RESOURCES) {
      const d = (hand[r] ?? 0) - (prev?.[r] ?? 0);
      if (prev && d > 0) up[r] = d;
    }
    setGains(up);
    if (Object.keys(up).length === 0) return;
    const t = setTimeout(() => setGains({}), GAIN_MS);
    return () => clearTimeout(t);
    // `key` captures every change to the hand (the object itself is new on every snapshot).
  }, [key]);
  return gains;
}

export function HandPanel({ snap }: { snap: Snapshot }) {
  const hand = snap.view.zones[`hand-${snap.seat}`]?.contents ?? {};
  const gains = useGains(hand);
  return (
    <section className="panel hand-panel">
      <h3>Your hand</h3>
      <ul className="hand">
        {BASE_RESOURCES.map((r) => (
          <li key={r} className={gains[r] ? `res res-${r} gained` : `res res-${r}`}>
            <span className="res-count">{hand[r] ?? 0}</span>
            {gains[r] ? (
              <span className="gain" aria-label={`gained ${gains[r]} ${r}`}>
                +{gains[r]}
              </span>
            ) : null}
            <span className="res-name">{r}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
