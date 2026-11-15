import { BASE_COSTS } from "@settlers/engine";
import type { Snapshot } from "../game/LocalGame";
import { useGame, type BuildMode } from "../game/store";

const BUILDS: { mode: Exclude<BuildMode, null>; label: string; action: string }[] = [
  { mode: "road", label: "Road", action: "BUILD_ROAD" },
  { mode: "settlement", label: "Settlement", action: "BUILD_SETTLEMENT" },
  { mode: "city", label: "City", action: "BUILD_CITY" },
];

function Cost({ cost }: { cost: Record<string, number> }) {
  return (
    <span className="cost">
      {Object.entries(cost).map(([r, n]) => (
        <span key={r} className={`chip res-${r}`} title={`${n} ${r}`}>
          {n}
        </span>
      ))}
    </span>
  );
}

export function ActionBar({ snap }: { snap: Snapshot }) {
  const { send, mode, setMode, error } = useGame();
  const top = snap.view.decisions.at(-1);
  const canDo = (type: string) => snap.legal.some((a) => a.type === type);
  const lastRoll = (
    snap.view.moduleState["base"] as { lastRoll?: Record<string, number> } | undefined
  )?.lastRoll;

  let body: React.ReactNode = null;
  switch (top?.kind) {
    case "PLACE_SETTLEMENT":
      body = (
        <p className="prompt">
          Place your {top.data?.["round"] === 2 ? "second" : "first"} settlement on a highlighted
          corner.
          {top.data?.["round"] === 2 && " It collects one resource from each hex it touches."}
        </p>
      );
      break;
    case "PLACE_ROAD":
      body = <p className="prompt">Place a road touching that settlement.</p>;
      break;
    case "ROLL":
      body = (
        <button className="primary big" onClick={() => send({ type: "ROLL" })}>
          Roll dice
        </button>
      );
      break;
    case "MAIN":
      body = (
        <>
          <div className="builds">
            {BUILDS.map((b) => (
              <button
                key={b.mode}
                className={mode === b.mode ? "build active" : "build"}
                disabled={!canDo(b.action)}
                aria-pressed={mode === b.mode}
                onClick={() => setMode(b.mode)}
              >
                <span>{b.label}</span>
                <Cost cost={BASE_COSTS[b.mode]!} />
              </button>
            ))}
          </div>
          {mode && (
            <p className="prompt">Pick a highlighted spot, or press the button again to cancel.</p>
          )}
          <button className="primary" onClick={() => send({ type: "END_TURN" })}>
            End turn
          </button>
        </>
      );
      break;
  }

  return (
    <section className="panel actions">
      {lastRoll && top?.kind !== "ROLL" && snap.view.turn.number > 0 && (
        <div className="dice" aria-label="Last roll">
          {Object.entries(lastRoll).map(([die, n]) => (
            <span key={die} className={`die die-${die}`}>
              {n}
            </span>
          ))}
          <span className="muted">= {Object.values(lastRoll).reduce((a, b) => a + b, 0)}</span>
        </div>
      )}
      {body}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
