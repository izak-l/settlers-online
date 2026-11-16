import { SCENARIO_CATALOG, scenarioMap, type MapDef, type SetupMode } from "@settlers/maps";
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
  disabledReason?: string | undefined;
  /** Options are listed under a heading per group (e.g. "Seafaring"); none means the main list. */
  group?: string;
}

/** Seafaring scenarios as map options: each shows its map for this seat count and setup mode. */
export function scenarioOptions(seats: number, setup: SetupMode): MapOption[] {
  return SCENARIO_CATALOG.flatMap((s): MapOption[] => {
    const def = scenarioMap(s.id, seats, setup);
    const any = def ?? scenarioMap(s.id, seats, "fixed");
    if (!any) return [];
    return [
      {
        id: `scenario:${s.id}`,
        name: s.name,
        description: s.description,
        def: any,
        group: "Seafaring",
        disabledReason: def ? undefined : "Variable setup isn't available yet",
      },
    ];
  });
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
      {options.map((m, i) => (
        <div key={m.id} className="map-option">
          {m.group && m.group !== options[i - 1]?.group && <h4 className="map-group">{m.group}</h4>}
          <label className={m.id === value ? "map-choice chosen" : "map-choice"}>
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
        </div>
      ))}
    </fieldset>
  );
}
