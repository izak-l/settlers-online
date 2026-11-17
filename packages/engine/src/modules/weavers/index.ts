import type { VertexId } from "../../board/graph";
import { reject, runVpSources, type RulesModule } from "../../module";
import type { GameEvent, GameState, PlayerId } from "../../types";
import { activePlayerWins } from "../base";
import { decision, transfer } from "../base/helpers";
import { seaState } from "../seafaring/scenario";
import { onClosedRoute, ownBuildingCorners, reach } from "./routes";

const MODULE_ID = "sf-weavers";
/** Rulebook amounts: cloth next to each village at the start, and in the general supply. */
const CLOTH_PER_VILLAGE = 5;
const CLOTH_SUPPLY = 10;
/** The game ends at the end of a turn with this many villages out of cloth. */
const EMPTY_VILLAGES_TO_END = 5;

interface Village {
  id: string;
  vertex: VertexId;
  token: number;
}

/** What Weavers' Isles keeps in `moduleState["sf-weavers"]`. */
export interface WeaversState {
  /** Village id → players trading with it, in the order they connected. */
  trading: Record<string, PlayerId[]>;
  /** Regions with a village (the small islands): no settlements, no robber. */
  villageRegions: string[];
  /** Set at the end of a turn with enough villages out of cloth: the game ends on VP. */
  ended: boolean;
}

const weavers = (s: GameState) => s.moduleState[MODULE_ID] as WeaversState;

/** The villages: number tokens on corners, from the map's `village` markers. */
export function villages(state: GameState): Village[] {
  return (state.map.markers ?? []).flatMap((m) =>
    m.kind === "village" && "vertex" in m.at && typeof m.data?.["token"] === "number"
      ? [{ id: m.id, vertex: m.at.vertex, token: m.data["token"] }]
      : [],
  );
}

const clothZone = (owner: string) => `cloth-${owner}`;
export const clothOf = (state: GameState, owner: string): number =>
  state.zones[clothZone(owner)]?.contents["cloth"] ?? 0;

function moveCloth(draft: GameState, from: string, to: string): void {
  transfer(
    draft.zones[clothZone(from)]!.contents,
    draft.zones[clothZone(to)]!.contents,
    "cloth",
    1,
  );
}

/** Does `vertex` or `hex` belong to one of the small islands (regions with a village)? */
function onVillageIsland(state: GameState, hexes: string[]): boolean {
  const { regionOf } = seaState(state);
  const regions = weavers(state).villageRegions;
  return hexes.some((h) => regions.includes(regionOf[h] ?? ""));
}

/** A player's buildings now reach new villages: trade opens, and they take 1 cloth from each. */
function openTrade(draft: GameState, player: PlayerId, events: GameEvent[]): void {
  const reached = reach(draft, player, ownBuildingCorners(draft, player));
  const state = weavers(draft);
  for (const village of villages(draft)) {
    const traders = (state.trading[village.id] ??= []);
    if (traders.includes(player) || !reached.has(village.vertex)) continue;
    traders.push(player);
    const took = clothOf(draft, village.id) > 0;
    if (took) moveCloth(draft, village.id, player);
    events.push({
      type: "VILLAGE_TRADE",
      text: `${player} opened trade with a village${took ? " and took 1 cloth" : ""}`,
      data: { player, village: village.id },
    });
  }
}

/** The winner when the game ends on VP: most VP, then most cloth, then seat order. */
function mostVP(state: GameState, modules: RulesModule[]): PlayerId {
  const score = (p: PlayerId) => [runVpSources(modules, state, p, true), clothOf(state, p)];
  return [...state.players].sort((a, b) => {
    const [va, ca] = score(a);
    const [vb, cb] = score(b);
    return vb! - va! || cb! - ca!;
  })[0]!;
}

/**
 * Scenario 6, Weavers' Isles (spec 019), on top of seafaring: three starting settlements, villages
 * on the small islands that weave cloth for the players trading with them (2 cloth = 1 VP), closed
 * ship routes, robber and pirate limits, and an ending when five villages run out of cloth.
 */
export const weaversModule: RulesModule = {
  id: MODULE_ID,
  version: 1,
  dependsOn: ["seafaring"],
  invariants(state) {
    const out: string[] = [];
    const vp: Record<PlayerId, number> = {};
    let total = clothOf(state, "supply");
    for (const v of villages(state)) total += clothOf(state, v.id);
    for (const p of state.players) {
      total += clothOf(state, p);
      vp[p] = Math.floor(clothOf(state, p) / 2);
    }
    const expected = CLOTH_PER_VILLAGE * villages(state).length + CLOTH_SUPPLY;
    if (total !== expected) out.push(`cloth: ${total}, expected ${expected}`);
    return { violations: out, vp };
  },
  setup(draft) {
    const vs = villages(draft);
    const { regionOf } = seaState(draft);
    const regions = new Set<string>();
    for (const v of vs)
      for (const h of draft.graph.vertices.get(v.vertex)?.hexes ?? [])
        if (regionOf[h]) regions.add(regionOf[h]);
    draft.moduleState[MODULE_ID] = {
      trading: {},
      villageRegions: [...regions].sort(),
      ended: false,
    } satisfies WeaversState;

    const zone = (owner: string, n: number) =>
      (draft.zones[clothZone(owner)] = {
        id: clothZone(owner),
        ...(draft.players.includes(owner) ? { owner } : {}),
        visibility: "public",
        contents: { cloth: n },
      });
    for (const v of vs) zone(v.id, CLOTH_PER_VILLAGE);
    zone("supply", CLOTH_SUPPLY);
    for (const p of draft.players) zone(p, 0);

    // Three starting settlements: two snake rounds that pay nothing, then a third round in seat
    // order whose settlement takes the starting resources.
    const n = draft.players.length;
    const order = [...draft.players, ...[...draft.players].reverse(), ...draft.players];
    const steps = order.flatMap((p, i) => {
      const round = Math.floor(i / n) + 1;
      const data = { round, resources: round === 3 };
      return [
        decision("PLACE_SETTLEMENT", p, ["PLACE_SETTLEMENT"], data),
        decision("PLACE_ROAD", p, ["PLACE_ROAD"], data),
      ];
    });
    draft.decisions = [draft.decisions[0]!, ...steps.reverse()];
  },
  hooks: {
    vpSources: (state, player) => Math.floor(clothOf(state, player) / 2),
    produce(draft, total, events) {
      const state = weavers(draft);
      for (const village of villages(draft)) {
        if (village.token !== total || clothOf(draft, village.id) === 0) continue;
        for (const p of draft.players) {
          if (!state.trading[village.id]?.includes(p)) continue;
          const from = clothOf(draft, village.id) > 0 ? village.id : "supply";
          if (clothOf(draft, from) === 0) continue;
          moveCloth(draft, from, p);
          events.push({
            type: "CLOTH",
            text: `${p} received 1 cloth`,
            data: { player: p, village: village.id },
          });
        }
      }
    },
    canPlace(state, player, pieceType, at) {
      if (pieceType === "settlement" && "vertex" in at) {
        if (onVillageIsland(state, state.graph.vertices.get(at.vertex)?.hexes ?? []))
          return reject("ILLEGAL_PLACEMENT", "No settlements on the weavers' islands.");
      }
      if (pieceType === "robber" && "hex" in at && onVillageIsland(state, [at.hex]))
        return reject("ILLEGAL_PLACEMENT", "The robber can't go to the weavers' islands.");
      if (pieceType === "pirate") {
        const trades = Object.values(weavers(state).trading).some((ps) => ps.includes(player));
        if (!trades)
          return reject(
            "ILLEGAL_PLACEMENT",
            "You can move the pirate once you trade with a village.",
          );
      }
      return null;
    },
    canMove(state, _player, piece) {
      const vs = villages(state).map((v) => v.vertex);
      return piece.type === "ship" && onClosedRoute(state, piece, vs)
        ? reject("INVALID_CHOICE", "Ships on a route to a village can't move.")
        : null;
    },
    onPlace(draft, piece, { events }) {
      if (!piece.owner || piece.type === "robber" || piece.type === "pirate") return;
      openTrade(draft, piece.owner, events);
    },
    stealOptions: (state, _thief, victim, source) =>
      source === "pirate" && clothOf(state, victim) > 0 ? ["cloth"] : [],
    stealItem(draft, thief, victim, item, events) {
      if (item !== "cloth") return false;
      moveCloth(draft, victim, thief);
      events.push({
        type: "STOLE",
        text: `${thief} stole 1 cloth from ${victim}`,
        data: { thief, victim, item: "cloth" },
      });
      return true;
    },
    onTurnEnd(draft, _player, { events }) {
      const empty = villages(draft).filter((v) => clothOf(draft, v.id) === 0).length;
      if (empty < EMPTY_VILLAGES_TO_END) return;
      weavers(draft).ended = true;
      events.push({
        type: "VILLAGES_EMPTY",
        text: `${empty} villages have run out of cloth: the game ends`,
        data: { empty },
      });
    },
    checkWin(state, modules) {
      if (weavers(state).ended) return mostVP(state, modules);
      return activePlayerWins(state, modules);
    },
  },
};
