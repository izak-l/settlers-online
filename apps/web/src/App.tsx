import { Board } from "./board/Board";
import { useGame } from "./game/store";
import { ActionBar } from "./ui/ActionBar";
import { GameLog } from "./ui/GameLog";
import { HandPanel } from "./ui/HandPanel";
import { NewGame } from "./ui/NewGame";
import { PassDevice } from "./ui/PassDevice";
import { PlayersPanel } from "./ui/PlayersPanel";

export function App() {
  const { snap, seats, mode, send, handoffTo, quit } = useGame();
  if (!snap) return <NewGame />;

  const seat = seats.find((s) => s.id === snap.seat);
  const hidden = handoffTo !== null;

  return (
    <div className="app">
      <header className="topbar">
        <strong>Settlers Online</strong>
        <span className="muted">
          {snap.view.turn.number === 0 ? "Setup" : `Turn ${snap.view.turn.number}`}
        </span>
        {seat && (
          <span className="whose">
            <span className="swatch" style={{ background: seat.color }} /> {seat.name}
          </span>
        )}
        <button className="link" onClick={() => confirm("Abandon this game?") && quit()}>
          New game
        </button>
      </header>
      <main className="layout">
        <div className="board-wrap">
          <Board snap={snap} seats={seats} mode={hidden ? null : mode} onAction={send} />
        </div>
        <aside className="side">
          <PlayersPanel snap={snap} seats={seats} />
          {!hidden && <ActionBar snap={snap} />}
          {!hidden && <HandPanel snap={snap} />}
          <GameLog snap={snap} seats={seats} />
        </aside>
      </main>
      {hidden && <PassDevice />}
    </div>
  );
}
