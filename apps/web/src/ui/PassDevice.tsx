import { useGame } from "../game/store";

export function PassDevice() {
  const { handoffTo, seats, confirmHandoff } = useGame();
  const seat = seats.find((s) => s.id === handoffTo);
  if (!seat) return null;
  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="card handoff">
        <span className="swatch big" style={{ background: seat.color }} />
        <h2>Pass to {seat.name}</h2>
        <p className="muted">Hands stay hidden until the right player is holding the device.</p>
        <button className="primary" autoFocus onClick={confirmHandoff}>
          I'm {seat.name}, show my turn
        </button>
      </div>
    </div>
  );
}
