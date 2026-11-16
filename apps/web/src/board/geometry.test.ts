import { describe, it, expect } from "vitest";
import { buildGraph, vertexId } from "@settlers/engine";
import { HEX_SIZE, edgeEndpoints, hexCenter, hexPolygon, vertexPoint } from "./geometry";

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

describe("hexPolygon rims", () => {
  // The coast rim is a slightly bigger hex around the same centre. Passing a bigger `size`
  // instead moved the centre outwards too, which drew a wide sand strip on big maps.
  it("a negative inset grows the hex around the same centre, even far from the origin", () => {
    const corners = (s: string) => s.split(" ").map((p) => p.split(",").map(Number));
    const centre = (s: string) => {
      const c = corners(s);
      return [c.reduce((a, p) => a + p[0]!, 0) / 6, c.reduce((a, p) => a + p[1]!, 0) / 6];
    };
    const land = hexPolygon(4, 6, HEX_SIZE, 1.5);
    const rim = hexPolygon(4, 6, HEX_SIZE, -7);
    const [lx, ly] = centre(land);
    const [rx, ry] = centre(rim);
    expect(rx).toBeCloseTo(lx!, 1);
    expect(ry).toBeCloseTo(ly!, 1);
    const radius = Math.hypot(corners(rim)[0]![0]! - rx!, corners(rim)[0]![1]! - ry!);
    expect(radius).toBeCloseTo(HEX_SIZE + 7, 1);
  });
});
