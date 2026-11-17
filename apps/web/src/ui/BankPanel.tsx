import { BASE_RESOURCES } from "@settlers/engine";
import { CardBack, ResourceCard, resourceName } from "../cards/CardFace";
import type { Snapshot } from "../game/LocalGame";

/** What the bank holds: cards left of each resource, and the dev deck (spec 232). Public. */
export function BankPanel({ snap }: { snap: Snapshot }) {
  const bank = snap.view.zones["bank"]?.contents;
  if (!bank) return null;
  const deck = snap.view.zones["devdeck"]?.count;
  return (
    // Cards you take from the bank fly in from here (HandDock looks for data-bank).
    <section className="panel bank-panel" data-bank>
      <h3>Bank</h3>
      <ul className="bank-row">
        {BASE_RESOURCES.map((r) => {
          const n = bank[r] ?? 0;
          return (
            <li key={r} className={n === 0 ? "empty" : undefined}>
              <span className="bank-card" aria-hidden="true">
                <ResourceCard resource={r} />
              </span>
              <span className="bank-count" aria-label={`${n} ${resourceName(r).toLowerCase()}`}>
                {n}
              </span>
            </li>
          );
        })}
        {deck !== undefined && (
          <li className={deck === 0 ? "empty" : undefined}>
            <span className="bank-card">
              <CardBack kind="dev" />
            </span>
            <span className="bank-count" aria-label={`${deck} development cards`}>
              {deck}
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}
