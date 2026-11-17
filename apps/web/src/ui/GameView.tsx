import { useEffect, useState } from "react";
import type { Action } from "@settlers/engine";
import { useSession } from "../app/session";
import { useSounds } from "../audio/useSounds";
import { Board } from "../board/Board";
import { HandDock } from "../cards/HandDock";
import { pickResetKey, startPick, type Pick } from "../cards/picking";
import type { GameClient, Snapshot } from "../game/LocalGame";
import { errorText, seatsOf, type BuildMode } from "../game/seats";
import { ActionBar } from "./ActionBar";
import { BankPanel } from "./BankPanel";
import { GameLog } from "./GameLog";
import { PlayersPanel } from "./PlayersPanel";
import { SettingsMenu } from "./SettingsMenu";
import { useUiScale } from "./uiScale";

/** The board and panels for any GameClient: online (SocketGame) or the dev sandbox (LocalGame). */
export function GameView({
  client,
  onExit,
  exitLabel = "Exit game",
}: {
  client: GameClient;
  /** The menu's way out: home for online games (the seat is kept), the picker in the sandbox. */
  onExit: () => void;
  exitLabel?: string;
}) {
  const [fitArea, setFitArea] = useState<HTMLDivElement | null>(null);
  // Spec 232: the panels are laid out at one design size and scaled to the window as a whole.
  const [frame, setFrame] = useState<HTMLElement | null>(null);
  const scale = useUiScale(frame);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [mode, setMode] = useState<BuildMode>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => client.subscribe(setSnap), [client]);
  useSounds(
    snap,
    client,
    useSession((s) => s.me?.id),
  );

  // Cards being picked belong to one decision: start over whenever a new one starts (not when
  // someone else answers the same one, e.g. finishes their discard: bug #1).
  const top = snap?.view.decisions.at(-1);
  const decisionKey = snap ? pickResetKey(snap) : "";
  useEffect(() => setPick(null), [decisionKey]);

  async function send(action: Action) {
    if (busy) return;
    setBusy(true);
    try {
      const err = await client.send(action);
      setError(err ? errorText(err.code, err.message) : null);
      if (!err) {
        setMode(null);
        setPick(null);
      }
    } catch {
      setError("The server didn't answer. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!snap) return <p className="center muted">Loading game…</p>;
  const seats = seatsOf(snap);
  const playing = snap.seat !== "spectator";

  // A discard you owe opens the picking tray by itself.
  const owed =
    top?.kind === "DISCARD" && playing && top.pendingFrom.includes(snap.seat)
      ? ((top.data?.["amounts"] as Record<string, number> | undefined)?.[snap.seat] ?? 0)
      : 0;
  // So does a gold pick: as many as you're owed, or what the bank has left (the engine's rule).
  const bankLeft = Object.values(snap.view.zones["bank"]?.contents ?? {}).reduce(
    (a, b) => a + b,
    0,
  );
  const goldOwed =
    top?.kind === "GOLD_CHOICE" && playing && top.pendingFrom.includes(snap.seat)
      ? Math.min(
          (top.data?.["amounts"] as Record<string, number> | undefined)?.[snap.seat] ?? 0,
          bankLeft,
        )
      : 0;
  const activePick =
    owed > 0
      ? pick?.purpose === "discard"
        ? pick
        : startPick("discard", { giveLimit: owed })
      : goldOwed > 0
        ? pick?.purpose === "gold"
          ? pick
          : startPick("gold", { wantLimit: goldOwed })
        : pick;

  const actions = (
    <ActionBar
      snap={snap}
      seats={seats}
      mode={mode}
      setMode={setMode}
      send={(a) => void send(a)}
      pick={activePick}
      setPick={setPick}
      error={error}
    />
  );

  return (
    // The map stays outside the scaled layer: it already fits itself to the screen.
    <main
      className="layout-frame"
      ref={setFrame}
      style={{ "--ui-scale": scale } as React.CSSProperties}
    >
      <div className="board-wrap">
        <Board
          fitArea={fitArea}
          snap={snap}
          seats={seats}
          mode={mode}
          onAction={(a) => void send(a)}
        />
      </div>
      <div className="layout">
        <div className="board-space" ref={setFitArea} aria-hidden="true" />
        <SettingsMenu onExit={onExit} exitLabel={exitLabel} />
        {/* Spec 232: your cards on the left, the status and action buttons on the right. */}
        <div className="bottom-dock">
          {playing && (
            <HandDock snap={snap} pick={activePick} setPick={setPick} send={(a) => void send(a)} />
          )}
          {actions}
        </div>
        <aside className="side">
          {snap.view.winner !== undefined && (
            <section className="panel winner" role="status">
              <h2>
                {seats.find((s) => s.id === snap.view.winner)?.name ?? snap.view.winner} wins!
              </h2>
              {/* A scenario's own ending (spec 019: the villages ran out of cloth). */}
              {snap.log.some((e) => e.type === "VILLAGES_EMPTY") && (
                <p>Five villages ran out of cloth, so the most victory points won.</p>
              )}
              <p className="muted">
                Final scores: {seats.map((s) => `${s.name} ${snap.scores[s.id] ?? 0}`).join(" · ")}
              </p>
              <a href="#/">Back home</a>
            </section>
          )}
          {!playing && <p className="panel muted">You're watching. Hands are hidden.</p>}
          <GameLog snap={snap} seats={seats} client={client} />
          <BankPanel snap={snap} />
          <PlayersPanel snap={snap} seats={seats} />
        </aside>
      </div>
    </main>
  );
}
