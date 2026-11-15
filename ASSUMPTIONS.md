# Assumptions

Every ambiguous rule reading we chose, with the test that pins it.

## M1 — Board graph and map generation

### A1: Red-token constraint applies to tokens only, not terrain

The `no-adjacent-red-tokens` constraint (tokens 6 and 8 may not be on adjacent hexes)
applies to the number-token draw phase only. It does not constrain terrain placement.

**Test:** `generator.test.ts` — 10,000 seeds, none violate the constraint.

### A2: Port auto-placement distributes ports evenly around the coast

When a port entry uses `"edge": "auto"`, the generator picks coastal edges in order
around the perimeter of the board, distributing the port pool evenly.
Exact canonical position is not required; a valid coastal edge placement is sufficient.

**Test:** `validator.test.ts` — every generated port sits on a coastal edge.

### A3: Generator retry limit for red-token constraint is 1,000

If 1,000 token shuffles all violate the constraint, `generateMap` throws.
In practice this never occurs on the base map; the test covers 10k seeds without hitting it.

**Test:** `generator.test.ts` — 10,000 seeds all resolve without throwing.
