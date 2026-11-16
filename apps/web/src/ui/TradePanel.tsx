import { BASE_RESOURCES } from "@settlers/engine";
import { resourceName } from "../cards/CardFace";
import { startPick, type Pick } from "../cards/picking";
import type { Snapshot } from "../game/LocalGame";

interface Props {
  snap: Snapshot;
  pick: Pick | null;
  setPick(p: Pick | null): void;
}

/** In your main step: start a bank trade or an offer. The cards are picked in your hand. */
export function TradePanel({ snap, pick, setPick }: Props) {
  const top = snap.view.decisions.at(-1);
  // Only on your own main step (the step allowing offers isn't enough: it's someone's turn).
  const canOffer =
    !!top?.allowed.includes("OFFER_TRADE") &&
    snap.seat !== "spectator" &&
    top.pendingFrom.includes(snap.seat);
  if (!canOffer) return null;

  const better = BASE_RESOURCES.filter((r) => (snap.ratios[r] ?? 4) < 4);
  return (
    <section className="panel stack">
      <h3>Trade</h3>
      <div className="row wrap">
        <button
          aria-pressed={pick?.purpose === "bank"}
          className={pick?.purpose === "bank" ? "active" : ""}
          onClick={() =>
            setPick(pick?.purpose === "bank" ? null : startPick("bank", { wantLimit: 1 }))
          }
        >
          With the bank
        </button>
        {/* Solo games have nobody to offer to (the server rejects it too). */}
        {snap.players.length > 1 && (
          <button
            aria-pressed={pick?.purpose === "offer"}
            className={pick?.purpose === "offer" ? "active" : ""}
            onClick={() => setPick(pick?.purpose === "offer" ? null : startPick("offer"))}
          >
            Offer to players
          </button>
        )}
      </div>
      <p className="muted small">
        Bank rate 4:1
        {better.length > 0 &&
          ` · ports: ${better.map((r) => `${resourceName(r).toLowerCase()} ${snap.ratios[r]}:1`).join(", ")}`}
        {(pick?.purpose === "bank" || pick?.purpose === "offer") && " · pick cards in your hand"}
      </p>
    </section>
  );
}
