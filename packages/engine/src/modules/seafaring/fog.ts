import type { EdgeId, HexKey } from "../../board/graph";
import { hexNeighbors } from "../../board/hex";
import { reject } from "../../module";
import { nextInt } from "../../rng";
import type { GameEvent, GameState, PieceLocation, PlayerId, Rejection } from "../../types";
import { TERRAIN_RESOURCE } from "../base/data";
import { cardList, handOf, terrainAt, transfer } from "../base/helpers";
import { pushGoldChoice } from "./gold";
import { scenarioOf, seaState } from "./scenario";

/**
 * Fog (spec 016): face-down hexes. Each stays `terrain: "fog"` in the map until revealed; what it
 * becomes is drawn at that moment from the hidden zones `fog-terrain` and `fog-tokens`, so no view
 * can leak it.
 */
export const FOG = "fog";

/** Seafaring setup: put the scenario's face-down stacks in hidden zones. */
export function setupFog(draft: GameState): void {
  const fog = scenarioOf(draft).fog;
  if (!fog) return;
  draft.zones["fog-terrain"] = {
    id: "fog-terrain",
    visibility: "hidden",
    contents: { ...fog.terrain },
  };
  const tokens: Record<string, number> = {};
  for (const t of fog.tokens) tokens[String(t)] = (tokens[String(t)] ?? 0) + 1;
  draft.zones["fog-tokens"] = { id: "fog-tokens", visibility: "hidden", contents: tokens };
}

/** Land you can build on or rob: listed, not sea and not still face down. */
const knownLand = (state: GameState, hex: HexKey) => {
  const t = terrainAt(state, hex);
  return t !== undefined && t !== "sea" && t !== FOG;
};

/**
 * Until revealed, fog counts as sea: no settlement whose land is only fog, no road whose land
 * side is only fog, no robber on it. (Base counts every non-sea hex as land; this narrows it.)
 */
export function checkFog(state: GameState, pieceType: string, at: PieceLocation): Rejection | null {
  const fail = () => reject("ILLEGAL_PLACEMENT", "That hex hasn't been explored yet.");
  if ((pieceType === "settlement" || pieceType === "city") && "vertex" in at) {
    const hexes = state.graph.vertices.get(at.vertex)?.hexes ?? [];
    return hexes.some((h) => knownLand(state, h)) ? null : fail();
  }
  if (pieceType === "road" && "edge" in at) {
    const hexes = state.graph.edges.get(at.edge)?.hexes ?? [];
    return hexes.some((h) => knownLand(state, h)) ? null : fail();
  }
  if (pieceType === "robber" && "hex" in at) return knownLand(state, at.hex) ? null : fail();
  return null;
}

/** Draw one item from a hidden zone with the game RNG (sorted first, like the dev deck). */
function draw(draft: GameState, zoneId: string): string | undefined {
  const zone = draft.zones[zoneId]?.contents;
  if (!zone) return undefined;
  const items = cardList(zone);
  if (items.length === 0) return undefined;
  const pick = nextInt(draft.rng, items.length);
  draft.rng = pick.rng;
  const item = items[pick.value]!;
  zone[item] = (zone[item] ?? 0) - 1;
  return item;
}

/**
 * A road or ship landed on `edge`: reveal every fog hex at either of its corners, in hex-key
 * order. A revealed land hex gets a number token from the stack and pays the discovery reward.
 */
export function revealAround(
  draft: GameState,
  edge: EdgeId,
  player: PlayerId,
  events: GameEvent[],
): void {
  const fogged = new Set<HexKey>();
  for (const vertex of draft.graph.edges.get(edge)?.vertices ?? []) {
    for (const hex of draft.graph.vertices.get(vertex)?.hexes ?? []) {
      if (terrainAt(draft, hex) === FOG) fogged.add(hex);
    }
  }
  for (const hex of [...fogged].sort()) reveal(draft, hex, player, events);
}

function reveal(draft: GameState, hex: HexKey, player: PlayerId, events: GameEvent[]): void {
  const terrain = draw(draft, "fog-terrain") ?? "sea";
  const i = draft.graph.hexIndex.get(hex)!;
  const mapHex = draft.map.hexes[i]!;
  mapHex.terrain = terrain;
  delete mapHex.token;
  if (terrain !== "sea" && terrain !== "desert") {
    const token = draw(draft, "fog-tokens");
    if (token !== undefined) mapHex.token = Number(token);
  }
  const label = mapHex.token !== undefined ? `${terrain} (${mapHex.token})` : terrain;
  events.push({
    type: "REVEALED",
    text: `${player} discovered ${label}`,
    data: { player, hex, terrain, ...(mapHex.token !== undefined ? { token: mapHex.token } : {}) },
  });
  if (terrain === "sea") return;

  // The new land joins the region of land next to it, or is a region of its own.
  const sea = seaState(draft);
  if (!mapHex.region) {
    const [q, r] = hex.split(",").map(Number);
    const near = hexNeighbors({ q: q!, r: r! })
      .map((n) => sea.regionOf[`${n.q},${n.r}`])
      .find((x) => x !== undefined);
    sea.regionOf[hex] = near ?? `island:${hex}`;
  } else {
    sea.regionOf[hex] = mapHex.region;
  }

  if (!scenarioOf(draft).discoveryReward) return;
  if (terrain === "gold") {
    pushGoldChoice(draft, { [player]: 1 });
    return;
  }
  const resource = TERRAIN_RESOURCE[terrain];
  const bank = draft.zones["bank"]!.contents;
  if (resource && (bank[resource] ?? 0) > 0) {
    transfer(bank, handOf(draft, player), resource, 1);
    events.push({
      type: "DISCOVERY_REWARD",
      text: `${player} took 1 ${resource}`,
      data: { player, resource },
    });
  }
}
