import { describe, it, expect } from "vitest";
import { buildGraph, vertexId } from "@settlers/engine";
import { HEX_SIZE, edgeEndpoints, hexCenter, vertexPoint } from "./geometry";

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe("geometry", () => {
  it("places a vertex exactly one hex-radius from each of its three hexes", () => {
    const id = vertexId({ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 1, r: -1 });
    const p = vertexPoint(id);
    for (const [q, r] of [
      [0, 0],
      [1, 0],
      [1, -1],
    ] as const) {
      expect(dist(p, hexCenter(q, r))).toBeCloseTo(HEX_SIZE, 6);
    }
  });

  it("every edge is one hex-radius long and its endpoints are corners of its hexes", () => {
    const graph = buildGraph([
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 0, r: 1 },
    ]);
    for (const edge of graph.edges.keys()) {
      const [a, b] = edgeEndpoints(graph, edge);
      expect(dist(a, b)).toBeCloseTo(HEX_SIZE, 6);
    }
  });
});
