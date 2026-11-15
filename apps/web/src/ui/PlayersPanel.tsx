import type { Snapshot } from "../game/LocalGame";
import type { SeatInfo } from "../game/seats";

function cardLabel(n: number): string {
  return n === 1 ? "1 card" : `${n} cards`;
}

export function PlayersPanel({ snap, seats }: { snap: Snapshot; seats: SeatInfo[] }) {
  return (
    <section className="panel">
      <h3>Players</h3>
      <ul className="players">
        {seats.map((s) => (
          <li key={s.id} className={s.id === snap.view.turn.activePlayer ? "current" : ""}>
            <span className="swatch" style={{ background: s.color }} />
            <span className="name">
              {s.name}
              {s.id === snap.seat && <span className="muted"> (you)</span>}
              {!s.connected && <span className="offline-tag">offline</span>}
            </span>
            <span className="muted">{cardLabel(snap.view.zones[`hand-${s.id}`]?.count ?? 0)}</span>
            <span className="vp">{snap.scores[s.id] ?? 0} VP</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
