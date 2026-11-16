import { hexKey } from "../../board/hex";
import type { VertexId } from "../../board/graph";
import { reject, type ActionHandlers } from "../../module";
import type { Decision, GameState, PlayerId, Resources } from "../../types";
import { BANK_START, BASE_RESOURCES, TERRAIN_RESOURCE } from "./data";
import {
  addPiece,
  allEdges,
  allVertices,
  decision,
  describe,
  distanceRuleOk,
  featureOn,
  handOf,
  popDecision,
  roadAt,
  rollDecision,
  transfer,
} from "./helpers";
import { updateAwards } from "./awards";
import { setupDevCards } from "./devcards";

export const setupSettlement = (p: PlayerId, round: number): Decision =>
  decision("PLACE_SETTLEMENT", p, ["PLACE_SETTLEMENT"], { round });

export const setupRoad = (p: PlayerId, round: number): Decision =>
  decision("PLACE_ROAD", p, ["PLACE_ROAD"], { round });

/** Build the bank and hands, place the robber, and queue the snake-order setup. */
export function setupBase(draft: GameState): void {
  const empty = (): Resources => Object.fromEntries(BASE_RESOURCES.map((r) => [r, 0]));
  draft.zones["bank"] = {
    id: "bank",
    visibility: "public",
    contents: Object.fromEntries(BASE_RESOURCES.map((r) => [r, BANK_START])),
  };
  for (const p of draft.players) {
    draft.zones[`hand-${p}`] = {
      id: `hand-${p}`,
      owner: p,
      visibility: "count",
      contents: empty(),
    };
  }

  const start = draft.map.hexes.find((hx) => hx.terrain === draft.map.robberStart);
  if (start && featureOn(draft, "robber"))
    draft.pieces["robber"] = { id: "robber", type: "robber", at: { hex: hexKey(start) } };

  draft.moduleState["base"] = { playedDevThisTurn: false, longestRoad: null, largestArmy: null };
  setupDevCards(draft);

  // Snake order: 1→N then N→1, each placing a settlement then a road.
  const n = draft.players.length;
  const order = [...draft.players, ...[...draft.players].reverse()];
  const steps = order.flatMap((p, i) => {
    const round = i < n ? 1 : 2;
    return [setupSettlement(p, round), setupRoad(p, round)];
  });
  // The stack's top is its last element, so the first step goes last. p0's first ROLL waits at the bottom.
  draft.decisions = [rollDecision(draft.players[0]!), ...steps.reverse()];
  draft.turn = { number: 0, activePlayer: draft.players[0]! };
}

export const setupActions: ActionHandlers = {
  PLACE_SETTLEMENT: {
    validate(state, _player, { vertex }) {
      if (!distanceRuleOk(state, vertex)) {
        return reject(
          "ILLEGAL_PLACEMENT",
          "Settlements need a free spot with no building next to it.",
        );
      }
      return null;
    },
    apply(draft, player, { vertex }, { events }) {
      addPiece(draft, "settlement", player, { vertex });
      events.push({ type: "PLACED_SETTLEMENT", text: `${player} placed a settlement` });

      const round = draft.decisions.at(-1)!.data?.["round"];
      if (round === 2) {
        const gained: Resources = {};
        const bank = draft.zones["bank"]!.contents;
        for (const key of draft.graph.vertices.get(vertex)!.hexes) {
          const hex = draft.map.hexes.find((hx) => hexKey(hx) === key);
          const resource = hex ? TERRAIN_RESOURCE[hex.terrain] : undefined;
          if (!resource || (bank[resource] ?? 0) === 0) continue;
          transfer(bank, handOf(draft, player), resource, 1);
          gained[resource] = (gained[resource] ?? 0) + 1;
        }
        if (Object.keys(gained).length > 0) {
          events.push({
            type: "STARTING_RESOURCES",
            text: `${player} received ${describe(gained)}`,
          });
        }
      }

      popDecision(draft);
      // The matching road must touch this settlement.
      const road = draft.decisions.at(-1)!;
      road.data = { ...road.data, mustTouch: vertex };
    },
    candidates: (s) => allVertices(s).map((vertex) => ({ type: "PLACE_SETTLEMENT", vertex })),
  },

  PLACE_ROAD: {
    validate(state, _player, { edge }) {
      const e = state.graph.edges.get(edge);
      const mustTouch = state.decisions.at(-1)!.data?.["mustTouch"];
      if (!e || roadAt(state, edge) || !e.vertices.includes(mustTouch as VertexId)) {
        return reject("ILLEGAL_PLACEMENT", "Your road must touch the settlement you just placed.");
      }
      return null;
    },
    apply(draft, player, { edge }, { events }) {
      addPiece(draft, "road", player, { edge });
      events.push({ type: "PLACED_ROAD", text: `${player} placed a road` });
      updateAwards(draft, events);
      popDecision(draft);
      if (draft.decisions.at(-1)?.kind === "ROLL") draft.turn.number = 1; // setup is over
    },
    candidates: (s) => allEdges(s).map((edge) => ({ type: "PLACE_ROAD", edge })),
  },
};
