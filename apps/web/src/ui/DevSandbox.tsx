import { useMemo, useState } from "react";
import { LocalGame } from "../game/LocalGame";
import { GameView } from "./GameView";

/**
 * Developer-only: a local game where you act for whichever seat is being waited on.
 * Used to try rules and UI changes without a server. Not part of production builds.
 */
export function DevSandbox() {
  const [count, setCount] = useState(4);
  const [seed, setSeed] = useState("");
  const [started, setStarted] = useState<{ count: number; seed: string } | null>(null);
  const client = useMemo(
    () =>
      started
        ? new LocalGame(
            Array.from({ length: started.count }, (_, i) => `Seat ${i + 1}`),
            started.seed,
          )
        : null,
    [started],
  );

  if (client) return <GameView client={client} />;

  return (
    <form
      className="start card stack"
      onSubmit={(e) => {
        e.preventDefault();
        setStarted({ count, seed: seed.trim() || Math.random().toString(36).slice(2, 10) });
      }}
    >
      <h1>Dev sandbox</h1>
      <p className="muted">
        A local game with the engine running in this tab. You act for whichever seat the game is
        waiting on.
      </p>
      <fieldset className="count">
        <legend>Seats</legend>
        {[1, 2, 3, 4].map((n) => (
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
