# Player feedback

Feedback from playtests, as a numbered backlog. Numbers are permanent: never renumber or reuse
one, so commits, specs and issues can refer to "feedback #12". Add new items at the end of
their section with the next free number, so numbers within a section needn't be in order.
When an item is done, add `Done (<spec or commit>)` at the end of it, or `Won't do (<reason>)`.
Larger items get a feature spec in `docs/features/` first, as usual.

Sessions: 2026-11-15 (first hosted playtest, M9).

Already on the roadmap and not repeated here: alternate maps (M8, `features/011-map-catalog.md`)
and the expansions (M10–M13).

## Bugs

- **#1** Your own discard selection resets when another player finishes discarding.
- **#2** One player saw a visual glitch. It wasn't reproduced; get details or a screenshot next time.
- **#3** Merged into #13 (not a bug: the request is that nobody has to withdraw a declined offer).
- **#31** When the setup timer ran out for the player who places twice in a row at the turn of the
  snake, both of their placements were made automatically. The second placement should get
  its own time.

## Game flow and rules

- **#4** A proper end of game: a results screen with each player's VP broken down by source
  (settlements, cities, awards, VP cards).
- **#5** Random setup placement order, with a chat log line saying who goes first (e.g. a roll-off).
- **#6** Change the player count from inside a lobby.

## Timers

- **#7** Decouple the roll timer from the turn timer, and auto-roll when it runs out.
- **#8** Decouple the setup placement timer from the turn timer, and give the player who places twice
  in a row at the turn of the snake a fresh timer for the second placement (see bug #31).
- **#9** Add time back when you finish an action (e.g. a trade), like an increment clock.
- **#10** Extra time to move the robber after a 7.
- **#11** A warning sound when your time is running out.

## Trading

- **#12** Stop decline spam: a player can decline an offer once, and can't flood the log.
- **#13** When every other player has declined, remove the offer automatically after a few seconds,
  so the offering player never has to withdraw it by hand.
- **#14** Counter-offers. The trade interface in general needs more design thought before building.

## Dice

- **#15** Players felt the dice weren't random. Show roll stats (a distribution of the numbers rolled)
  during the game, and a full dice log at the end of the game.

## Information and indicators

- **#16** It's unclear where your dev cards are when it's not your turn.
- **#17** Show remaining pieces (roads, settlements, cities) and cards left in the deck.
- **#18** Warn when you hold more than 7 cards and would lose half on a 7.
- **#19** Show who holds the longest road, and its length.
- **#20** Show what a player discarded in the chat log. (Check this doesn't break the hidden-info
  rules in `viewFor` first.)

## Board and map

- **#21** Can't drag the board when fully zoomed out. Allow zooming out a bit further, and fit the
  map to the screen better at the start. Done (spec 223, `fix/immersive-map`).
- **#22** Click any edge of the board to get a small popup above it showing a road icon and the road's
  cost; click the popup to build (as colonist.io does). Consider the same for vertices
  (settlement, city). Done (spec 224, `fix/immersive-map`; ship metadata follows the `m10` merge).
- **#23** Art polish: the board doesn't look nice yet. The sheep port icon and the ore art were
  called out.
- **#24** Make the robber gray.

## Look and sound

- **#25** A dark mode.
- **#26** Let players choose a UI theme.
- **#27** Better sounds overall. Keep the card-gain sound (players liked it).
- **#28** Background music.

## Accounts and hosting

- **#29** Email sign-up hits Supabase's built-in email rate limit. Set up custom SMTP (see
  `DEPLOY.md` step 5).

## Replays

- **#30** Keep the action logs so finished games can be replayed.
