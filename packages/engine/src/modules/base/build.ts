import { reject, type ActionHandlers } from "../../module";
import { updateAwards } from "./awards";
import { COSTS } from "./data";
import {
  addPiece,
  allEdges,
  allVertices,
  buildingAt,
  checkLimitAndCost,
  distanceRuleOk,
  pay,
  roadAt,
  roadConnects,
  touchesOwnRoad,
} from "./helpers";

export const buildActions: ActionHandlers = {
  BUILD_ROAD: {
    validate(state, player, { edge }) {
      const fail = checkLimitAndCost(state, player, "road");
      if (fail) return fail;
      if (
        !state.graph.edges.has(edge) ||
        roadAt(state, edge) ||
        !roadConnects(state, player, edge)
      ) {
        return reject("ILLEGAL_PLACEMENT", "Roads must connect to your own road or building.");
      }
      return null;
    },
    apply(draft, player, { edge }, { events }) {
      pay(draft, player, COSTS["road"]!);
      addPiece(draft, "road", player, { edge });
      events.push({ type: "BUILT_ROAD", text: `${player} built a road` });
      updateAwards(draft, events);
    },
    candidates: (s) => allEdges(s).map((edge) => ({ type: "BUILD_ROAD", edge })),
  },

  BUILD_SETTLEMENT: {
    validate(state, player, { vertex }) {
      const fail = checkLimitAndCost(state, player, "settlement");
      if (fail) return fail;
      if (!distanceRuleOk(state, vertex) || !touchesOwnRoad(state, player, vertex)) {
        return reject(
          "ILLEGAL_PLACEMENT",
          "Settlements must touch your road and have no building next to them.",
        );
      }
      return null;
    },
    apply(draft, player, { vertex }, { events }) {
      pay(draft, player, COSTS["settlement"]!);
      addPiece(draft, "settlement", player, { vertex });
      events.push({ type: "BUILT_SETTLEMENT", text: `${player} built a settlement` });
      updateAwards(draft, events);
    },
    candidates: (s) => allVertices(s).map((vertex) => ({ type: "BUILD_SETTLEMENT", vertex })),
  },

  BUILD_CITY: {
    validate(state, player, { vertex }) {
      const fail = checkLimitAndCost(state, player, "city");
      if (fail) return fail;
      const b = buildingAt(state, vertex);
      if (b?.type !== "settlement" || b.owner !== player) {
        return reject("ILLEGAL_PLACEMENT", "Cities replace one of your settlements.");
      }
      return null;
    },
    apply(draft, player, { vertex }, { events }) {
      pay(draft, player, COSTS["city"]!);
      delete draft.pieces[buildingAt(draft, vertex)!.id];
      addPiece(draft, "city", player, { vertex });
      events.push({ type: "BUILT_CITY", text: `${player} upgraded to a city` });
    },
    candidates: (s) => allVertices(s).map((vertex) => ({ type: "BUILD_CITY", vertex })),
  },
};
