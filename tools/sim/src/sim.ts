import {
  apply,
  baseInvariantViolations,
  BASE_RESOURCES,
  createGame,
  fromSnapshot,
  legalActions,
  nextInt,
  seedFromString,
  toSnapshot,
  type Action,
  type GameState,
  type PlayerId,
  type RngState,
} from "@settlers/engine";
import { DEFAULT_MAP_ID, findMap, generateMap } from "@settlers/maps";

export interface GameResult {
  seed: string;
  /** Catalog id of the map played. */
  map: string;
  winner: PlayerId | null;
  turns: number;
  actions: number;
}

export class SimFailure extends Error {
  constructor(
    readonly seed: string,
    readonly step: number,
    readonly detail: string,
    readonly recent: string[],
  ) {
    super(`seed ${seed}, action ${step}: ${detail}`);
  }
}

/** The bots' own RNG: separate from the game's, so bot choices never touch game state. */
class BotRng {
  constructor(private state: RngState) {}
  int(n: number): number {
    const r = nextInt(this.state, n);
    this.state = r.rng;
    return r.value;
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)]!;
  }
  chance(p: number): boolean {
    return this.int(1000) < p * 1000;
  }
}

/** A random discard of exactly the required size (legalActions only offers one example). */
function randomDiscard(state: GameState, player: PlayerId, rng: BotRng): Action {
  const owed = (state.decisions.at(-1)!.data!["amounts"] as Record<string, number>)[player]!;
  const cards = Object.entries(state.zones[`hand-${player}`]!.contents).flatMap(([r, n]) =>
    Array<string>(n).fill(r),
  );
  const resources: Record<string, number> = {};
  for (let i = 0; i < owed; i++) {
    const [card] = cards.splice(rng.int(cards.length), 1);
    resources[card!] = (resources[card!] ?? 0) + 1;
  }
  return { type: "DISCARD", resources };
}

/** A random 1–2 for 1–2 offer from what the player holds. */
function randomOffer(state: GameState, player: PlayerId, rng: BotRng): Action | null {
  const hand = state.zones[`hand-${player}`]!.contents;
  const have = BASE_RESOURCES.filter((r) => (hand[r] ?? 0) > 0);
  if (have.length === 0) return null;
  const give = rng.pick(have);
  const want = rng.pick(BASE_RESOURCES.filter((r) => r !== give));
  return {
    type: "OFFER_TRADE",
    give: { [give]: Math.min(hand[give]!, 1 + rng.int(2)) },
    want: { [want]: 1 + rng.int(2) },
  };
}

/**
 * Choose an action for whoever is pending. Weighted so games actually finish:
 * build and buy when possible, trade sometimes, end the turn otherwise.
 */
function chooseAction(state: GameState, rng: BotRng): { player: PlayerId; action: Action } {
  const top = state.decisions.at(-1)!;
  const player = rng.pick(top.pendingFrom);
  const legal = legalActions(state, player);
  if (legal.length === 0)
    throw new Error(`${player} is pending during ${top.kind} but has no legal action`);

  if (top.kind === "DISCARD") return { player, action: randomDiscard(state, player, rng) };

  if (top.kind === "TRADE_OFFER") {
    const offerer = (top.data as { from: string }).from;
    if (player === offerer) {
      const confirm = legal.filter((a) => a.type === "CONFIRM_TRADE");
      if (confirm.length > 0) return { player, action: rng.pick(confirm) };
      // Nobody has accepted yet: wait a bit (let others respond), else cancel.
      const others = top.pendingFrom.filter((p) => p !== offerer);
      if (rng.chance(0.7) && others.length > 0) return chooseAction(state, rng);
      return { player, action: { type: "CANCEL_TRADE" } };
    }
    return { player, action: rng.pick(legal) };
  }

  // Prefer whatever scores: cities, then settlements, then dev cards, then roads.
  for (const [type, p] of [
    ["BUILD_CITY", 0.95],
    ["BUILD_SETTLEMENT", 0.95],
    ["BUY_DEV_CARD", 0.6],
    ["BUILD_ROAD", 0.7],
  ] as const) {
    const options = legal.filter((a) => a.type === type);
    if (options.length > 0 && rng.chance(p)) return { player, action: rng.pick(options) };
  }
  const plays = legal.filter((a) => a.type.startsWith("PLAY_"));
  const bank = legal.filter((a) => a.type === "BANK_TRADE");
  if (plays.length > 0 && rng.chance(0.4)) return { player, action: rng.pick(plays) };
  if (bank.length > 0 && rng.chance(0.6)) return { player, action: rng.pick(bank) };
  // Offers are built here (too many to list), but only when the engine lists one as possible,
  // which it doesn't with nobody else in the game.
  if (legal.some((a) => a.type === "OFFER_TRADE") && rng.chance(0.05)) {
    const offer = randomOffer(state, player, rng);
    if (offer) return { player, action: offer };
  }
  const end = legal.find((a) => a.type === "END_TURN" || a.type === "ROLL");
  return { player, action: end ?? rng.pick(legal) };
}

/** Reverse every object's key order, as a database might return it. */
function scrambleKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(scrambleKeys) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .reverse()
        .map(([k, v]) => [k, scrambleKeys(v)]),
    ) as T;
  }
  return value;
}

const comparable = (s: GameState) => JSON.stringify(sortKeys(toSnapshot(s)));
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/**
 * Play one seeded game with random bots, checking every invariant after every action.
 * At the end: replay the whole log from the seed, and resume from a mid-game snapshot with
 * scrambled key order; both must reproduce the final state exactly.
 */
export function playGame(
  seed: string,
  opts: { seats?: number; maxTurns?: number; map?: string } = {},
): GameResult {
  const seats = Array.from({ length: opts.seats ?? 4 }, (_, i) => `p${i}`);
  const maxTurns = opts.maxTurns ?? 400;
  const mapId = opts.map ?? DEFAULT_MAP_ID;
  const def = findMap(mapId)?.def;
  if (!def) throw new Error(`Unknown map: ${mapId}`);
  const { map } = generateMap(def, seedFromString(`${seed}:map`));
  const start = createGame(map, { modules: def.modules }, seats, seed);
  const bots = new BotRng(seedFromString(`${seed}:bots`));

  const log: { player: PlayerId; action: Action }[] = [];
  const recent = () => log.slice(-8).map((l) => `${l.player} ${JSON.stringify(l.action)}`);
  let state = start;
  let midSnapshot: { at: number; snap: ReturnType<typeof toSnapshot> } | null = null;

  while (state.winner === undefined && state.turn.number <= maxTurns) {
    const { player, action } = chooseAction(state, bots);
    const res = apply(state, player, action);
    if (!res.ok) {
      // Bots only send legal actions (or valid random discards/offers); a rejection is a bug.
      throw new SimFailure(
        seed,
        log.length,
        `rejected ${action.type}: ${res.code} ${res.message}`,
        recent(),
      );
    }
    log.push({ player, action });
    state = res.state;
    const problems = baseInvariantViolations(state, {
      views: log.length % 20 === 0 || state.winner !== undefined,
    });
    if (problems.length > 0) throw new SimFailure(seed, log.length, problems.join("; "), recent());
    if (!midSnapshot && state.turn.number >= 20) {
      midSnapshot = {
        at: log.length,
        snap: scrambleKeys(JSON.parse(JSON.stringify(toSnapshot(state)))),
      };
    }
  }

  // Replay from the seed.
  let replay = start;
  for (const [i, { player, action }] of log.entries()) {
    const res = apply(replay, player, action);
    if (!res.ok)
      throw new SimFailure(seed, i, `replay rejected ${action.type}: ${res.code}`, recent());
    replay = res.state;
  }
  if (comparable(replay) !== comparable(state)) {
    throw new SimFailure(
      seed,
      log.length,
      "replaying the log from the seed gave a different final state",
      recent(),
    );
  }

  // Resume from a stored-looking snapshot.
  if (midSnapshot) {
    let resumed = fromSnapshot(midSnapshot.snap);
    for (const { player, action } of log.slice(midSnapshot.at)) {
      const res = apply(resumed, player, action);
      if (!res.ok)
        throw new SimFailure(
          seed,
          log.length,
          `resume rejected ${action.type}: ${res.code}`,
          recent(),
        );
      resumed = res.state;
    }
    if (comparable(resumed) !== comparable(state)) {
      throw new SimFailure(
        seed,
        log.length,
        "resuming from a snapshot gave a different final state",
        recent(),
      );
    }
  }

  return {
    seed,
    map: mapId,
    winner: state.winner ?? null,
    turns: state.turn.number,
    actions: log.length,
  };
}
