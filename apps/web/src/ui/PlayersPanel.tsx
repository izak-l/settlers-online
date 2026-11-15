import type { Snapshot } from "../game/LocalGame";
import type { SeatInfo } from "../game/seats";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function PlayersPanel({ snap, seats }: { snap: Snapshot; seats: SeatInfo[] }) {
  const base = snap.view.moduleState["base"] as {
    longestRoad?: string | null;
    largestArmy?: string | null;
  };
  const zoneCount = (id: string) => snap.view.zones[id]?.count ?? 0;
  return (
    <section className="panel">
      <h3>Players</h3>
      <ul className="players">
        {seats.map((s) => {
          const knights = snap.view.zones[`played-${s.id}`]?.contents?.["knight"] ?? 0;
          const devCards = zoneCount(`dev-${s.id}`) + zoneCount(`devnew-${s.id}`);
          return (
            <li key={s.id} className={s.id === snap.view.turn.activePlayer ? "current" : ""}>
              <span className="swatch" style={{ background: s.color }} />
              <span className="name">
                {s.name}
                {s.id === snap.seat && <span className="muted"> (you)</span>}
                {!s.connected && <span className="offline-tag">offline</span>}
                <span className="meta">
                  {plural(zoneCount(`hand-${s.id}`), "card")} · {plural(devCards, "dev card")}
                  {knights > 0 && ` · ${plural(knights, "knight")}`}
                </span>
                {(base.longestRoad === s.id || base.largestArmy === s.id) && (
                  <span className="awards">
                    {base.longestRoad === s.id && <span className="award">Longest Road</span>}
                    {base.largestArmy === s.id && <span className="award">Largest Army</span>}
                  </span>
                )}
              </span>
              <span className="vp">{snap.scores[s.id] ?? 0} VP</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
