import { useEffect, useState } from "react";
import type { Action } from "@settlers/engine";
import { Board } from "../board/Board";
import type { GameClient, Snapshot } from "../game/LocalGame";
import { errorText, seatsOf, type BuildMode } from "../game/seats";
import { ActionBar } from "./ActionBar";
import { DevCards } from "./DevCards";
import { TradePanel } from "./TradePanel";
import { GameLog } from "./GameLog";
import { HandPanel } from "./HandPanel";
import { PlayersPanel } from "./PlayersPanel";

/** The board and panels for any GameClient: online (SocketGame) or the dev sandbox (LocalGame). */
export function GameView({ client }: { client: GameClient }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [mode, setMode] = useState<BuildMode>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => client.subscribe(setSnap), [client]);

  async function send(action: Action) {
    if (busy) return;
    setBusy(true);
    try {
      const err = await client.send(action);
      setError(err ? errorText(err.code, err.message) : null);
      if (!err) setMode(null);
    } catch {
      setError("The server didn't answer. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!snap) return <p className="center muted">Loading game…</p>;
  const seats = seatsOf(snap);
  const playing = snap.seat !== "spectator";

  return (
    <main className="layout">
      <div className="board-wrap">
        <Board snap={snap} seats={seats} mode={mode} onAction={(a) => void send(a)} />
      </div>
      <aside className="side">
        {snap.view.winner !== undefined && (
          <section className="panel winner" role="status">
            <h2>{seats.find((s) => s.id === snap.view.winner)?.name ?? snap.view.winner} wins!</h2>
            <p className="muted">
              Final scores: {seats.map((s) => `${s.name} ${snap.scores[s.id] ?? 0}`).join(" · ")}
            </p>
            <a href="#/">Back home</a>
          </section>
        )}
        {!playing && <p className="panel muted">You're watching. Hands are hidden.</p>}
        <PlayersPanel snap={snap} seats={seats} />
        <ActionBar
          snap={snap}
          seats={seats}
          mode={mode}
          setMode={setMode}
          send={(a) => void send(a)}
          error={error}
        />
        {playing && <HandPanel snap={snap} />}
        {playing && <DevCards snap={snap} send={(a) => void send(a)} />}
        {playing && <TradePanel snap={snap} send={(a) => void send(a)} />}
        <GameLog snap={snap} seats={seats} />
      </aside>
    </main>
  );
}
