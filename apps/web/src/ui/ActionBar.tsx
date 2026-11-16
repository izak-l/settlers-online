import { BASE_COSTS, type Action } from "@settlers/engine";
import type { Snapshot } from "../game/LocalGame";
import type { BuildMode, SeatInfo } from "../game/seats";
import { StealPicker, TradeOfferView } from "./Decisions";
import { TurnTimer } from "./TurnTimer";

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
  DISCARD: "to discard",
  MOVE_ROBBER: "to move the robber",
  STEAL: "to choose who to rob",
  PLACE_FREE_ROAD: "to place free roads",
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
  if (snap.view.winner !== undefined) {
    body = null;
  } else if (top?.kind === "TRADE_OFFER") {
    body = <TradeOfferView snap={snap} seats={seats} send={send} />;
  } else if (!myMove) {
    const waiting = top?.pendingFrom.map((id) => seats.find((s) => s.id === id)?.name ?? id) ?? [];
    body = (
      <p className="prompt muted">
        Waiting for {waiting.join(", ") || "the next player"} {WAITING_FOR[top?.kind ?? ""] ?? ""}…
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
      case "PLACE_FREE_ROAD":
        body = (
          <p className="prompt">Place a free road ({String(top.data?.["remaining"])} left).</p>
        );
        break;
      case "DISCARD": {
        const owed = (top.data?.["amounts"] as Record<string, number>)[snap.seat] ?? 0;
        body = (
          <p className="prompt">
            A 7 was rolled and you hold more than 7 cards. Pick {owed} from your hand to discard.
          </p>
        );
        break;
      }
      case "MOVE_ROBBER":
        body = <p className="prompt">Move the robber: click a highlighted hex.</p>;
        break;
      case "STEAL":
        body = <StealPicker snap={snap} seats={seats} send={send} />;
        break;
      case "ROLL":
        body = (
          <>
            <button className="primary big" onClick={() => send({ type: "ROLL" })}>
              Roll dice
            </button>
            {snap.legal.some((a) => a.type.startsWith("PLAY_")) && (
              <p className="muted small">You can play a development card before rolling.</p>
            )}
          </>
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
              <button
                className="build"
                disabled={!canDo("BUY_DEV_CARD")}
                onClick={() => send({ type: "BUY_DEV_CARD" })}
              >
                <span>Dev card</span>
                <Cost cost={BASE_COSTS["devCard"]!} />
              </button>
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
      {((lastRoll && snap.view.turn.number > 0) || snap.clock) && (
        <div className="action-head">
          {lastRoll && snap.view.turn.number > 0 && (
            <div
              // Remount on every roll so the roll animation plays again.
              key={snap.log.filter((e) => e.type === "ROLLED").length}
              className="dice"
              aria-label="Last roll"
            >
              {Object.entries(lastRoll).map(([die, n]) => (
                <span key={die} className={`die die-${die}`}>
                  {n}
                </span>
              ))}
              <span className="muted">= {Object.values(lastRoll).reduce((a, b) => a + b, 0)}</span>
            </div>
          )}
          {snap.clock && <TurnTimer clock={snap.clock} mine={myMove} />}
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
