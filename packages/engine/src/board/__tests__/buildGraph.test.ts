import { describe, it, expect } from "vitest";
import { buildGraph } from "../graph";
import { type Hex } from "../hex";
import { vertexId, edgeId } from "../ids";

/** Standard 19-hex base board hexes in axial coordinates. */
function baseMapHexes(): Hex[] {
  const hexes: Hex[] = [];
  // Ring 0
  hexes.push({ q: 0, r: 0 });
  // Ring 1
  for (const [q, r] of [
    [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
  ] as [number, number][]) {
    hexes.push({ q, r });
  }
  // Ring 2
  for (const [q, r] of [
    [2, 0], [2, -1], [2, -2], [1, -2], [0, -2],
    [-1, -1], [-2, 0], [-2, 1], [-2, 2], [-1, 2], [0, 2], [1, 1],
  ] as [number, number][]) {
    hexes.push({ q, r });
  }
  return hexes;
}

describe("buildGraph — base map", () => {
  const hexes = baseMapHexes();
  const graph = buildGraph(hexes);

  it("has 19 hexes", () => {
    expect(graph.hexKeys.size).toBe(19);
  });

  it("has 54 vertices", () => {
    expect(graph.vertices.size).toBe(54);
  });

  it("has 72 edges", () => {
    expect(graph.edges.size).toBe(72);
  });

  it("every vertex touches ≤ 3 hexes", () => {
    for (const v of graph.vertices.values()) {
      expect(v.hexes.length).toBeGreaterThanOrEqual(1);
      expect(v.hexes.length).toBeLessThanOrEqual(3);
    }
  });

  it("every edge touches ≤ 2 hexes", () => {
    for (const e of graph.edges.values()) {
      expect(e.hexes.length).toBeGreaterThanOrEqual(1);
      expect(e.hexes.length).toBeLessThanOrEqual(2);
    }
  });

  it("every vertex has ≤ 3 neighbors", () => {
    for (const v of graph.vertices.values()) {
      expect(v.neighbors.length).toBeLessThanOrEqual(3);
    }
  });

  it("every vertex has ≤ 3 incident edges", () => {
    for (const v of graph.vertices.values()) {
      expect(v.edges.length).toBeLessThanOrEqual(3);
    }
  });

  it("every edge has exactly 2 endpoint vertices that exist in the graph", () => {
    for (const e of graph.edges.values()) {
      expect(e.vertices).toHaveLength(2);
      expect(graph.vertices.has(e.vertices[0]!)).toBe(true);
      expect(graph.vertices.has(e.vertices[1]!)).toBe(true);
    }
  });

  it("every hex maps to exactly 6 vertices and 6 edges", () => {
    for (const hk of graph.hexKeys) {
      expect(graph.hexVertices.get(hk)).toHaveLength(6);
      expect(graph.hexEdges.get(hk)).toHaveLength(6);
    }
  });

  it("vertex IDs are stable across two independent calls", () => {
    const graph2 = buildGraph(baseMapHexes());
    const ids1 = [...graph.vertices.keys()].sort();
    const ids2 = [...graph2.vertices.keys()].sort();
    expect(ids1).toEqual(ids2);
  });

  it("edge IDs are stable across two independent calls", () => {
    const graph2 = buildGraph(baseMapHexes());
    const ids1 = [...graph.edges.keys()].sort();
    const ids2 = [...graph2.edges.keys()].sort();
    expect(ids1).toEqual(ids2);
  });

  it("edge adjacency is symmetric: if v0 is a neighbor of v1, v1 is a neighbor of v0", () => {
    for (const v of graph.vertices.values()) {
      for (const nid of v.neighbors) {
        const neighbor = graph.vertices.get(nid)!;
        expect(neighbor.neighbors).toContain(v.id);
      }
    }
  });
});

describe("vertexId and edgeId", () => {
  it("vertexId is order-independent", () => {
    const a = { q: 0, r: 0 };
    const b = { q: 1, r: 0 };
    const c = { q: 1, r: -1 };
    expect(vertexId(a, b, c)).toBe(vertexId(c, a, b));
    expect(vertexId(a, b, c)).toBe(vertexId(b, c, a));
  });

  it("edgeId is order-independent", () => {
    const a = { q: 0, r: 0 };
    const b = { q: 1, r: 0 };
    expect(edgeId(a, b)).toBe(edgeId(b, a));
  });
});

describe("buildGraph — small fixture", () => {
  it("single hex has 6 vertices and 6 edges", () => {
    const g = buildGraph([{ q: 0, r: 0 }]);
    expect(g.vertices.size).toBe(6);
    expect(g.edges.size).toBe(6);
  });

  it("two adjacent hexes share 2 vertices and 1 edge", () => {
    const g = buildGraph([{ q: 0, r: 0 }, { q: 1, r: 0 }]);
    expect(g.vertices.size).toBe(10); // 6 + 6 - 2 shared
    expect(g.edges.size).toBe(11);    // 6 + 6 - 1 shared
  });
});
