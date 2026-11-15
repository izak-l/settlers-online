import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { Worker } from "node:worker_threads";
import type { GameResult } from "./sim";

/** pnpm sim --games 10000 --seed 1 [--seats 4] [--max-turns 400] [--workers N] */
const { values } = parseArgs({
  options: {
    games: { type: "string", default: "100" },
    seed: { type: "string", default: "1" },
    seats: { type: "string", default: "4" },
    "max-turns": { type: "string", default: "400" },
    workers: { type: "string" },
  },
});

interface Failure {
  seed: string;
  step: number;
  detail: string;
  recent: string[];
}

const games = Number(values.games);
const seats = Number(values.seats);
const maxTurns = Number(values["max-turns"]);
const workers = Math.max(1, Math.min(Number(values.workers ?? availableParallelism() - 1), games));
const seeds = Array.from({ length: games }, (_, i) => `${values.seed}-${i}`);

const started = performance.now();
const results: GameResult[] = [];
const failures: Failure[] = [];
let done = 0;

await Promise.all(
  Array.from({ length: workers }, (_, w) => {
    const mine = seeds.filter((_, i) => i % workers === w);
    return new Promise<void>((resolve, reject) => {
      const worker = new Worker(new URL("./worker-entry.mjs", import.meta.url), {
        workerData: { seeds: mine, seats, maxTurns },
      });
      worker.on(
        "message",
        (msg: { ok: true; result: GameResult } | { ok: false; failure: Failure }) => {
          if (msg.ok) results.push(msg.result);
          else failures.push(msg.failure);
          done++;
          if (done % 1000 === 0) {
            const secs = ((performance.now() - started) / 1000).toFixed(0);
            console.log(`${done}/${games} games, ${failures.length} failures, ${secs}s`);
          }
        },
      );
      worker.on("error", reject);
      worker.on("exit", () => resolve());
    });
  }),
);

const secs = (performance.now() - started) / 1000;
const won = results.filter((r) => r.winner !== null);
const avgTurns = won.reduce((a, r) => a + r.turns, 0) / Math.max(1, won.length);
console.log(
  `\n${games} games on ${workers} workers in ${secs.toFixed(1)}s: ${won.length} won, ` +
    `${results.length - won.length} hit the ${maxTurns}-turn cap, ${failures.length} failed. ` +
    `Average winning game: ${avgTurns.toFixed(0)} turns.`,
);
for (const f of failures.slice(0, 10)) {
  console.log(
    `\nFAIL seed ${f.seed}, action ${f.step}: ${f.detail}\n  last actions:\n    ${f.recent.join("\n    ")}`,
  );
}
if (failures.length > 0) {
  console.log("\nEach failing seed should become a regression test (see CLAUDE.md).");
  process.exitCode = 1;
}
