import { useMemo, useState } from "react";
import { BASE_FEATURES, type Features } from "@settlers/engine";
import { GAME_TYPES, type GameType, type MapDef } from "@settlers/maps";
import { LocalGame } from "../game/LocalGame";
import { GameView } from "./GameView";
import { HouseRules } from "./HouseRules";
import {
  GameSummary,
  GameTypePicker,
  MapChooser,
  describeChoice,
  type GameChoice,
} from "./GamePicker";
import { sandboxDrafts } from "./sandboxMaps";

/**
 * Draft maps, read straight from the repo so a new JSON file shows up on reload. This module is
 * only rendered in development builds (see App.tsx), and a production build is checked not to
 * contain any draft.
 */
const DRAFTS: Record<string, unknown> = import.meta.glob(
  "../../../../packages/maps/maps/drafts/*.json",
  {
    eager: true,
    import: "default",
  },
);

/**
 * Developer-only: a local game where you act for whichever seat is being waited on.
 * Used to try rules, UI changes and maps without a server. Not part of production builds.
 */
export function DevSandbox() {
  const [type, setType] = useState<GameType>(GAME_TYPES[0]!);
  const [count, setCount] = useState(4);
  const [seed, setSeed] = useState("");
  const [choice, setChoice] = useState<GameChoice>({ builtin: "base-4p" });
  const [features, setFeatures] = useState<Features>(BASE_FEATURES);
  const [started, setStarted] = useState<{
    count: number;
    seed: string;
    def: MapDef;
    features: Features;
  } | null>(null);
  const drafts = useMemo(() => sandboxDrafts(DRAFTS, count), [count]);
  const shown = describeChoice(type, choice, drafts);
  const draft = "builtin" in choice ? drafts.find((d) => d.id === choice.builtin) : undefined;
  const chosen = shown && !draft?.disabledReason ? shown : undefined;
  const client = useMemo(
    () =>
      started
        ? new LocalGame(
            Array.from({ length: started.count }, (_, i) => `Seat ${i + 1}`),
            started.seed,
            started.def,
            started.features,
          )
        : null,
    [started],
  );

  if (client) return <GameView client={client} />;

  return (
    <form
      className="start card stack sandbox"
      onSubmit={(e) => {
        e.preventDefault();
        if (!chosen) return;
        setStarted({
          count,
          seed: seed.trim() || Math.random().toString(36).slice(2, 10),
          def: chosen.def,
          features,
        });
      }}
    >
      <h1>Dev sandbox</h1>
      <p className="muted">
        A local game with the engine running in this tab. You act for whichever seat the game is
        waiting on.
      </p>
      <GameTypePicker
        value={type.id}
        onChange={(t) => {
          setType(t);
          setCount((n) => Math.min(n, t.maxPlayers));
          setChoice(t.size ? { scenario: "new-horizons", setup: "fixed" } : { builtin: "base-4p" });
        }}
      />
      <fieldset className="count">
        <legend>Seats</legend>
        {[1, 2, 3, 4]
          .filter((n) => n <= type.maxPlayers)
          .map((n) => (
            <label key={n}>
              <input type="radio" name="count" checked={count === n} onChange={() => setCount(n)} />
              {n}
            </label>
          ))}
      </fieldset>
      <label className="field">
        <span>Seed (optional)</span>
        <input value={seed} placeholder="random" onChange={(e) => setSeed(e.target.value)} />
      </label>
      <GameSummary type={type} choice={choice} extra={drafts} />
      <MapChooser key={type.id} type={type} choice={choice} extra={drafts} onChoose={setChoice} />
      <p className="muted small">Drafts come from packages/maps/maps/drafts/.</p>
      <HouseRules
        features={features}
        editable
        onToggle={(id, on) => setFeatures((f) => ({ ...f, [id]: on }))}
      />
      <button type="submit" className="primary" disabled={!chosen}>
        {chosen ? `Start on ${chosen.name}` : "Pick a map that fits the seat count"}
      </button>
    </form>
  );
}
