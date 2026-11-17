import type { Snapshot } from "../game/LocalGame";

/** Pip positions on a 3×3 grid (0–8, row by row) for each face. */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function Die({ n, die }: { n: number; die: string }) {
  return (
    <span className={`die die-${die}`} role="img" aria-label={String(n)}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={PIPS[n]?.includes(i) ? "pip on" : "pip"} />
      ))}
    </span>
  );
}

/**
 * The last roll, drawn large over the map's corner (spec 232). When it's your roll, the dice
 * are a button too: click them to roll (before the first roll they show a blank pair).
 */
export function BoardDice({ snap, onRoll }: { snap: Snapshot; onRoll?: (() => void) | undefined }) {
  const lastRoll = (
    snap.view.moduleState["base"] as { lastRoll?: Record<string, number> } | undefined
  )?.lastRoll;
  const shown = lastRoll && snap.view.turn.number > 0 ? lastRoll : null;
  if (!shown && !onRoll) return null;
  // Blank faces (no pips) until the first roll.
  const faces = shown ?? { red: 0, yellow: 0 };
  const sum = Object.values(faces).reduce((a, b) => a + b, 0);
  const dice = Object.entries(faces).map(([die, n]) => <Die key={die} die={die} n={n} />);
  // Remount on every roll so the roll animation plays again.
  const key = snap.log.filter((e) => e.type === "ROLLED").length;
  return onRoll ? (
    <button
      key={key}
      className="dice board-dice rollable"
      onClick={onRoll}
      aria-label="Roll dice"
      title="Roll dice"
    >
      {dice}
    </button>
  ) : (
    <div key={key} className="dice board-dice" role="status" aria-label={`Last roll: ${sum}`}>
      {dice}
    </div>
  );
}
