import { describe, expect, it } from "vitest";
import { apply, buildOptions, legalActions } from "../engine";
import { COSTS } from "../modules/base/data";
import { h, inMainPhase, inRollPhase, newGame, give, v, withPiece } from "./testkit";

const vertex = v(h(0, 0), h(1, 0), h(1, -1));
const base = () => withPiece(inMainPhase(newGame()), "settlement", "p0", { vertex });

describe("buildOptions", () => {
  it("shows unaffordable builds with their costs and rejection, without changing state", () => {
    const state = base();
    const before = JSON.stringify(state);
    const edge = state.graph.vertices.get(vertex)!.edges[0]!;
    const options = buildOptions(state, "p0");
    const road = options.find((o) => "edge" in o.action && o.action.edge === edge);
    expect(road).toMatchObject({
      label: "Road",
      piece: "road",
      cost: COSTS["road"],
      action: { type: "BUILD_ROAD", edge },
      disabledReason: { code: "CANNOT_AFFORD" },
    });
    expect(
      options.find(
        (o) => o.action.type === "BUILD_CITY" && "vertex" in o.action && o.action.vertex === vertex,
      ),
    ).toMatchObject({
      label: "City",
      cost: COSTS["city"],
      disabledReason: { code: "CANNOT_AFFORD" },
    });
    expect(JSON.stringify(state)).toBe(before);
  });

  it("enabled previews are exactly the legal builds and can be applied", () => {
    const state = give(base(), "p0", { wood: 5, brick: 5, sheep: 5, wheat: 5, ore: 5 });
    const options = buildOptions(state, "p0");
    const enabled = options.filter((o) => !o.disabledReason).map((o) => o.action);
    expect(enabled).toEqual(legalActions(state, "p0").filter((a) => a.type.startsWith("BUILD_")));
    for (const action of enabled) expect(apply(state, "p0", action).ok).toBe(true);
    const blocked = options.find(
      (o) =>
        o.action.type === "BUILD_SETTLEMENT" && "vertex" in o.action && o.action.vertex === vertex,
    );
    expect(blocked).toBeUndefined();
  });

  it("does not offer pieces that are exhausted", () => {
    let state = give(base(), "p0", { wheat: 2, ore: 3 });
    for (const at of [...state.graph.vertices.keys()].slice(0, 4)) {
      state = withPiece(state, "city", "p0", { vertex: at });
    }
    const city = buildOptions(state, "p0").find((o) => o.action.type === "BUILD_CITY");
    expect(city).toBeUndefined();
  });

  it("only offers connected unoccupied edges, even with an empty hand", () => {
    let state = base();
    const connected = state.graph.vertices.get(vertex)!.edges;
    const occupied = connected[0]!;
    state = withPiece(state, "road", "p1", { edge: occupied });
    const roads = buildOptions(state, "p0").filter((o) => o.piece === "road");
    expect(roads.map((o) => ("edge" in o.action ? o.action.edge : ""))).toEqual(connected.slice(1));
    expect(roads.every((o) => o.disabledReason?.code === "CANNOT_AFFORD")).toBe(true);
    const corners = buildOptions(state, "p0").filter((o) => "vertex" in o.action);
    expect(corners).toHaveLength(1);
    expect(corners[0]?.action).toEqual({ type: "BUILD_CITY", vertex });
  });

  it("does not offer extending through an opponent's building when unaffordable", () => {
    const edges = base().graph.vertices.get(vertex)!.edges;
    let state = withPiece(inMainPhase(newGame()), "road", "p0", { edge: edges[0]! });
    state = withPiece(state, "settlement", "p1", { vertex });
    const roads = buildOptions(state, "p0").filter((o) => o.piece === "road");
    for (const edge of edges)
      expect(roads.some((o) => "edge" in o.action && o.action.edge === edge)).toBe(false);
  });

  it("has no previews for other actors, setup, roll or a finished game", () => {
    expect(buildOptions(base(), "p1")).toEqual([]);
    expect(buildOptions(newGame(), "p0")).toEqual([]);
    expect(buildOptions(inRollPhase(newGame()), "p0")).toEqual([]);
    expect(buildOptions({ ...base(), winner: "p0" }, "p0")).toEqual([]);
  });
});
