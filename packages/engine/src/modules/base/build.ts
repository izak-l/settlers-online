import {
  reject,
  routePieceTypes,
  runCanPlace,
  runOnPlace,
  type ActionHandlers,
} from "../../module";
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
  roadSpotOk,
  touchesOwnRoute,
} from "./helpers";

export const buildActions: ActionHandlers = {
  BUILD_ROAD: {
    validate(state, player, { edge }, { modules }) {
      const fail = checkLimitAndCost(state, player, "road");
      if (fail) return fail;
      if (!roadSpotOk(state, player, edge)) {
        return reject("ILLEGAL_PLACEMENT", "Roads must connect to your own road or building.");
      }
      return runCanPlace(modules, state, player, "road", { edge }, "MAIN");
    },
    apply(draft, player, { edge }, ctx) {
      pay(draft, player, COSTS["road"]!);
      const piece = addPiece(draft, "road", player, { edge });
      ctx.events.push({ type: "BUILT_ROAD", text: `${player} built a road` });
      runOnPlace(ctx.modules, draft, piece, ctx);
      updateAwards(draft, ctx.events, ctx.modules);
    },
    candidates: (s) => allEdges(s).map((edge) => ({ type: "BUILD_ROAD", edge })),
  },

  BUILD_SETTLEMENT: {
    validate(state, player, { vertex }, { modules }) {
      const fail = checkLimitAndCost(state, player, "settlement");
      if (fail) return fail;
      if (
        !distanceRuleOk(state, vertex) ||
        !touchesOwnRoute(state, player, vertex, routePieceTypes(modules))
      ) {
        return reject(
          "ILLEGAL_PLACEMENT",
          "Settlements must touch your road and have no building next to them.",
        );
      }
      return runCanPlace(modules, state, player, "settlement", { vertex }, "MAIN");
    },
    apply(draft, player, { vertex }, ctx) {
      pay(draft, player, COSTS["settlement"]!);
      const piece = addPiece(draft, "settlement", player, { vertex });
      ctx.events.push({ type: "BUILT_SETTLEMENT", text: `${player} built a settlement` });
      runOnPlace(ctx.modules, draft, piece, ctx);
      updateAwards(draft, ctx.events, ctx.modules);
    },
    candidates: (s) => allVertices(s).map((vertex) => ({ type: "BUILD_SETTLEMENT", vertex })),
  },

  BUILD_CITY: {
    validate(state, player, { vertex }, { modules }) {
      const fail = checkLimitAndCost(state, player, "city");
      if (fail) return fail;
      const b = buildingAt(state, vertex);
      if (b?.type !== "settlement" || b.owner !== player) {
        return reject("ILLEGAL_PLACEMENT", "Cities replace one of your settlements.");
      }
      return runCanPlace(modules, state, player, "city", { vertex }, "MAIN");
    },
    apply(draft, player, { vertex }, ctx) {
      pay(draft, player, COSTS["city"]!);
      delete draft.pieces[buildingAt(draft, vertex)!.id];
      const piece = addPiece(draft, "city", player, { vertex });
      ctx.events.push({ type: "BUILT_CITY", text: `${player} upgraded to a city` });
      runOnPlace(ctx.modules, draft, piece, ctx);
    },
    candidates: (s) => allVertices(s).map((vertex) => ({ type: "BUILD_CITY", vertex })),
  },
};
