import type { Snapshot } from "../game/LocalGame";
import { withNames, type SeatInfo } from "../game/store";

export function GameLog({ snap, seats }: { snap: Snapshot; seats: SeatInfo[] }) {
  const recent = snap.log.slice(-40).reverse();
  return (
    <section className="panel log">
      <h3>Log</h3>
      <ol>
        {recent.map((e, i) => (
          <li key={snap.log.length - i}>{withNames(e.text, seats)}</li>
        ))}
      </ol>
    </section>
  );
}
