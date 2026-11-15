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

**Test:** `generator.test.ts` — "resolved map passes validation" (every port edge is on the land graph).

### A3: Generator retry limit for red-token constraint is 1,000

If 1,000 token shuffles all violate the constraint, `generateMap` throws.
In practice this never occurs on the base map; the test covers 10k seeds without hitting it.

**Test:** `generator.test.ts` — 10,000 seeds all resolve without throwing.

## M2 — Engine core

### A4: The setup road must touch the settlement placed just before it

Not just any of your settlements. This stops a player's second road from extending their first.

**Test:** `setup.test.ts` — "requires the setup road to touch the settlement just placed".

### A5: Starting resources respect the bank

The second setup settlement takes one resource per adjacent producing hex. The desert and sea give nothing. If the bank is somehow out of a resource, that one is skipped (it can't happen with the base map and 4 players).

**Test:** `setup.test.ts` — "second settlement grants one resource per adjacent producing hex".

### A6: Bank shortage is decided per resource, across all hexes rolled

Shortage compares the bank against the total owed of that resource from every hex with the rolled number. A shortage of one resource never blocks another. A lone claimant gets whatever is left, even if it's less than they're owed.

**Test:** `produce.test.ts` — the three shortage cases.

### A7: Build checks run limit → cost → placement

When several things are wrong, the error code reports the first failure in that order.

**Test:** `build.test.ts` — "stops at 15 roads" (no free placement, still `PIECE_LIMIT`).
