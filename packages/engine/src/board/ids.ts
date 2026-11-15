import { type Hex, hexKey } from "./hex";

/**
 * Vertex ID: the three hex coordinates that touch the corner, sorted and joined.
 * Off-board (sea) neighbors are still counted, so coastal vertices get unique IDs.
 */
export function vertexId(a: Hex, b: Hex, c: Hex): string {
  return [hexKey(a), hexKey(b), hexKey(c)].sort().join("|");
}

/**
 * Edge ID: the two hex coordinates that share the edge, sorted and joined.
 */
export function edgeId(a: Hex, b: Hex): string {
  return [hexKey(a), hexKey(b)].sort().join("|");
}
