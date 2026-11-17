import { DEV_CARD_NAMES } from "@settlers/engine";
import { useState } from "react";
import { Icon } from "../art/icons";
import type { Artwork } from "../art/appearance";
import { cardImage } from "../art/artwork";
import { useArtwork } from "../art/useArtwork";

export const RESOURCE_NAMES: Record<string, string> = {
  wood: "Wood",
  brick: "Brick",
  sheep: "Sheep",
  wheat: "Wheat",
  ore: "Ore",
};
export const resourceName = (r: string) => RESOURCE_NAMES[r] ?? r;
export const devName = (c: string) => DEV_CARD_NAMES[c] ?? c;

/** A resource card face. Size comes from the --card-w CSS variable of an ancestor. */
export function ResourceCard({ resource, artwork }: { resource: string; artwork?: Artwork }) {
  const selected = useArtwork();
  const src = cardImage(artwork ?? selected, resource);
  const [failed, setFailed] = useState<string>();
  const illustrated = src && src !== failed;
  return (
    <span className={`card-face res-card res-${resource}${illustrated ? " image-card" : ""}`}>
      {illustrated ? (
        <img
          src={src}
          alt={resourceName(resource)}
          draggable={false}
          onError={() => setFailed(src)}
        />
      ) : (
        <>
          <Icon name={resource} />
          <span className="card-label">{resourceName(resource)}</span>
        </>
      )}
    </span>
  );
}

export function DevCardFace({ card, isNew }: { card: string; isNew?: boolean }) {
  return (
    <span className={`card-face dev-card dev-${card}${isNew ? " is-new" : ""}`}>
      <Icon name={card} />
      <span className="card-label">{devName(card)}</span>
      {isNew && <span className="new-tag">New</span>}
    </span>
  );
}

export function CardBack({ kind }: { kind: "res" | "dev" }) {
  return <span className={`card-face card-back back-${kind}`} aria-hidden="true" />;
}

/** A small read-only row of card faces, e.g. the two sides of a trade offer. */
export function CardRow({ cards }: { cards: Record<string, number> }) {
  const list = Object.entries(cards).flatMap(([r, n]) => Array.from({ length: n }, () => r));
  const label = Object.entries(cards)
    .map(([r, n]) => `${n} ${resourceName(r).toLowerCase()}`)
    .join(", ");
  return (
    <span className="card-row mini" role="img" aria-label={label}>
      {list.map((r, i) => (
        <ResourceCard key={i} resource={r} />
      ))}
    </span>
  );
}
