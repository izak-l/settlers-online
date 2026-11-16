import { parentPort, workerData } from "node:worker_threads";
import type { FeatureOverrides } from "@settlers/engine";
import { playGame, SimFailure } from "./sim";

/** Plays the seeds it's given and reports each result (or failure) back to the main thread. */
const { seeds, seats, maxTurns, map, features } = workerData as {
  seeds: string[];
  seats: number;
  maxTurns: number;
  map: string;
  features: FeatureOverrides;
};
for (const seed of seeds) {
  try {
    parentPort!.postMessage({
      ok: true,
      result: playGame(seed, { seats, maxTurns, map, features }),
    });
  } catch (err) {
    const f =
      err instanceof SimFailure
        ? { seed: err.seed, step: err.step, detail: err.detail, recent: err.recent }
        : { seed, step: -1, detail: String(err instanceof Error ? err.stack : err), recent: [] };
    parentPort!.postMessage({ ok: false, failure: f });
  }
}
