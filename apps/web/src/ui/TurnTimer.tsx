import { useEffect, useState } from "react";
import type { Snapshot } from "../game/LocalGame";

type Clock = NonNullable<Snapshot["clock"]>;

const URGENT_MS = 10_000;

/** Countdown for the running turn or discard clock. When it hits zero the server moves for you. */
export function TurnTimer({ clock, mine }: { clock: Clock; mine: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const left = Math.max(0, clock.deadline - now);
  const secs = Math.ceil(left / 1000);
  const text = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const urgent = left <= URGENT_MS;
  const label = clock.kind === "short" ? "Discard" : mine ? "Your turn" : "Turn";
  return (
    <div
      className={urgent ? "timer urgent" : "timer"}
      role="timer"
      aria-label={`${label}: ${secs} seconds left`}
      title={mine ? "When time runs out, a default move is made for you." : undefined}
    >
      <span className="timer-label">{label}</span>
      <span className="timer-text">{text}</span>
      <span className="timer-bar" aria-hidden>
        <span style={{ width: `${(left / clock.totalMs) * 100}%` }} />
      </span>
    </div>
  );
}
