# 022 — Uncharted Seas (the new-world variant, simplified)

## Goal

The rulebook's "new world" variant (page 20; our name "Uncharted Seas"): a random archipelago every game. Simplified as agreed: the islands and ports are generated, not built by the players at the table. Part of M10 (M10j). No new module: it is the `seafaring` module plus a map generator.

## Scope / non-scope

**Scope:** a generator for random island maps inside the 4-player frame; automatic ports; the scenario settings below.

**Non-scope:** players shifting tiles or placing ports in turn (the table version); 5–6 players.

## Rules (rulebook page 20, simplified)

- **Win:** 12 VP. Starting settlements on one or two islands, which become your home islands; 1 VP island bonus for each other island you settle.
- **Hexes:** the rulebook's list (19 sea, 4 hills, 5 forest, 5 pasture, 5 fields, 4 mountains) placed at random inside the frame; number tokens at random, never 6/8 next to each other; ports (5×2:1, 5×3:1) on random coast edges, at least one edge apart.
- **Robber and pirate:** the robber starts on the 12; the pirate on a random sea hex.

## Engine changes

- None expected (`robberStart: "token:12"` already exists, spec 017).

## Maps changes

- A generator `kind: "archipelago"` in the map JSON: the frame's positions, the land and sea counts, and rules for a playable result: every island at least 2 hexes; at least two islands of 4+ hexes so everyone can start; the land doesn't form one single landmass. It retries with the game RNG until the rules hold.
- Ports: spread over coast edges at least one edge apart (the existing auto-port logic, per island).

## Server/UI changes

- Catalog and lobby: listed with the other seafaring maps; the preview shows a random-looking placeholder.
- Sim: run on many seeds; invariants as for seafaring.

## Test plan

Generator over 10,000 seeds: rules hold, counts right, ports spaced; `pnpm sim --scenario uncharted-seas`; manual play.

## Open questions

- None. (Decided: robber on the 12, pirate on a random sea hex; the same 42-hex map for 1–4 players.)

## Status

Draft
