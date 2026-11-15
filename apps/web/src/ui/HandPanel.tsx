import { BASE_RESOURCES } from "@settlers/engine";
import type { Snapshot } from "../game/LocalGame";

export function HandPanel({ snap }: { snap: Snapshot }) {
  const hand = snap.view.zones[`hand-${snap.seat}`]?.contents ?? {};
  return (
    <section className="panel">
      <h3>Your hand</h3>
      <ul className="hand">
        {BASE_RESOURCES.map((r) => (
          <li key={r} className={`res res-${r}`}>
            <span className="res-count">{hand[r] ?? 0}</span>
            <span className="res-name">{r}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
