import { useState } from "react";
import { useGame } from "../game/store";

/**
 * Developer-only: start a local game where you act for every seat. Used to try rules and UI
 * changes without a server. Not included in production builds.
 */
export function DevSandbox() {
  const newGame = useGame((s) => s.newGame);
  const [count, setCount] = useState(4);
  const [seed, setSeed] = useState("");

  function start(e: React.FormEvent) {
    e.preventDefault();
    const names = Array.from({ length: count }, (_, i) => `Seat ${i + 1}`);
    newGame(names, seed.trim() || Math.random().toString(36).slice(2, 10));
  }

  return (
    <form className="start card" onSubmit={start}>
      <h1>Dev sandbox</h1>
      <p className="muted">
        A local game with the engine running in this tab. You act for whichever seat the game is
        waiting on. Online play replaces this in M4.
      </p>
      <fieldset className="count">
        <legend>Seats</legend>
        {[3, 4].map((n) => (
          <label key={n}>
            <input type="radio" name="count" checked={count === n} onChange={() => setCount(n)} />
            {n}
          </label>
        ))}
      </fieldset>
      <label className="field">
        <span>Seed (optional)</span>
        <input value={seed} placeholder="random" onChange={(e) => setSeed(e.target.value)} />
      </label>
      <button type="submit" className="primary">
        Start sandbox game
      </button>
    </form>
  );
}

/** What production builds show until online play exists. */
export function ComingSoon() {
  return (
    <div className="start card">
      <h1>Settlers Online</h1>
      <p className="muted">Online games with friends are on the way.</p>
    </div>
  );
}
