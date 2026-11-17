import { BASE_COSTS, SHIP_COST, type Action } from "@settlers/engine";
import type { Snapshot } from "../game/LocalGame";
import type { BuildMode, SeatInfo } from "../game/seats";
import { Icon } from "../art/icons";
import { StealPicker, TradeOfferView } from "./Decisions";
import { TurnTimer } from "./TurnTimer";

const BUILDS: {
  mode: Exclude<BuildMode, null>;
  label: string;
  action: string;
  cost?: Record<string, number>;
}[] = [
  { mode: "road", label: "Road", action: "BUILD_ROAD", cost: BASE_COSTS["road"]! },
  {
    mode: "settlement",
    label: "Settlement",
    action: "BUILD_SETTLEMENT",
    cost: BASE_COSTS["settlement"]!,
  },
  { mode: "city", label: "City", action: "BUILD_CITY", cost: BASE_COSTS["city"]! },
  { mode: "ship", label: "Ship", action: "BUILD_SHIP", cost: SHIP_COST },
  { mode: "move", label: "Move ship", action: "MOVE_SHIP" },
];

/** Ship buttons only appear in games with ships (the seafaring rules). */
const SHIP_MODES = new Set(["ship", "move"]);

const WAITING_FOR: Record<string, string> = {
  PLACE_SETTLEMENT: "to place a settlement",
  PLACE_ROAD: "to place a road",
  ROLL: "to roll",
  MAIN: "to finish their turn",
  DISCARD: "to discard",
  MOVE_ROBBER: "to move the robber",
  STEAL: "to choose who to rob",
  PLACE_FREE_ROAD: "to place free roads",
  GOLD_CHOICE: "to pick gold",
  PLACE_HARBOR: "to place a harbor",
};

/** A port type in words, e.g. "2:1 wheat" or "3:1". */
const harborName = (type: string) => (type.endsWith("2to1") ? `2:1 ${type.slice(0, -4)}` : "3:1");

/** Pip positions on a 3×3 grid (0–8, row by row) for each face. */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({ n, die }: { n: number; die: string }) {
  return (
    <span className={`die die-${die}`} role="img" aria-label={String(n)}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={PIPS[n]?.includes(i) ? "pip on" : "pip"} />
      ))}
    </span>
  );
}

function Cost({ cost }: { cost: Record<string, number> }) {
  return (
    <span className="cost">
      {Object.entries(cost).map(([r, n]) => (
        <span key={r} className={`chip res-${r}`} title={`${n} ${r}`}>
          <Icon name={r} size={12} />
          {n > 1 && <span>{n}</span>}
        </span>
      ))}
    </span>
  );
}

/** When a road and a ship are both possible, which one the board's targets place. */
function RoadOrShip({
  road,
  ship,
  mode,
  setMode,
}: {
  road: boolean;
  ship: boolean;
  mode: BuildMode;
  setMode(mode: BuildMode): void;
}) {
  if (!road || !ship) return null;
  const shipOn = mode === "ship";
  return (
    <div className="builds" role="group" aria-label="Place a road or a ship">
      <button
        className={shipOn ? "build" : "build active"}
        aria-pressed={!shipOn}
        onClick={() => setMode(null)}
      >
        Road
      </button>
      <button
        className={shipOn ? "build active" : "build"}
        aria-pressed={shipOn}
        onClick={() => setMode("ship")}
      >
        Ship
      </button>
    </div>
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
  // Games with ships: the map's graph covers the sea (seafaring). The engine decides legality.
  const hasShips = snap.view.modules.includes("seafaring");
  // Harbors this player picked up off the water and still holds (spec 018).
  const held =
    snap.seat === "spectator"
      ? []
      : ((snap.view.moduleState["sf-lost-settlers"] as { held?: Record<string, string[]> })?.held?.[
          snap.seat
        ] ?? []);
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
      case "PLACE_SETTLEMENT": {
        const round = Number(top.data?.["round"] ?? 1);
        // A step may say whether it pays (spec 019's third settlement); otherwise round 2 does.
        const pays =
          typeof top.data?.["resources"] === "boolean" ? top.data["resources"] : round === 2;
        body = (
          <p className="prompt">
            Place your {["first", "second", "third"][round - 1] ?? "next"} settlement on a
            highlighted corner.
            {pays && " It collects one resource from each hex it touches."}
          </p>
        );
        break;
      }
      case "PLACE_ROAD":
        body = (
          <>
            <p className="prompt">
              {canDo("PLACE_SHIP")
                ? "Place a road, or a ship on the sea, touching that settlement."
                : "Place a road touching that settlement."}
            </p>
            <RoadOrShip
              road={canDo("PLACE_ROAD")}
              ship={canDo("PLACE_SHIP")}
              mode={mode}
              setMode={setMode}
            />
          </>
        );
        break;
      case "PLACE_FREE_ROAD":
        body = (
          <>
            <p className="prompt">
              Place a free {canDo("PLACE_FREE_SHIP") ? "road or ship" : "road"} (
              {String(top.data?.["remaining"])} left).
            </p>
            <RoadOrShip
              road={canDo("PLACE_FREE_ROAD")}
              ship={canDo("PLACE_FREE_SHIP")}
              mode={mode}
              setMode={setMode}
            />
          </>
        );
        break;
      case "GOLD_CHOICE": {
        const owed = (top.data?.["amounts"] as Record<string, number>)[snap.seat] ?? 0;
        body = (
          <p className="prompt">
            Gold! Pick {owed} {owed === 1 ? "resource" : "resources"} from the bank.
          </p>
        );
        break;
      }
      case "DISCARD": {
        const owed = (top.data?.["amounts"] as Record<string, number>)[snap.seat] ?? 0;
        body = (
          <p className="prompt">
            A 7 was rolled and you hold more than 7 cards. Pick {owed} from your hand to discard.
          </p>
        );
        break;
      }
      case "MOVE_ROBBER": {
        const pirate = snap.legal.some((x) => x.type === "MOVE_PIRATE");
        const away = snap.legal.find((x) => x.type === "MOVE_PIRATE" && x.hex === null);
        body = pirate ? (
          <div className="stack">
            <p className="prompt">
              Move the robber to a land hex, or the pirate to a sea hex: click a highlighted hex.
            </p>
            {away && (
              <button className="link" onClick={() => send(away)}>
                Send the pirate off the board
              </button>
            )}
          </div>
        ) : (
          <p className="prompt">Move the robber: click a highlighted hex.</p>
        );
        break;
      }
      case "STEAL":
        body = <StealPicker snap={snap} seats={seats} send={send} />;
        break;
      case "PLACE_HARBOR":
        body = (
          <p className="prompt">
            You picked up a {harborName(held[0] ?? "any3to1")} harbor. Place it on a highlighted
            coast edge next to your settlement or city.
          </p>
        );
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
              {BUILDS.filter((b) => !SHIP_MODES.has(b.mode) || hasShips).map((b) => (
                <button
                  key={b.mode}
                  className={mode === b.mode ? "build active" : "build"}
                  disabled={!canDo(b.action)}
                  aria-pressed={mode === b.mode}
                  onClick={() => setMode(mode === b.mode ? null : b.mode)}
                >
                  <span>{b.label}</span>
                  {b.cost && <Cost cost={b.cost} />}
                </button>
              ))}
              {canDo("PLACE_HARBOR") && (
                <button
                  className={mode === "harbor" ? "build active" : "build"}
                  aria-pressed={mode === "harbor"}
                  onClick={() => setMode(mode === "harbor" ? null : "harbor")}
                >
                  <span>Place harbor</span>
                  <span className="cost muted small">{harborName(held[0] ?? "any3to1")}</span>
                </button>
              )}
              {snap.view.options.features?.devCards !== false && (
                <button
                  className="build"
                  disabled={!canDo("BUY_DEV_CARD")}
                  onClick={() => send({ type: "BUY_DEV_CARD" })}
                >
                  <span>Dev card</span>
                  <Cost cost={BASE_COSTS["devCard"]!} />
                </button>
              )}
            </div>
            {!mode && (
              <p className="prompt muted small">
                Click an edge or corner on the map to see build options.
              </p>
            )}
            {held.length > 0 && !canDo("PLACE_HARBOR") && (
              <p className="muted small">
                You hold {held.length === 1 ? "a harbor" : `${held.length} harbors`} (
                {held.map(harborName).join(", ")}). Place it once you have a settlement or city by a
                free coast edge, at least one edge from other harbors.
              </p>
            )}
            {mode && (
              <p className="prompt">
                {mode === "move"
                  ? "Tap one of your highlighted ships, then where it should go. Press the button again to cancel."
                  : "Pick a highlighted spot, or press the button again to cancel."}
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
                <Die key={die} die={die} n={n} />
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
