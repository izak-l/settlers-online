import { useState } from "react";
import type { Action } from "@settlers/engine";
import type { Snapshot } from "../game/LocalGame";
import type { SeatInfo } from "../game/seats";
import { ResourcePicker, nonZero, sum } from "./ResourcePicker";

const nameOf = (seats: SeatInfo[], id: string) => seats.find((s) => s.id === id)?.name ?? id;
const list = (r: Record<string, number>) =>
  Object.entries(r)
    .map(([k, n]) => `${n} ${k}`)
    .join(", ");

export function DiscardPicker({ snap, send }: { snap: Snapshot; send(a: Action): void }) {
  const [picked, setPicked] = useState<Record<string, number>>({});
  const owed =
    (snap.view.decisions.at(-1)!.data!["amounts"] as Record<string, number>)[snap.seat] ?? 0;
  const hand = snap.view.zones[`hand-${snap.seat}`]?.contents ?? {};
  return (
    <div className="stack">
      <p className="prompt">A 7 was rolled and you hold more than 7 cards. Discard {owed}.</p>
      <ResourcePicker value={picked} onChange={setPicked} max={hand} limit={owed} label="Discard" />
      <button
        className="primary"
        disabled={sum(picked) !== owed}
        onClick={() => send({ type: "DISCARD", resources: nonZero(picked) })}
      >
        Discard {sum(picked)} / {owed}
      </button>
    </div>
  );
}

export function StealPicker({
  snap,
  seats,
  send,
}: {
  snap: Snapshot;
  seats: SeatInfo[];
  send(a: Action): void;
}) {
  return (
    <div className="stack">
      <p className="prompt">Who do you rob?</p>
      <div className="row wrap">
        {snap.legal.map((a) =>
          a.type === "STEAL" ? (
            <button key={a.from} onClick={() => send(a)}>
              {nameOf(seats, a.from)} ({snap.view.zones[`hand-${a.from}`]?.count ?? 0} cards)
            </button>
          ) : null,
        )}
      </div>
    </div>
  );
}

interface Offer {
  from: string;
  give: Record<string, number>;
  want: Record<string, number>;
  responses: Record<string, "accept" | "decline">;
}

export function TradeOfferView({
  snap,
  seats,
  send,
}: {
  snap: Snapshot;
  seats: SeatInfo[];
  send(a: Action): void;
}) {
  const offer = snap.view.decisions.at(-1)!.data as unknown as Offer;
  const mine = offer.from === snap.seat;
  const others = seats.filter((s) => s.id !== offer.from);
  const canAccept = snap.legal.some((a) => a.type === "RESPOND_TRADE" && a.accept);

  return (
    <div className="stack offer">
      <p className="prompt">
        {mine ? "You offer" : `${nameOf(seats, offer.from)} offers`}{" "}
        <strong>{list(offer.give)}</strong> for <strong>{list(offer.want)}</strong>.
      </p>
      <ul className="responses">
        {others.map((s) => (
          <li key={s.id}>
            <span className="swatch" style={{ background: s.color }} /> {s.name}:{" "}
            <span className={`answer ${offer.responses[s.id] ?? "waiting"}`}>
              {offer.responses[s.id] === "accept"
                ? "accepts"
                : offer.responses[s.id] === "decline"
                  ? "declines"
                  : "thinking…"}
            </span>
            {mine && offer.responses[s.id] === "accept" && (
              <button
                className="primary"
                onClick={() => send({ type: "CONFIRM_TRADE", with: s.id })}
              >
                Trade with {s.name}
              </button>
            )}
          </li>
        ))}
      </ul>
      {mine ? (
        <button className="link" onClick={() => send({ type: "CANCEL_TRADE" })}>
          Withdraw offer
        </button>
      ) : snap.seat !== "spectator" ? (
        <div className="row">
          <button
            className="primary"
            disabled={!canAccept}
            onClick={() => send({ type: "RESPOND_TRADE", accept: true })}
          >
            Accept
          </button>
          <button onClick={() => send({ type: "RESPOND_TRADE", accept: false })}>Decline</button>
          {!canAccept && <span className="muted small">You don't have what they want.</span>}
        </div>
      ) : null}
    </div>
  );
}
