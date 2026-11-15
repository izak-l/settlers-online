import { buildGraph, type BoardGraph, type PlayerView } from "@settlers/engine";

export type Point = [number, number];

export const HEX_SIZE = 60;

/** Pixel centre of a pointy-top hex at axial (q, r). */
export function hexCenter(q: number, r: number, size = HEX_SIZE): Point {
  return [size * Math.sqrt(3) * (q + r / 2), size * 1.5 * r];
}

/** The six corners of a pointy-top hex, as an SVG points string. */
export function hexPolygon(q: number, r: number, size = HEX_SIZE, inset = 0): string {
  const [cx, cy] = hexCenter(q, r, size);
  const s = size - inset;
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + s * Math.cos(a)).toFixed(2)},${(cy + s * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

/** "q,r" → [q, r] */
function parseHex(key: string): [number, number] {
  const [q, r] = key.split(",").map(Number);
  return [q!, r!];
}

/** Centre of a set of hexes given as "q,r" keys. */
function centroid(keys: string[], size: number): Point {
  let x = 0;
  let y = 0;
  for (const k of keys) {
    const [q, r] = parseHex(k);
    const [hx, hy] = hexCenter(q, r, size);
    x += hx;
    y += hy;
  }
  return [x / keys.length, y / keys.length];
}

/**
 * A vertex ID names the three hexes meeting at it, so its position is the centre of those
 * three hex centres — exactly the shared corner. Works for coastal vertices too.
 */
export function vertexPoint(vertexId: string, size = HEX_SIZE): Point {
  return centroid(vertexId.split("|"), size);
}

/** An edge runs between its two vertices. */
export function edgeEndpoints(graph: BoardGraph, edgeId: string, size = HEX_SIZE): [Point, Point] {
  const [a, b] = graph.edges.get(edgeId)!.vertices;
  return [vertexPoint(a, size), vertexPoint(b, size)];
}

/** Midpoint of an edge = centre of the two hexes that share it. */
export function edgeMidpoint(edgeId: string, size = HEX_SIZE): Point {
  return centroid(edgeId.split("|"), size);
}

const graphCache = new WeakMap<PlayerView["map"], BoardGraph>();

/** Views don't carry the graph; rebuild it from the map once per map. */
export function graphFor(view: PlayerView): BoardGraph {
  let g = graphCache.get(view.map);
  if (!g) {
    g = buildGraph(view.map.hexes.filter((h) => h.terrain !== "sea"));
    graphCache.set(view.map, g);
  }
  return g;
}
