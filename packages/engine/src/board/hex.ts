/** Axial hex coordinate, pointy-top. */
export interface Hex {
  q: number;
  r: number;
}

/** The six axial direction vectors for pointy-top hexes. */
const DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexNeighbors(h: Hex): Hex[] {
  return DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));
}

/** The six pairs of neighboring hex directions that share a vertex corner (pointy-top). */
const CORNER_PAIRS: readonly [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 0],
];

/**
 * Returns the three hexes (including h itself) that touch each of h's 6 corners.
 * Result is an array of 6 triples, one per corner.
 */
export function hexCornerTouching(h: Hex): [Hex, Hex, Hex][] {
  const neighbors = hexNeighbors(h);
  return CORNER_PAIRS.map(([a, b]) => [h, neighbors[a] as Hex, neighbors[b] as Hex]);
}

/**
 * Returns the two hexes (including h) that share each of h's 6 edges.
 * Result is an array of 6 pairs, one per edge.
 */
export function hexEdgeTouching(h: Hex): [Hex, Hex][] {
  const neighbors = hexNeighbors(h);
  return neighbors.map((n) => [h, n]);
}

export function hexKey(h: Hex): string {
  return `${h.q},${h.r}`;
}
