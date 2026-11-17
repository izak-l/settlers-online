# Assumptions

Every ambiguous rule reading we chose, with the test that pins it.

## M1 — Board graph and map generation

### A1: Red-token constraint applies to tokens only, not terrain

The `no-adjacent-red-tokens` constraint (tokens 6 and 8 may not be on adjacent hexes)
applies to the number-token draw phase only. It does not constrain terrain placement.

**Test:** `generator.test.ts` — 10,000 seeds, none violate the constraint.

### A2: Port auto-placement distributes ports evenly around the coast

When a port entry uses `"edge": "auto"`, the generator sorts the coastal edges by angle around
the board's centre and takes evenly spaced ones, starting from a random offset. Port types are
shuffled from the pool. Ports with a fixed edge ID keep it. This doesn't reproduce the official
layout; it only guarantees spread-out ports that never share a corner.

**Test:** `generator.test.ts` — "never puts two ports on edges that share a corner (1,000 seeds)" and "resolved map passes validation".

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

## M5 — Robber, dev cards, trades, awards, win

### A8: With exactly one player to rob, the steal happens automatically

The thief has no real choice, so there's no `STEAL` step. With two or more, the thief picks.

**Test:** `robber.test.ts` — "steals automatically when only one player can be robbed".

### A9: The robber may move to any other land hex, including the desert

Sea hexes are not allowed. Only players with a building on that hex and at least one card can be robbed; your own buildings never count.

**Test:** `robber.test.ts` — "must move to a different land hex" (18 options on a 19-hex board) and "goes straight to the main step when nobody there can be robbed".

### A10: Everyone else sees that a card was stolen, but not which

The thief and victim get an event naming the resource. Everyone else, spectators included, gets "X stole a card from Y" (an event with `hiddenFrom: [thief, victim]`). Discards show only the count publicly.

**Test:** `robber.test.ts` — "moves one random card; only thief and victim learn which".

### A11: Timeout defaults pick a random legal action without advancing the RNG

`defaultAction` reads the game RNG to choose among the legal actions (or a random discard), but doesn't advance it. The chosen action is logged and replayed like any other, so replays stay exact.

**Test:** `robber.test.ts` — the `defaultAction` cases for discard and steal; `game.test.ts` — "returns an action apply accepts at every step of a short game".

### A12: The dev deck is counts per card type; buying draws one at random

Same odds as drawing from a shuffled deck, with no order to store or leak.

**Test:** `devcards.test.ts` — "starts with 25 hidden cards" and the BUY_DEV_CARD tests; dev cards are conserved (deck + hands + played = 25) after every action.

### A13: Road Building places as many free roads as it can (up to 2)

With one road piece left you place one. With nowhere legal to build, the card is still played and nothing is placed. There's no voluntary skip when a placement exists.

**Test:** `devcards.test.ts` — the three Road Crew tests.

### A14: Year of Plenty needs both picks to be in the bank

If the bank doesn't have what you name, the play is rejected; pick something it has.

**Test:** `devcards.test.ts` — "Year of Plenty can't take what the bank doesn't have".

### A15: Public scores leave out VP cards until the game ends

Your own view counts your VP cards. Everyone else's view of your score doesn't, until there's a winner.

**Test:** `devcards.test.ts` — "a VP card counts for its owner straight away, but not in anyone else's view of the score".

### A16: On timeout, a player waiting to roll rolls (rather than playing a card)

`defaultAction` prefers ROLL, then END_TURN, then a random legal action.

**Test:** `game.test.ts` — "returns an action apply accepts at every step of a short game".

### A17: Player trades: the active player offers; others accept or decline; no counter-offers

Only the active player, in their main step, can open an offer. It must give and want at least one card each, with no resource on both sides. Responders can change their answer until the offerer confirms with one of the accepters, and both hands are re-checked at that moment. While an offer is open, the active player can't build; they confirm or cancel first.

**Test:** `trade.test.ts` — "trading with players".

### A18: A port counts if you have a settlement or city on either end of its edge

**Test:** `trade.test.ts` — the port tests in "trading with the bank".

### A19: One rule decides both awards

The holder keeps an award on a tie for the lead. Otherwise the unique leader at or above the threshold (5 roads, 3 knights) takes it. If the leaders are tied, or the holder drops below the threshold with nobody else qualifying, nobody holds it. A first-time tie means nobody gets it.

**Test:** `awards.test.ts` — "awardHolder (the shared rule for both awards)" and the in-play award tests.

### A20: Reaching 10 VP on someone else's turn wins at the start of your own turn

The win is checked after every action, for the player whose turn it is. After END_TURN that's the next player, so they win before rolling.

**Test:** `awards.test.ts` — "a player with 10 VP on someone else's turn wins when their own turn starts".

### A21: When the game ends, the decision stack is emptied and every further action is rejected with GAME_OVER

**Test:** `awards.test.ts` — "the active player wins on reaching 10 VP, and the game stops".

## M6 — Turn timers

### A22: The turn clock covers a whole turn, keyed by turn number and the player being waited on

Actions within a turn don't reset it. During setup the turn number stays 0, so a player with two placements in a row (the end of the snake) gets one clock for both. A timeout plays default moves until the clock no longer applies: for a turn, roll, cancel an open offer, place free roads at random, then end the turn.

**Test:** `apps/server/src/__tests__/timers.test.ts` — "keeps one deadline for the whole turn, and restarts for the next player"; `online-suite.ts` — "turn timers: idle players are moved by the system actor…".

### A23: Discards get a separate 30-second clock; the turn clock pauses meanwhile

While a decision the engine marks `timer: "short"` (discards) is on top, the turn clock is paused and resumes with the time it had left. On timeout everyone still pending discards at random.

**Test:** `timers.test.ts` — "pauses the turn clock while a discard runs, then resumes with the time left"; `robber.test.ts` — "marks discards as using the short clock".

### A24: Clocks only run while a seated player is connected, and restart from full

When no seated player has the game open, the clock stops, so an abandoned game doesn't play itself. When someone comes back (or the server restarts and the game loads), the current clock starts again from full.

**Test:** `online-suite.ts` — the "nobody home" and restart parts of the turn timer test; `timers.test.ts` — "starts from full after a reset".

## Spec 010 — One- and two-player games

### A25: Base rules are the same at every player count; a solo player can't offer trades

1 and 2 players use the normal base rules (no two-player variant, no neutral player). Setup is still a snake, so a solo player places both settlements and roads in a row. Offering a trade needs at least one other player; bank and port trades always work.

**Test:** `players.test.ts` — "setup is a snake of one…", "can't offer a trade with nobody to trade with…", "setup snakes 1, 2, 2, 1"; `sim.test.ts` — the one- and two-player batches (seed `1-1` was a bot offering trades solo).

## Spec 011 — Map catalog (M8a)

### A26: Bigger maps keep the base bank, dev deck and piece limits

A map changes the board, the player range and the win target, nothing else. Grand Diamond (49 land tiles, 12 VP) still has 19 of each resource in the bank, the same development deck and the same 5 settlements, 4 cities and 15 roads per player. If that plays badly, a later module option can scale them.

**Test:** `sim.test.ts` — "10 games on each other catalog map run clean", which checks after every action that bank + hands = 19 for each resource and that piece limits hold.

### A27: Changing a lobby's map clears every ready flag

Players agree to a map by readying up, so a new map asks everyone again. Only the host can change it, only while the lobby is open, and only to a map whose player range includes the lobby's seat count.

**Test:** `online-suite.ts` — "maps: the host picks a built-in map…" and "maps: a map that doesn't allow the lobby's seat count is refused".

### A28: A lobby saved before maps existed plays the base map

Lobbies created before migration 007 have no stored map; they read as the default base map.

**Test:** `postgres.test.ts` — "reads a lobby saved before maps existed (map is null) as the base map".

### A29: Deserts never take a token, whether fixed or drawn from the land pool

The token pool must hold exactly one token per `pool:tokens` hex, minus fixed deserts on those hexes, minus the deserts in `pools.land`. This assumes every random land hex asks for a random token, which is true of every map so far; the 1,000-seed catalog test catches a map where it isn't.

**Test:** `validator.test.ts` — "accepts the base map…", "rejects a token pool one short/long", "does not count a literal desert hex…".

## Spec 014 — Feature switches (M10a)

### A30: With the robber off, a 7 still makes big hands discard

A 7 produces nothing and everyone over 7 cards discards half, as usual; then play goes straight to the main step (no robber move, no steal). A Knight still counts towards Largest Army but moves nothing.

**Test:** `features.test.ts` — "a 7 still makes big hands discard, then goes straight to the main step", "a knight counts towards the army but moves nothing".

### A31: With dev cards off, Largest Army can't be earned either

Nobody can play a knight, so the army award is never held, whatever its own switch says. The dev deck stays in the state (untouched), so the card-conservation invariant still holds.

**Test:** `features.test.ts` — "can't buy or play development cards".

### A32: Switching harbors off keeps the ports in the map

Bank trades are all 4:1 and the board doesn't draw the harbors, but the map's ports stay in the state, so a switch never changes the board itself.

**Test:** `features.test.ts` — "every bank rate is 4 even on a port".

### A33: House rules travel inside the stored map

The server folds the lobby's switches into the resolved map's `features` when the game starts, so `games` needs no new column and replays read them from the stored map. Games saved before switches existed have no `features` and play with everything on.

**Test:** `features.test.ts` — "treat a missing features option … as all on"; the online suite's "house rules" test.

## Spec 015 — Seafaring (M10c)

### A34: A second starting settlement next to gold gets a pick

The rulebook's maps keep gold off the starting islands, but custom maps may not: the player picks one card per gold hex the settlement touches (a `GOLD_CHOICE` step above the setup road).

**Test:** `seafaring.test.ts` — "a second starting settlement next to gold earns a pick (custom maps)".

### A35: The map's border edges are ordinary edges; nothing lies beyond

Every water space inside the frame is a sea hex in the map JSON (the frame encloses two more than the rulebook's sea tiles; those two are printed on its frame pieces). Edges along the border take roads (land side) and ships like any other; the pirate may be parked on the frame, where it blocks nothing.

**Test:** `seafaring.test.ts` — "may sail along the map's outer border", "can be parked on the frame"; `scenarios.test.ts` component counts.

### A36: Gold picks come from what the bank still has

Gold is picked after normal production, from the bank as it stands. With several players picking at once, each pick is checked against the bank when it's made, and anyone the bank can no longer pay is dropped. The bank shortage rule for ordinary resources doesn't apply to gold.

**Test:** `seafaring.test.ts` — "the robber blocks a gold hex; a short bank limits the pick".

### A37: Island bonus: one per region, never for a building touching a home region

The bonus is computed from the pieces: the scenario's VP for each non-home region where the player has a settlement or city. A building that touches one of the player's home regions counts for none, so a corner where the main island meets the strip beyond the desert (scenario 4) is still home. Deserts in scenario 4 belong to the main region. There's no cap from the number of VP tokens in the box.

**Test:** `seafaring.test.ts` — "earns the bonus once per island", "a building touching a home region earns no bonus".

### A38: 1–3 seats play a scenario's 3-player map; 4 seats the 4-player map

**Test:** `scenarios.test.ts` — "picks the 3-player map for 1–3 seats"; online suite "scenarios".

### A39: The open-end rule covers the closed-line rule

A ship can move only from an open end (a corner with none of the player's buildings or other ships). A ship in a line joining two of the player's buildings never has one, even when an opponent has built on the line (that corner still has the player's other ship), so no separate check is needed.

**Test:** `seafaring.test.ts` — "a line joining two of your buildings never moves, even if an opponent builds on it".

## Spec 017 — Variable setup (M10d)

### A40: A variable map shuffles the fixed map's own pieces within each area

The rulebook's variable setups say which areas are shuffled but not which tiles go where, so each area's pool is exactly the terrain and number tokens that area has on the fixed map, and port types are shuffled over the fixed port spots. Scenario 4's deserts stay put. The robber starts on the 12 (scenario 1 with 3 players, scenario 2), the desert (scenario 1 with 4 players) or its fixed spot (scenario 4).

**Test:** `scenarios.test.ts` — "matches the rulebook's components" and "generates boards that keep the regions and the token rules" for every variable map.

## Spec 016 — Fog (M10e)

### A41: One placement can reveal two hexes; they're drawn in hex-key order

A road or ship whose corners touch two face-down hexes reveals both, the lower hex key first, each drawn from the hidden stacks with the game RNG.

**Test:** `fog.test.ts` — "a ship reaching a fog corner reveals it, with a token and a discovery card".

### A42: A revealed hex joins the region of the land next to it

Revealed land takes the region of an adjacent land hex, or becomes a region of its own. Two regions that a reveal happens to connect stay separate (no scenario with fog has an island bonus).

**Test:** `fog.test.ts` — "… The new land joins the main island's region".

### A43: Discovery rewards come from the bank, and gold gives a pick

A revealed producing hex gives one card of its resource if the bank has one; a revealed gold hex gives a `GOLD_CHOICE` pick of one. Reveals during setup (a starting road or ship) pay the reward too.

**Test:** `fog.test.ts` — "a revealed gold hex lets the player pick the reward".

## Spec 018 — Lost Settlers (M10f)

### A44: Things on the water go to the first ship placed on their edge, however it got there

Building a ship, moving one, a Road Crew ship and a setup ship all collect what lies on that edge. Each thing is taken once and leaves the map.

**Test:** `lost-settlers.test.ts` — "building a ship onto the token takes it: 1 VP", "moving a ship onto the token takes it".

### A45: A harbor goes on a coast edge at your own settlement or city, one edge clear of other harbors

The edge has land on one side and water (or the frame) on the other, and touches a corner with your settlement or city. "One edge between ports" means no harbor on it or on any edge sharing a corner with it.

**Test:** `lost-settlers.test.ts` — "a ship reaching a harbor takes it; it must be placed next to your building", "harbors keep at least one edge between them".

### A46: A harbor you can place is placed at once; one you can't is kept and placed later in your main step

Taking a harbor pushes a `PLACE_HARBOR` step if there is a legal edge. Otherwise you hold it (everyone can see it), and placing it is offered in your main step once a spot exists. With several held, the oldest goes first.

**Test:** `lost-settlers.test.ts` — "with nowhere to place it, you keep it and place it later in your main step".

### A47: Harbor types are shuffled at setup in both fixed and variable maps; dev cards off removes the card markers

The rulebook places the harbors face up at random even in the fixed setup, so harbor markers draw their type from a port pool when the map is generated. With development cards switched off there is nothing to deal, so the card markers are left off the board.

**Test:** `validator.test.ts` — "accepts tokens, cards and harbors on sea edges, with a port pool for the harbors"; `lost-settlers.test.ts` — "with development cards switched off, no cards are dealt and the markers go".
