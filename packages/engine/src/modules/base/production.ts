import { hexKey } from "../../board/hex";
import type { GameEvent, GameState, PlayerId } from "../../types";
import { TERRAIN_RESOURCE } from "./data";
import { buildingAt, handOf, transfer } from "./helpers";

/**
 * Pay out every hex with token `total` (and no robber): 1 per settlement, 2 per city.
 * Bank shortage: if the bank can't pay everyone owed a resource, nobody gets it,
 * unless only one player is owed it — they get whatever is left.
 */
export function produce(draft: GameState, total: number, events: GameEvent[] = []): void {
  const robber = Object.values(draft.pieces).find((p) => p.type === "robber");
  const robberHex = robber && "hex" in robber.at ? robber.at.hex : undefined;

  // owed[resource][player] = amount
  const owed: Record<string, Record<PlayerId, number>> = {};
  for (const hex of draft.map.hexes) {
    const key = hexKey(hex);
    const resource = TERRAIN_RESOURCE[hex.terrain];
    if (hex.token !== total || !resource || key === robberHex) continue;
    for (const vertex of draft.graph.hexVertices.get(key) ?? []) {
      const b = buildingAt(draft, vertex);
      if (!b?.owner) continue;
      const amount = b.type === "city" ? 2 : b.type === "settlement" ? 1 : 0;
      owed[resource] ??= {};
      owed[resource][b.owner] = (owed[resource][b.owner] ?? 0) + amount;
    }
  }

  const bank = draft.zones["bank"]!.contents;
  for (const [resource, byPlayer] of Object.entries(owed)) {
    const claimants = Object.entries(byPlayer).filter(([, n]) => n > 0);
    const totalOwed = claimants.reduce((sum, [, n]) => sum + n, 0);
    const available = bank[resource] ?? 0;

    if (totalOwed <= available) {
      for (const [p, n] of claimants) transfer(bank, handOf(draft, p), resource, n);
    } else if (claimants.length === 1) {
      const [p] = claimants[0]!;
      transfer(bank, handOf(draft, p), resource, available);
    } else {
      events.push({
        type: "BANK_SHORTAGE",
        text: `The bank is short of ${resource}; nobody receives it.`,
      });
      continue;
    }
    for (const [p, n] of claimants) {
      const got = claimants.length === 1 ? Math.min(n, available) : n;
      if (got > 0) events.push({ type: "PRODUCED", text: `${p} received ${got} ${resource}` });
    }
  }
}
