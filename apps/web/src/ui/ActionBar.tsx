import { BASE_COSTS, type Action } from "@settlers/engine";
import type { Snapshot } from "../game/LocalGame";
import type { BuildMode, SeatInfo } from "../game/seats";

const BUILDS: { mode: Exclude<BuildMode, null>; label: string; action: string }[] = [
  { mode: "road", label: "Road", action: "BUILD_ROAD" },
  { mode: "settlement", label: "Settlement", action: "BUILD_SETTLEMENT" },
  { mode: "city", label: "City", action: "BUILD_CITY" },
];

const WAITING_FOR: Record<string, string> = {
  PLACE_SETTLEMENT: "to place a settlement",
  PLACE_ROAD: "to place a road",
  ROLL: "to roll",
  MAIN: "to finish their turn",
};

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

interface Props {
  snap: Snapshot;
  seats: SeatInfo[];
  mode: BuildMode;
  setMode(mode: BuildMode): void;
  send(action: Action): void;
  error: string | null;
}

export function ActionBar({ snap, seats, mode, setMode, send, error }: Props) {
  const top = snap.view.decisions.at(-1);
  const myMove = snap.seat !== "spectator" && !!top?.pendingFrom.includes(snap.seat);
  const canDo = (type: string) => snap.legal.some((a) => a.type === type);
  const lastRoll = (
    snap.view.moduleState["base"] as { lastRoll?: Record<string, number> } | undefined
  )?.lastRoll;

  let body: React.ReactNode = null;
  if (!myMove) {
    const who = seats.find((s) => s.id === top?.pendingFrom[0]);
    body = (
      <p className="prompt muted">
        Waiting for {who?.name ?? "the next player"} {WAITING_FOR[top?.kind ?? ""] ?? ""}…
      </p>
    );
  } else {
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
                  onClick={() => setMode(mode === b.mode ? null : b.mode)}
                >
                  <span>{b.label}</span>
                  <Cost cost={BASE_COSTS[b.mode]!} />
                </button>
              ))}
            </div>
            {mode && (
              <p className="prompt">
                Pick a highlighted spot, or press the button again to cancel.
              </p>
            )}
            <button className="primary" onClick={() => send({ type: "END_TURN" })}>
              End turn
            </button>
          </>
        );
        break;
    }
  }

  return (
    <section className="panel actions">
      {lastRoll && snap.view.turn.number > 0 && (
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
