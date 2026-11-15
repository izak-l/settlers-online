import { Board } from "./board/Board";
import { useGame } from "./game/store";
import { ActionBar } from "./ui/ActionBar";
import { ComingSoon, DevSandbox } from "./ui/DevSandbox";
import { GameLog } from "./ui/GameLog";
import { HandPanel } from "./ui/HandPanel";
import { PlayersPanel } from "./ui/PlayersPanel";

export function App() {
  const { snap, seats, mode, send, quit } = useGame();
  if (!snap) return import.meta.env.DEV ? <DevSandbox /> : <ComingSoon />;

  const seat = seats.find((s) => s.id === snap.seat);

  return (
    <div className="app">
      <header className="topbar">
        <strong>Settlers Online</strong>
        <span className="badge">Dev sandbox</span>
        <span className="muted">
          {snap.view.turn.number === 0 ? "Setup" : `Turn ${snap.view.turn.number}`}
        </span>
        {seat && (
          <span className="whose">
            Acting as <span className="swatch" style={{ background: seat.color }} /> {seat.name}
          </span>
        )}
        <button className="link" onClick={quit}>
          New sandbox game
        </button>
      </header>
      <main className="layout">
        <div className="board-wrap">
          <Board snap={snap} seats={seats} mode={mode} onAction={send} />
        </div>
        <aside className="side">
          <PlayersPanel snap={snap} seats={seats} />
          <ActionBar snap={snap} />
          <HandPanel snap={snap} />
          <GameLog snap={snap} seats={seats} />
        </aside>
      </main>
    </div>
  );
}
