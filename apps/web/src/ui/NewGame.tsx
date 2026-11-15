import { useState } from "react";
import { useGame } from "../game/store";

const DEFAULT_NAMES = ["Ada", "Basil", "Cleo", "Dev"];

export function NewGame() {
  const newGame = useGame((s) => s.newGame);
  const [count, setCount] = useState(4);
  const [names, setNames] = useState(DEFAULT_NAMES);
  const [seed, setSeed] = useState("");

  function start(e: React.FormEvent) {
    e.preventDefault();
    const chosen = names.slice(0, count).map((n, i) => n.trim() || `Player ${i + 1}`);
    newGame(chosen, seed.trim() || Math.random().toString(36).slice(2, 10));
  }

  return (
    <form className="new-game card" onSubmit={start}>
      <h1>Settlers Online</h1>
      <p className="muted">Hot-seat game on one screen. Pass the device when prompted.</p>

      <fieldset className="count">
        <legend>Players</legend>
        {[3, 4].map((n) => (
          <label key={n}>
            <input type="radio" name="count" checked={count === n} onChange={() => setCount(n)} />
            {n}
          </label>
        ))}
      </fieldset>

      {names.slice(0, count).map((name, i) => (
        <label key={i} className="field">
          <span>Seat {i + 1}</span>
          <input
            value={name}
            maxLength={16}
            onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))}
          />
        </label>
      ))}

      <label className="field">
        <span>Seed (optional)</span>
        <input value={seed} placeholder="random" onChange={(e) => setSeed(e.target.value)} />
      </label>

      <button type="submit" className="primary">
        Start game
      </button>
    </form>
  );
}
