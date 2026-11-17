import { routeAwardNameFor } from "@settlers/engine";
import { Icon } from "../art/icons";
import { CardFan } from "../cards/CardFan";
import type { Snapshot } from "../game/LocalGame";
import type { SeatInfo } from "../game/seats";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function PlayersPanel({ snap, seats }: { snap: Snapshot; seats: SeatInfo[] }) {
  const base = snap.view.moduleState["base"] as {
    longestRoad?: string | null;
    largestArmy?: string | null;
  };
  const zoneCount = (id: string) => snap.view.zones[id]?.count ?? 0;
  const lost = snap.view.moduleState["sf-lost-settlers"] as
    { held?: Record<string, string[]> } | undefined;
  return (
    <section className="panel">
      <h3>Players</h3>
      <ul className="players">
        {seats.map((s) => {
          const knights = snap.view.zones[`played-${s.id}`]?.contents?.["knight"] ?? 0;
          const devCards = zoneCount(`dev-${s.id}`) + zoneCount(`devnew-${s.id}`);
          // Lost Settlers (spec 018): VP tokens found, harbors picked up and not yet placed.
          const vpTokens = snap.view.zones[`vp-${s.id}`]?.contents?.["vpToken"] ?? 0;
          const harbors = lost?.held?.[s.id]?.length ?? 0;
          // Weavers' Isles (spec 019): cloth woven by the villages they trade with.
          const clothZone = snap.view.zones[`cloth-${s.id}`]?.contents;
          return (
            <li
              key={s.id}
              data-seat={s.id}
              className={s.id === snap.view.turn.activePlayer ? "current" : ""}
              style={{ "--seat": s.color } as React.CSSProperties}
            >
              <span className="swatch" style={{ background: s.color }} />
              <span className="name">
                {s.name}
                {s.id === snap.seat && <span className="muted"> (you)</span>}
                {!s.connected && <span className="offline-tag">offline</span>}
                <span className="meta">
                  <CardFan count={zoneCount(`hand-${s.id}`)} kind="res" label="resource cards" />
                  {devCards > 0 && (
                    <CardFan count={devCards} kind="dev" label="development cards" />
                  )}
                  {knights > 0 && <span>{plural(knights, "knight")}</span>}
                  {vpTokens > 0 && <span>{plural(vpTokens, "VP token")}</span>}
                  {clothZone && <span>{clothZone["cloth"] ?? 0} cloth</span>}
                  {harbors > 0 && <span>{plural(harbors, "harbor")} to place</span>}
                </span>
                {(base.longestRoad === s.id || base.largestArmy === s.id) && (
                  <span className="awards">
                    {base.longestRoad === s.id && (
                      <span className="award">
                        <Icon name="roadBuilding" size={12} />{" "}
                        {routeAwardNameFor(snap.view.modules)}
                      </span>
                    )}
                    {base.largestArmy === s.id && (
                      <span className="award">
                        <Icon name="knight" size={12} /> Largest Army
                      </span>
                    )}
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
