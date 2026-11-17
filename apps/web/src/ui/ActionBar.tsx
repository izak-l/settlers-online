import { useEffect, useState } from "react";
import { BASE_RESOURCES, type Action } from "@settlers/engine";
import type { Snapshot } from "../game/LocalGame";
import type { BuildMode, SeatInfo } from "../game/seats";
import { Icon } from "../art/icons";
import { resourceName } from "../cards/CardFace";
import { startPick, type Pick } from "../cards/picking";
import { buildTiles, type BuildTile } from "./buildTiles";
import { BoardDice } from "./Dice";
import { StealPicker, TradeOfferView } from "./Decisions";
import { TurnTimer } from "./TurnTimer";

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

/**
 * A square icon button with an optional count badge and its cost underneath; the name shows
 * on hover or keyboard focus (spec 232).
 */
function SquareButton({
  icon,
  label,
  left,
  cost,
  active,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  left?: number;
  cost?: Record<string, number>;
  active?: boolean;
  disabled?: boolean;
  onClick(): void;
}) {
  const cls = ["square", active && "active", left === 0 && "out"].filter(Boolean).join(" ");
  return (
    <button
      className={cls}
      disabled={disabled}
      aria-pressed={active}
      aria-label={left === undefined ? label : `${label}, ${left} left`}
      onClick={onClick}
    >
      <Icon name={icon} size={28} />
      {cost && <Cost cost={cost} />}
      {left !== undefined && <span className="left-badge">{left}</span>}
      <span className="tip" aria-hidden="true">
        {label}
      </span>
    </button>
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
    <div className="row" role="group" aria-label="Place a road or a ship">
      <button
        className={shipOn ? "" : "active"}
        aria-pressed={!shipOn}
        onClick={() => setMode(null)}
      >
        Road
      </button>
      <button
        className={shipOn ? "active" : ""}
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
  pick: Pick | null;
  setPick(p: Pick | null): void;
  send(action: Action): void;
  error: string | null;
}

/**
 * The bottom bar beside your hand (spec 232): a status strip with the clock, a card above it
 * when a decision needs buttons, and a row of square action buttons for players.
 */
export function ActionBar({ snap, seats, mode, setMode, pick, setPick, send, error }: Props) {
  const top = snap.view.decisions.at(-1);
  const playing = snap.seat !== "spectator";
  const myMove = playing && !!top?.pendingFrom.includes(snap.seat);
  const canDo = (type: string) => snap.legal.some((a) => a.type === type);
  const [tradeMenu, setTradeMenu] = useState(false);
  // A new decision closes the trade menu.
  useEffect(() => setTradeMenu(false), [top?.kind, myMove]);

  const hasShips = snap.view.modules.includes("seafaring");
  const tiles = buildTiles({
    legal: snap.legal.map((a) => a.type),
    ...(snap.piecesLeft ? { piecesLeft: snap.piecesLeft } : {}),
    ...(snap.view.zones["devdeck"]?.count !== undefined
      ? { devDeck: snap.view.zones["devdeck"].count }
      : {}),
    hasShips,
    devCards: snap.view.options.features?.devCards !== false,
  });
  // Harbors this player picked up off the water and still holds (spec 018).
  const held = !playing
    ? []
    : ((snap.view.moduleState["sf-lost-settlers"] as { held?: Record<string, string[]> })?.held?.[
        snap.seat
      ] ?? []);

  // Trading: only on your own main step (the step allowing offers isn't enough: it's someone's turn).
  const canTrade = myMove && !!top?.allowed.includes("OFFER_TRADE");
  const trading = pick?.purpose === "bank" || pick?.purpose === "offer";
  const better = BASE_RESOURCES.filter((r) => (snap.ratios[r] ?? 4) < 4);

  // The one-line status, and anything that needs its own buttons (shown in a card above).
  let status = "";
  let detail: React.ReactNode = null;
  if (snap.view.winner !== undefined) {
    status = "Game over";
  } else if (top?.kind === "TRADE_OFFER") {
    status = "Trade offer";
    detail = <TradeOfferView snap={snap} seats={seats} send={send} />;
  } else if (!myMove) {
    const waiting = top?.pendingFrom.map((id) => seats.find((s) => s.id === id)?.name ?? id) ?? [];
    status = `Waiting for ${waiting.join(", ") || "the next player"} ${WAITING_FOR[top?.kind ?? ""] ?? ""}…`;
  } else {
    switch (top?.kind) {
      case "PLACE_SETTLEMENT": {
        const round = Number(top.data?.["round"] ?? 1);
        // A step may say whether it pays (spec 019's third settlement); otherwise round 2 does.
        const pays =
          typeof top.data?.["resources"] === "boolean" ? top.data["resources"] : round === 2;
        status = `Place your ${["first", "second", "third"][round - 1] ?? "next"} settlement on a highlighted corner.${pays ? " It collects one resource from each hex it touches." : ""}`;
        break;
      }
      case "PLACE_ROAD":
        status = canDo("PLACE_SHIP")
          ? "Place a road, or a ship on the sea, touching that settlement."
          : "Place a road touching that settlement.";
        detail = (
          <RoadOrShip
            road={canDo("PLACE_ROAD")}
            ship={canDo("PLACE_SHIP")}
            mode={mode}
            setMode={setMode}
          />
        );
        break;
      case "PLACE_FREE_ROAD":
        status = `Place a free ${canDo("PLACE_FREE_SHIP") ? "road or ship" : "road"} (${String(top.data?.["remaining"])} left).`;
        detail = (
          <RoadOrShip
            road={canDo("PLACE_FREE_ROAD")}
            ship={canDo("PLACE_FREE_SHIP")}
            mode={mode}
            setMode={setMode}
          />
        );
        break;
      case "GOLD_CHOICE": {
        const owed = (top.data?.["amounts"] as Record<string, number>)[snap.seat] ?? 0;
        status = `Gold! Pick ${owed} ${owed === 1 ? "resource" : "resources"} from the bank.`;
        break;
      }
      case "DISCARD": {
        const owed = (top.data?.["amounts"] as Record<string, number>)[snap.seat] ?? 0;
        status = `A 7! You hold more than the limit: discard ${owed} from your hand.`;
        break;
      }
      case "MOVE_ROBBER": {
        const pirate = canDo("MOVE_PIRATE");
        const away = snap.legal.find((x) => x.type === "MOVE_PIRATE" && x.hex === null);
        status = pirate
          ? "Move the robber to a land hex, or the pirate to a sea hex."
          : "Move the robber: click a highlighted hex.";
        if (away)
          detail = (
            <button className="link" onClick={() => send(away)}>
              Send the pirate off the board
            </button>
          );
        break;
      }
      case "STEAL":
        status = "Choose who to rob.";
        detail = <StealPicker snap={snap} seats={seats} send={send} />;
        break;
      case "PLACE_HARBOR":
        status = `Place your ${harborName(held[0] ?? "any3to1")} harbor on a highlighted coast edge next to your settlement or city.`;
        break;
      case "ROLL":
        status = snap.legal.some((a) => a.type.startsWith("PLAY_"))
          ? "Your turn: roll the dice (you can play a development card first)."
          : "Your turn: roll the dice.";
        break;
      case "MAIN":
        status = mode
          ? mode === "move"
            ? "Tap one of your highlighted ships, then where it should go."
            : "Pick a highlighted spot, or press the button again to cancel."
          : trading
            ? "Pick cards in your hand and from the bank."
            : "Your turn: build, trade, or end your turn.";
        if (held.length > 0 && !canDo("PLACE_HARBOR"))
          detail = (
            <p className="muted small">
              You hold {held.length === 1 ? "a harbor" : `${held.length} harbors`} (
              {held.map(harborName).join(", ")}). Place it once you have a settlement or city by a
              free coast edge, at least one edge from other harbors.
            </p>
          );
        break;
    }
  }

  const rolling = myMove && top?.kind === "ROLL";
  const startTrade = (purpose: "bank" | "offer") => {
    setTradeMenu(false);
    setMode(null);
    setPick(purpose === "bank" ? startPick("bank", { wantLimit: 1 }) : startPick("offer"));
  };

  // The bar has a fixed height (the map re-fits when it changes), so the card floats above.
  return (
    <section className="action-dock" aria-label="Actions">
      <div className="action-main">
        {(detail || error) && (
          <div className="panel prompt-card">
            {detail}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
        <div className="status-row">
          <p className={myMove ? "status-pill mine" : "status-pill"} role="status">
            {status}
          </p>
          {snap.clock && <TurnTimer clock={snap.clock} mine={myMove} />}
        </div>
        {playing && snap.view.winner === undefined && (
          <div className="square-row">
            <div className="menu-anchor">
              <SquareButton
                icon="trade"
                label="Trade"
                active={trading || tradeMenu}
                disabled={!canTrade}
                onClick={() => (trading ? setPick(null) : setTradeMenu(!tradeMenu))}
              />
              {tradeMenu && canTrade && (
                <div className="panel trade-menu" role="menu">
                  <button role="menuitem" onClick={() => startTrade("bank")}>
                    With the bank
                  </button>
                  {/* Solo games have nobody to offer to (the server rejects it too). */}
                  {snap.players.length > 1 && (
                    <button role="menuitem" onClick={() => startTrade("offer")}>
                      Offer to players
                    </button>
                  )}
                  <p className="muted small">
                    Bank rate 4:1
                    {better.length > 0 &&
                      ` · ports: ${better.map((r) => `${resourceName(r).toLowerCase()} ${snap.ratios[r]}:1`).join(", ")}`}
                  </p>
                </div>
              )}
            </div>
            {tiles.map((t: BuildTile) => (
              <SquareButton
                key={t.action}
                icon={t.icon}
                label={t.label}
                {...(t.left !== undefined ? { left: t.left } : {})}
                {...(t.cost ? { cost: t.cost } : {})}
                active={t.mode !== null && mode === t.mode}
                disabled={!t.enabled}
                onClick={() =>
                  t.mode === null
                    ? send({ type: "BUY_DEV_CARD" })
                    : setMode(mode === t.mode ? null : t.mode)
                }
              />
            ))}
            {canDo("PLACE_HARBOR") && (
              <SquareButton
                icon="harbor"
                label={`Place ${harborName(held[0] ?? "any3to1")} harbor`}
                active={mode === "harbor"}
                onClick={() => setMode(mode === "harbor" ? null : "harbor")}
              />
            )}
          </div>
        )}
      </div>
      {/* The dice, with the big Roll / End turn button under them. */}
      <div className="turn-col">
        <BoardDice snap={snap} onRoll={canDo("ROLL") ? () => send({ type: "ROLL" }) : undefined} />
        {playing &&
          snap.view.winner === undefined &&
          (rolling ? (
            <button className="turn-button primary" onClick={() => send({ type: "ROLL" })}>
              <Icon name="dice" size={30} />
              <span>Roll dice</span>
            </button>
          ) : (
            <button
              className="turn-button primary"
              disabled={!canDo("END_TURN")}
              onClick={() => send({ type: "END_TURN" })}
            >
              <Icon name="endTurn" size={30} />
              <span>End turn</span>
            </button>
          ))}
      </div>
    </section>
  );
}
