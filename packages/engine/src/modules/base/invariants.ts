import { computeVP, viewFor } from "../../engine";
import type { GameState } from "../../types";
import { awardVP } from "./awards";
import { BANK_START, BASE_RESOURCES, DEV_DECK, PIECE_LIMITS } from "./data";
import { countOwned } from "./helpers";
import { vpCards } from "./devcards";

const DEV_TOTAL = Object.values(DEV_DECK).reduce((a, b) => a + b, 0);

/**
 * Everything that must hold after every action in a base game (CLAUDE.md "Testing invariants").
 * Returns a list of violations; empty means all good. Shared by the engine tests and tools/sim.
 */
export function baseInvariantViolations(
  state: GameState,
  opts: { views?: boolean } = {},
): string[] {
  const out: string[] = [];

  for (const r of BASE_RESOURCES) {
    let total = state.zones["bank"]!.contents[r] ?? 0;
    for (const p of state.players) total += state.zones[`hand-${p}`]!.contents[r] ?? 0;
    if (total !== BANK_START) out.push(`${r}: bank + hands = ${total}, expected ${BANK_START}`);
  }

  for (const zone of Object.values(state.zones)) {
    for (const [item, n] of Object.entries(zone.contents)) {
      if (!Number.isInteger(n) || n < 0) out.push(`${zone.id}.${item} = ${n}`);
    }
  }

  let dev = 0;
  for (const zone of Object.values(state.zones)) {
    if (zone.id === "devdeck" || /^(dev|devnew|played)-/.test(zone.id)) {
      dev += Object.values(zone.contents).reduce((a, b) => a + b, 0);
    }
  }
  if (dev !== DEV_TOTAL) out.push(`dev cards: ${dev}, expected ${DEV_TOTAL}`);

  for (const p of state.players) {
    for (const [type, limit] of Object.entries(PIECE_LIMITS)) {
      const n = countOwned(state, p, type);
      if (n > limit) out.push(`${p} has ${n} ${type}s (limit ${limit})`);
    }
    const expected =
      countOwned(state, p, "settlement") +
      2 * countOwned(state, p, "city") +
      vpCards(state, p) +
      awardVP(state, p);
    const vp = computeVP(state, p);
    if (vp !== expected)
      out.push(`${p} VP ${vp}, expected ${expected} from pieces, cards and awards`);
  }

  if (state.winner === undefined && state.decisions.length === 0)
    out.push("decision stack is empty");

  // Redaction: nobody sees another player's hand or dev cards, nor the deck or the RNG.
  // (Building every view is the slow part; the fuzzer does it every few actions.)
  if (opts.views === false) return out;
  for (const viewer of [...state.players, "spectator" as const]) {
    const view = viewFor(state, viewer);
    if ("rng" in view) out.push(`view for ${viewer} contains rng`);
    if (view.zones["devdeck"]?.contents) out.push(`view for ${viewer} shows the dev deck`);
    for (const p of state.players) {
      if (p === viewer) continue;
      for (const z of [`hand-${p}`, `dev-${p}`, `devnew-${p}`]) {
        if (view.zones[z]?.contents) out.push(`view for ${viewer} shows ${z}`);
      }
    }
  }
  return out;
}
