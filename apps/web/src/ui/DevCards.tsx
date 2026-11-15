import { useState } from "react";
import { BASE_RESOURCES, DEV_CARD_NAMES, type Action } from "@settlers/engine";
import type { Snapshot } from "../game/LocalGame";
import { ResourcePicker, nonZero, sum } from "./ResourcePicker";

const PLAY: Record<string, string> = {
  knight: "PLAY_KNIGHT",
  roadBuilding: "PLAY_ROAD_BUILDING",
  yearOfPlenty: "PLAY_YEAR_OF_PLENTY",
  monopoly: "PLAY_MONOPOLY",
};

const BLURB: Record<string, string> = {
  knight: "Move the robber and rob a neighbour.",
  roadBuilding: "Build two roads for free.",
  yearOfPlenty: "Take any two resources from the bank.",
  monopoly: "Name a resource; everyone gives you all of theirs.",
  victoryPoint: "Worth 1 VP. Kept secret until the game ends.",
};

/** Your development cards, with play buttons enabled only when the server says you can. */
export function DevCards({ snap, send }: { snap: Snapshot; send(a: Action): void }) {
  const [choosing, setChoosing] = useState<"yearOfPlenty" | "monopoly" | null>(null);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const held = snap.view.zones[`dev-${snap.seat}`]?.contents ?? {};
  const fresh = snap.view.zones[`devnew-${snap.seat}`]?.contents ?? {};
  const cards = Object.keys(DEV_CARD_NAMES).filter((c) => (held[c] ?? 0) + (fresh[c] ?? 0) > 0);
  const canPlay = (card: string) => snap.legal.some((a) => a.type === PLAY[card]);

  if (cards.length === 0) return null;

  return (
    <section className="panel">
      <h3>Development cards</h3>
      <ul className="devcards">
        {cards.map((c) => (
          <li key={c}>
            <div>
              <strong>
                {DEV_CARD_NAMES[c]} × {(held[c] ?? 0) + (fresh[c] ?? 0)}
              </strong>
              {(fresh[c] ?? 0) > 0 && (
                <span className="muted"> ({fresh[c]} new: playable next turn)</span>
              )}
              <p className="muted small">{BLURB[c]}</p>
            </div>
            {PLAY[c] && (
              <button
                disabled={!canPlay(c)}
                onClick={() => {
                  if (c === "yearOfPlenty" || c === "monopoly") {
                    setChoosing(c);
                    setPicks({});
                  } else send({ type: PLAY[c] } as Action);
                }}
              >
                Play
              </button>
            )}
          </li>
        ))}
      </ul>

      {choosing === "yearOfPlenty" && (
        <div className="stack">
          <p className="prompt">Pick two resources from the bank.</p>
          <ResourcePicker value={picks} onChange={setPicks} limit={2} label="Bounty picks" />
          <div className="row">
            <button
              className="primary"
              disabled={sum(picks) !== 2}
              onClick={() => {
                send({ type: "PLAY_YEAR_OF_PLENTY", resources: nonZero(picks) });
                setChoosing(null);
              }}
            >
              Take them
            </button>
            <button className="link" onClick={() => setChoosing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {choosing === "monopoly" && (
        <div className="stack">
          <p className="prompt">Which resource?</p>
          <div className="row wrap">
            {BASE_RESOURCES.map((r) => (
              <button
                key={r}
                className={`chip-button res-${r}`}
                onClick={() => {
                  send({ type: "PLAY_MONOPOLY", resource: r });
                  setChoosing(null);
                }}
              >
                {r}
              </button>
            ))}
            <button className="link" onClick={() => setChoosing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
