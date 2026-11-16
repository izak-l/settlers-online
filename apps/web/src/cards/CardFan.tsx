import { useEffect, useRef, useState } from "react";
import { CardBack } from "./CardFace";

const MAX_DRAWN = 8;
const PULSE_MS = 1200;

/** Face-down cards with a count; pulses "+n" / "−n" when the count changes. */
export function CardFan({
  count,
  kind,
  label,
}: {
  count: number;
  kind: "res" | "dev";
  label: string;
}) {
  const prev = useRef<number | null>(null);
  const [delta, setDelta] = useState(0);
  useEffect(() => {
    const d = prev.current === null ? 0 : count - prev.current;
    prev.current = count;
    setDelta(d);
    if (d === 0) return;
    const t = setTimeout(() => setDelta(0), PULSE_MS);
    return () => clearTimeout(t);
  }, [count]);

  return (
    <span
      className={`back-fan ${kind}${delta ? " pulse" : ""}`}
      role="img"
      aria-label={`${count} ${label}`}
    >
      <span className="backs">
        {Array.from({ length: Math.min(count, MAX_DRAWN) }, (_, i) => (
          <CardBack key={i} kind={kind} />
        ))}
      </span>
      <span className="back-count">{count}</span>
      {delta !== 0 && (
        <span className={delta > 0 ? "delta up" : "delta down"} aria-hidden="true">
          {delta > 0 ? `+${delta}` : `−${-delta}`}
        </span>
      )}
    </span>
  );
}
