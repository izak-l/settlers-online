import { useState } from "react";
import { BASE_RESOURCES, type Action } from "@settlers/engine";
import type { Snapshot } from "../game/LocalGame";
import { ResourcePicker, nonZero, sum } from "./ResourcePicker";

/** In your main step: trade with the bank at your best rate, or offer a trade to everyone. */
export function TradePanel({ snap, send }: { snap: Snapshot; send(a: Action): void }) {
  const [give, setGive] = useState<string>("");
  const [get, setGet] = useState<string>("");
  const [offerGive, setOfferGive] = useState<Record<string, number>>({});
  const [offerWant, setOfferWant] = useState<Record<string, number>>({});
  const hand = snap.view.zones[`hand-${snap.seat}`]?.contents ?? {};
  const top = snap.view.decisions.at(-1);
  // Only on your own main step (the step allowing offers isn't enough: it's someone's turn).
  const canOffer =
    !!top?.allowed.includes("OFFER_TRADE") &&
    snap.seat !== "spectator" &&
    top.pendingFrom.includes(snap.seat);
  const bankOk = snap.legal.some(
    (a) => a.type === "BANK_TRADE" && a.give === give && a.get === get,
  );

  if (!canOffer) return null;

  return (
    <section className="panel stack">
      <h3>Trade</h3>
      <div className="stack">
        <span className="muted small">With the bank</span>
        <div className="row wrap">
          <select aria-label="Give" value={give} onChange={(e) => setGive(e.target.value)}>
            <option value="">Give…</option>
            {BASE_RESOURCES.map((r) => (
              <option key={r} value={r}>
                {snap.ratios[r] ?? 4} {r}
              </option>
            ))}
          </select>
          <span>for 1</span>
          <select aria-label="Get" value={get} onChange={(e) => setGet(e.target.value)}>
            <option value="">Get…</option>
            {BASE_RESOURCES.filter((r) => r !== give).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button disabled={!bankOk} onClick={() => send({ type: "BANK_TRADE", give, get })}>
            Trade
          </button>
        </div>
      </div>
      {/* Solo games have nobody to offer to (the server rejects it too). */}
      {snap.players.length > 1 && (
        <details>
          <summary>Offer a trade to the other players</summary>
          <div className="stack">
            <span className="muted small">You give</span>
            <ResourcePicker value={offerGive} onChange={setOfferGive} max={hand} label="You give" />
            <span className="muted small">You want</span>
            <ResourcePicker value={offerWant} onChange={setOfferWant} label="You want" />
            <button
              className="primary"
              disabled={sum(offerGive) === 0 || sum(offerWant) === 0}
              onClick={() => {
                send({ type: "OFFER_TRADE", give: nonZero(offerGive), want: nonZero(offerWant) });
                setOfferGive({});
                setOfferWant({});
              }}
            >
              Offer
            </button>
          </div>
        </details>
      )}
    </section>
  );
}
