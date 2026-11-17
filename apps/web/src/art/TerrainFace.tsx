import { useState } from "react";
import { HEX_SIZE, hexCenter, hexPolygon } from "../board/geometry";
import type { Artwork } from "./appearance";
import { tileImage } from "./artwork";
import { TerrainArt } from "./board";

/** Tile decoration only; tokens, pieces and hit areas stay in their existing layers. */
export function TerrainFace({
  q,
  r,
  terrain,
  artwork,
}: {
  q: number;
  r: number;
  terrain: string;
  artwork: Artwork;
}) {
  const [failed, setFailed] = useState<string>();
  const src = tileImage(artwork, terrain);
  const at = hexCenter(q, r);
  const radius = HEX_SIZE - 1.5;
  if (src && src !== failed) {
    const width = radius * Math.sqrt(3);
    return (
      <image
        className="art terrain-image"
        href={src}
        x={at[0] - width / 2}
        y={at[1] - radius}
        width={width}
        height={radius * 2}
        preserveAspectRatio="none"
        aria-hidden="true"
        onError={() => setFailed(src)}
      />
    );
  }
  return (
    <g>
      <polygon
        points={hexPolygon(q, r, HEX_SIZE, terrain === "sea" ? 1 : 1.5)}
        fill={`url(#tg-${terrain})`}
        className={terrain === "sea" ? "hex sea" : "hex"}
      />
      <TerrainArt terrain={terrain} at={at} />
    </g>
  );
}
