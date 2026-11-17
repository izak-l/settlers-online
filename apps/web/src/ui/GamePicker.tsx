import { useState, type ReactNode } from "react";
import {
  GAME_TYPES,
  mapsForType,
  scenariosForType,
  type GameType,
  type MapDef,
  type SetupMode,
} from "@settlers/maps";
import { MapPreview } from "../board/MapPreview";
import { mapFacts } from "../board/mapTiles";

/** What a lobby (or the sandbox) plays: a plain map, or a scenario with its setup (spec 023). */
export type GameChoice = { builtin: string } | { scenario: string; setup: SetupMode };

/** A map the sandbox lists besides the catalog (drafts), possibly not playable yet. */
export interface ExtraMap {
  id: string;
  name: string;
  description: string;
  def: MapDef;
  disabledReason?: string | undefined;
}

/** One-line facts: players, VP target and land size. Player counts are upper bounds. */
export function mapSummary(def: MapDef): string {
  const max = def.players.max;
  return `Up to ${max} player${max === 1 ? "" : "s"} · ${def.vpToWin} VP to win · ${mapFacts(def).land} land tiles`;
}

/** The map a choice plays in this game type, with what to call it. */
export function describeChoice(
  type: GameType,
  choice: GameChoice,
  extra: ExtraMap[] = [],
): { def: MapDef; name: string; description: string; kind: string } | undefined {
  if ("builtin" in choice) {
    const m =
      mapsForType(type).find((x) => x.id === choice.builtin) ??
      extra.find((x) => x.id === choice.builtin);
    if (!m) return undefined;
    const kind = extra.includes(m as ExtraMap) ? "Draft" : type.size ? "Free play" : "Map";
    return { def: m.def, name: m.name, description: m.description, kind };
  }
  const s = scenariosForType(type).find((x) => x.id === choice.scenario);
  const def = s?.maps[`${type.size!}-${choice.setup}`] ?? s?.maps[`${type.size!}-fixed`];
  if (!s || !def) return undefined;
  const setup = choice.setup === "fixed" ? "rulebook layout" : "random layout";
  return { def, name: s.name, description: s.description, kind: `Scenario · ${setup}` };
}

/**
 * Pick the game type: radio cards. A type that can't seat everyone already seated is disabled.
 */
export function GameTypePicker({
  value,
  onChange,
  seated = 0,
  disabled,
}: {
  value: string;
  onChange: (type: GameType) => void;
  seated?: number;
  disabled?: boolean;
}) {
  return (
    <fieldset className="type-picker" disabled={disabled}>
      <legend>Game type</legend>
      {GAME_TYPES.map((t) => {
        const tooMany = seated > t.maxPlayers;
        return (
          <label
            key={t.id}
            className={["type-choice", t.id === value && "chosen", tooMany && "unavailable"]
              .filter(Boolean)
              .join(" ")}
            title={tooMany ? `${seated} players are seated` : undefined}
          >
            <input
              type="radio"
              name="game-type"
              checked={t.id === value}
              disabled={tooMany}
              onChange={() => onChange(t)}
            />
            <strong>{t.name}</strong>
            <span className="small muted">{t.description}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

/** What everyone in the lobby sees: the game type and the chosen map or scenario. */
export function GameSummary({
  type,
  choice,
  extra,
}: {
  type: GameType;
  choice: GameChoice;
  extra?: ExtraMap[];
}) {
  const shown = describeChoice(type, choice, extra);
  if (!shown) return null;
  return (
    <div className="game-summary" aria-live="polite">
      <MapPreview def={shown.def} />
      <div className="stack tight">
        <span className="eyebrow">
          {type.name} · {shown.kind}
        </span>
        <strong className="summary-name">{shown.name}</strong>
        <span className="small">{shown.description}</span>
        <span className="muted small">{mapSummary(shown.def)}</span>
      </div>
    </div>
  );
}

function ChoiceCard({
  def,
  name,
  description,
  selected,
  disabledReason,
  onPick,
  children,
}: {
  def: MapDef;
  name: string;
  description: string;
  selected: boolean;
  disabledReason?: string | undefined;
  onPick?: (() => void) | undefined;
  children?: ReactNode;
}) {
  const disabled = !onPick || disabledReason !== undefined;
  return (
    <div className={selected ? "choice-card chosen" : "choice-card"}>
      <label className="choice-main">
        <input
          type="radio"
          name="game-map"
          checked={selected}
          disabled={disabled && !selected}
          onChange={() => onPick?.()}
        />
        <MapPreview def={def} />
        <span className="map-text">
          <strong>
            {name}
            {selected && <span className="selected-tag">✓ Selected</span>}
          </strong>
          <span className="small">{description}</span>
          <span className="muted small">{disabledReason ?? mapSummary(def)}</span>
        </span>
      </label>
      {children}
    </div>
  );
}

type Tab = "scenarios" | "free" | "drafts";

/**
 * The maps a game type offers, as cards (spec 023). Base lists its maps; seafaring has a
 * Scenarios tab (Fixed / Variable inside the selected scenario's card) and a Free play tab; the
 * sandbox adds a Drafts tab. Without `onChoose` it's read-only.
 */
export function MapChooser({
  type,
  choice,
  onChoose,
  extra = [],
  disabled,
}: {
  type: GameType;
  choice: GameChoice;
  onChoose?: ((choice: GameChoice) => void) | undefined;
  extra?: ExtraMap[];
  disabled?: boolean;
}) {
  const scenarios = scenariosForType(type);
  const plain = mapsForType(type);
  const tabs: [Tab, string, number][] = [];
  if (scenarios.length > 0) tabs.push(["scenarios", "Scenarios", scenarios.length]);
  if (plain.length > 0) tabs.push(["free", type.size ? "Free play" : "Maps", plain.length]);
  if (extra.length > 0) tabs.push(["drafts", "Drafts", extra.length]);
  const current: Tab =
    "scenario" in choice
      ? "scenarios"
      : extra.some((m) => m.id === choice.builtin)
        ? "drafts"
        : "free";
  const [tab, setTab] = useState<Tab>(current);
  const shownTab = tabs.some(([t]) => t === tab) ? tab : (tabs[0]?.[0] ?? "free");
  const pick = disabled || !onChoose ? undefined : onChoose;

  return (
    <div className="map-chooser">
      {tabs.length > 1 && (
        <div className="tabs" role="tablist" aria-label="Maps">
          {tabs.map(([t, label, n]) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={shownTab === t}
              className={shownTab === t ? "tab active" : "tab"}
              onClick={() => setTab(t)}
            >
              {label} <span className="muted">{n}</span>
              {current === t && <span className="dot-selected" aria-label="(selected)" />}
            </button>
          ))}
        </div>
      )}
      <div className="choice-list" role="radiogroup" aria-label="Map">
        {shownTab === "scenarios" &&
          scenarios.map((s) => {
            const selected = "scenario" in choice && choice.scenario === s.id;
            const setup: SetupMode = selected && "setup" in choice ? choice.setup : "fixed";
            const def = s.maps[`${type.size!}-${setup}`] ?? s.maps[`${type.size!}-fixed`]!;
            const variable = !!s.maps[`${type.size!}-variable`];
            return (
              <ChoiceCard
                key={s.id}
                def={def}
                name={s.name}
                description={s.description}
                selected={selected}
                onPick={pick && (() => pick({ scenario: s.id, setup: "fixed" }))}
              >
                {selected && variable && (
                  <div className="segmented" role="radiogroup" aria-label="Layout">
                    {(["fixed", "variable"] as const).map((m) => (
                      <label key={m} className={setup === m ? "seg active" : "seg"}>
                        <input
                          type="radio"
                          name={`setup-${s.id}`}
                          checked={setup === m}
                          disabled={!pick}
                          onChange={() => pick?.({ scenario: s.id, setup: m })}
                        />
                        {m === "fixed" ? "Rulebook layout" : "Random layout"}
                      </label>
                    ))}
                  </div>
                )}
              </ChoiceCard>
            );
          })}
        {shownTab === "free" &&
          plain.map((m) => (
            <ChoiceCard
              key={m.id}
              def={m.def}
              name={m.name}
              description={m.description}
              selected={"builtin" in choice && choice.builtin === m.id}
              onPick={pick && (() => pick({ builtin: m.id }))}
            />
          ))}
        {shownTab === "drafts" &&
          extra.map((m) => (
            <ChoiceCard
              key={m.id}
              def={m.def}
              name={m.name}
              description={m.description}
              disabledReason={m.disabledReason}
              selected={"builtin" in choice && choice.builtin === m.id}
              onPick={pick && (() => pick({ builtin: m.id }))}
            />
          ))}
      </div>
    </div>
  );
}
