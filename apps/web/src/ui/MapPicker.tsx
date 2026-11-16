import type { MapDef } from "@settlers/maps";
import { MapPreview } from "../board/MapPreview";
import { mapFacts } from "../board/mapTiles";

export interface MapOption {
  id: string;
  name: string;
  description: string;
  def: MapDef;
  /** Shown under the name (e.g. "draft"). */
  tag?: string;
  /** Why it can't be picked right now; the option is shown but disabled. */
  disabledReason?: string;
}

/** One-line facts: players, VP target and land size. */
export function mapSummary(def: MapDef): string {
  const { min, max } = def.players;
  const players = min === max ? `${min} player${min === 1 ? "" : "s"}` : `${min}–${max} players`;
  return `${players} · ${def.vpToWin} VP to win · ${mapFacts(def).land} land tiles`;
}

/** A list of maps as radio cards with a small preview. */
export function MapPicker({
  options,
  value,
  onChange,
  disabled,
}: {
  options: MapOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="map-list" disabled={disabled}>
      <legend className="visually-hidden">Map</legend>
      {options.map((m) => (
        <label key={m.id} className={m.id === value ? "map-choice chosen" : "map-choice"}>
          <input
            type="radio"
            name="map"
            checked={m.id === value}
            disabled={m.disabledReason !== undefined}
            onChange={() => onChange(m.id)}
          />
          <MapPreview def={m.def} />
          <span className="map-text">
            <strong>
              {m.name}
              {m.tag && <span className="tag">{m.tag}</span>}
            </strong>
            <span className="small">{m.description}</span>
            <span className="muted small">{m.disabledReason ?? mapSummary(m.def)}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
