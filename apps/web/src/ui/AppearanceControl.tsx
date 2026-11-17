import { useId } from "react";
import { setArtwork } from "../art/appearance";
import { useArtwork } from "../art/useArtwork";
import { TerrainFace } from "../art/TerrainFace";
import { TerrainDefs } from "../art/board";
import { ResourceCard } from "../cards/CardFace";

/** Original / Realism artwork for tiles and resource cards (spec 226), shown in the game menu. */
export function ArtworkChoices() {
  const artwork = useArtwork();
  const id = useId();
  return (
    <fieldset className="artwork-fieldset">
      <legend>Appearance</legend>
      <p className="muted">Tiles and resource cards</p>
      <div className="artwork-choices">
        {(["original", "realism"] as const).map((choice) => (
          <label className="artwork-choice" key={choice}>
            <span className="artwork-sample" aria-hidden="true">
              <svg viewBox="-55 -61 110 122" width="62" height="70">
                <TerrainDefs />
                <TerrainFace q={0} r={0} terrain="forest" artwork={choice} />
              </svg>
              <ResourceCard resource="wood" artwork={choice} />
            </span>
            <span>
              <input
                type="radio"
                name={`${id}-artwork`}
                value={choice}
                checked={artwork === choice}
                onChange={() => setArtwork(choice)}
              />{" "}
              {choice === "original" ? "Original" : "Realism"}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
