import { type Hex, hexCornerTouching, hexEdgeTouching, hexKey } from "./hex";
import { vertexId, edgeId } from "./ids";

export type VertexId = string;
export type EdgeId = string;
export type HexKey = string;

export interface VertexEntry {
  id: VertexId;
  hexes: HexKey[];          // land/coast hexes that touch this vertex (1–3)
  edges: EdgeId[];          // edges incident to this vertex (1–3)
  neighbors: VertexId[];    // adjacent vertices connected by an edge
}

export interface EdgeEntry {
  id: EdgeId;
  vertices: [VertexId, VertexId];
  hexes: HexKey[];          // land/coast hexes that share this edge (1–2)
}

export interface BoardGraph {
  /** land/coast hex keys that are part of this graph */
  hexKeys: Set<HexKey>;
  vertices: Map<VertexId, VertexEntry>;
  edges: Map<EdgeId, EdgeEntry>;
  /** hex key → vertex IDs of its 6 corners */
  hexVertices: Map<HexKey, VertexId[]>;
  /** hex key → edge IDs of its 6 sides */
  hexEdges: Map<HexKey, EdgeId[]>;
}

/**
 * Derive the full vertex/edge graph from a set of land or coast hexes.
 * Sea-only edges and vertices are excluded; they are only added when a module needs them.
 */
export function buildGraph(hexes: Hex[]): BoardGraph {
  const hexSet = new Set<HexKey>(hexes.map(hexKey));

  const vertices = new Map<VertexId, VertexEntry>();
  const edges = new Map<EdgeId, EdgeEntry>();
  const hexVertices = new Map<HexKey, VertexId[]>();
  const hexEdges = new Map<HexKey, EdgeId[]>();

  for (const h of hexes) {
    const hk = hexKey(h);

    // --- vertices (corners) ---
    const corners = hexCornerTouching(h);
    const vIds: VertexId[] = [];
    for (const [a, b, c] of corners) {
      const vid = vertexId(a, b, c);
      vIds.push(vid);
      if (!vertices.has(vid)) {
        vertices.set(vid, { id: vid, hexes: [], edges: [], neighbors: [] });
      }
      const v = vertices.get(vid)!;
      if (!v.hexes.includes(hk)) v.hexes.push(hk);
    }
    hexVertices.set(hk, vIds);

    // --- edges (sides) ---
    const sides = hexEdgeTouching(h);
    const eIds: EdgeId[] = [];
    for (const [a, b] of sides) {
      // Only create an edge when both hexes are land/coast, or when b is off-board
      // (coastal edges are still needed for ports). We include all edges that touch
      // at least one land hex.
      const eid = edgeId(a, b);
      eIds.push(eid);
      if (!edges.has(eid)) {
        // vertices for this edge's two endpoints: each edge is flanked by two corners.
        // We'll wire vertex↔edge refs in a second pass below.
        edges.set(eid, { id: eid, vertices: ["", ""], hexes: [] });
      }
      const e = edges.get(eid)!;
      if (!e.hexes.includes(hk)) e.hexes.push(hk);
    }
    hexEdges.set(hk, eIds);
  }

  // --- wire edge endpoints and vertex neighbor/edge refs ---
  // Each edge connects two adjacent vertices. For hex h, its 6 corners appear in
  // the same order as CORNER_PAIRS, and its 6 edges (sides) are in DIRECTIONS order.
  // Edge i of hex h connects corner i and corner (i+1)%6.
  for (const h of hexes) {
    const hk = hexKey(h);
    const vIds = hexVertices.get(hk)!;
    const eIds = hexEdges.get(hk)!;

    for (let i = 0; i < 6; i++) {
      const v0Id = vIds[i] as VertexId;
      // Edge i spans corner i and corner (i+5)%6: the right edge (dir 0) connects
      // the top-right vertex (corner 0) and bottom-right vertex (corner 5).
      const v1Id = vIds[(i + 5) % 6] as VertexId;
      const eid = eIds[i] as EdgeId;

      const e = edges.get(eid)!;
      // Set endpoints (may be overwritten identically by the shared hex)
      e.vertices = [v0Id, v1Id];

      const v0 = vertices.get(v0Id)!;
      const v1 = vertices.get(v1Id)!;

      if (!v0.edges.includes(eid)) v0.edges.push(eid);
      if (!v1.edges.includes(eid)) v1.edges.push(eid);
      if (!v0.neighbors.includes(v1Id)) v0.neighbors.push(v1Id);
      if (!v1.neighbors.includes(v0Id)) v1.neighbors.push(v0Id);
    }
  }

  return { hexKeys: hexSet, vertices, edges, hexVertices, hexEdges };
}
