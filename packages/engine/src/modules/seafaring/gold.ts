import { hexKey } from "../../board/hex";
import type { VertexId } from "../../board/graph";
import { reject, type ActionHandlers } from "../../module";
import { shuffle } from "../../rng";
import type { Decision, GameEvent, GameState, PlayerId, Resources } from "../../types";
import { BASE_RESOURCES } from "../base/data";
import {
  buildingAt,
  cardList,
  describe,
  handOf,
  popDecision,
  robberHex,
  transfer,
} from "../base/helpers";

const GOLD = "gold";

/** Cards a player picks now: what they're owed, or fewer if the bank has fewer cards left. */
function owedNow(state: GameState, player: PlayerId): number {
  const top = state.decisions.at(-1)!;
  const owed = (top.data?.["amounts"] as Record<PlayerId, number> | undefined)?.[player] ?? 0;
  const bank = cardList(state.zones["bank"]!.contents).length;
  return Math.min(owed, bank);
}

/** Push one GOLD_CHOICE step for everyone owed gold; they pick at the same time, like discards. */
export function pushGoldChoice(draft: GameState, amounts: Record<PlayerId, number>): void {
  const players = draft.players.filter((p) => (amounts[p] ?? 0) > 0);
  if (players.length === 0) return;
  const decision: Decision = {
    kind: "GOLD_CHOICE",
    actors: players,
    pendingFrom: [...players],
    allowed: ["CHOOSE_GOLD"],
    module: "seafaring",
    data: { amounts: Object.fromEntries(players.map((p) => [p, amounts[p]!])) },
    timer: "short",
  };
  draft.decisions.push(decision);
  // Anyone the bank can't pay at all has nothing to pick.
  decision.pendingFrom = decision.pendingFrom.filter((p) => owedNow(draft, p) > 0);
  if (decision.pendingFrom.length === 0) draft.decisions.pop();
}

/** Production: gold hexes with the rolled number (and no robber) owe a pick per building. */
export function produceGold(draft: GameState, total: number): void {
  const robber = robberHex(draft);
  const amounts: Record<PlayerId, number> = {};
  for (const hex of draft.map.hexes) {
    const key = hexKey(hex);
    if (hex.terrain !== GOLD || hex.token !== total || key === robber) continue;
    for (const vertex of draft.graph.hexVertices.get(key) ?? []) {
      const b = buildingAt(draft, vertex);
      if (!b?.owner) continue;
      const n = b.type === "city" ? 2 : b.type === "settlement" ? 1 : 0;
      amounts[b.owner] = (amounts[b.owner] ?? 0) + n;
    }
  }
  pushGoldChoice(draft, amounts);
}

/** A second starting settlement next to gold earns one pick per gold hex it touches. */
export function goldForStartingSettlement(
  draft: GameState,
  player: PlayerId,
  vertex: VertexId,
): void {
  let n = 0;
  for (const key of draft.graph.vertices.get(vertex)?.hexes ?? []) {
    const i = draft.graph.hexIndex.get(key);
    if (i !== undefined && draft.map.hexes[i]!.terrain === GOLD) n++;
  }
  if (n > 0) pushGoldChoice(draft, { [player]: n });
}

export const goldActions: ActionHandlers = {
  CHOOSE_GOLD: {
    validate(state, player, { resources }) {
      const need = owedNow(state, player);
      const bank = state.zones["bank"]!.contents;
      let total = 0;
      for (const [r, n] of Object.entries(resources)) {
        const known = (BASE_RESOURCES as readonly string[]).includes(r);
        if (!known || !Number.isInteger(n) || n < 0 || n > (bank[r] ?? 0)) {
          return reject("INVALID_CHOICE", `Pick ${need} cards the bank still has.`);
        }
        total += n;
      }
      return total === need ? null : reject("INVALID_CHOICE", `Pick exactly ${need} cards.`);
    },
    apply(draft, player, { resources }, { events }) {
      const bank = draft.zones["bank"]!.contents;
      const got: Resources = {};
      for (const [r, n] of Object.entries(resources)) {
        if (n > 0) {
          transfer(bank, handOf(draft, player), r, n);
          got[r] = n;
        }
      }
      events.push(goldEvent(player, got));
      const top = draft.decisions.at(-1)!;
      top.pendingFrom = top.pendingFrom.filter((p) => p !== player);
      // Others may now be owed less than before (the bank ran low): drop anyone with nothing left.
      top.pendingFrom = top.pendingFrom.filter((p) => owedNow(draft, p) > 0);
      if (top.pendingFrom.length === 0) popDecision(draft);
    },
    /** One example pick, chosen from a copy of the RNG (not advanced), like discards. */
    candidates(state, player) {
      const need = owedNow(state, player);
      if (need === 0) return [];
      const { result } = shuffle(cardList(state.zones["bank"]!.contents), state.rng);
      const resources: Resources = {};
      for (const r of result.slice(0, need)) resources[r] = (resources[r] ?? 0) + 1;
      return [{ type: "CHOOSE_GOLD", resources }];
    },
  },
};

function goldEvent(player: PlayerId, got: Resources): GameEvent {
  return {
    type: "PRODUCED",
    text: `${player} took ${describe(got)} from gold`,
    data: { player, resources: got, gold: true },
  };
}
