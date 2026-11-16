# 007 — Cards instead of counts

## Goal

Resources and development cards look and behave like cards. You hold a hand, pick cards to discard or trade, see your opponents' face-down cards, and watch cards arrive and leave.

## Scope / non-scope

**Scope**

- **Hand dock:** your resource cards in a fanned row, grouped by type in a fixed order (wood, brick, sheep, wheat, ore), followed by your dev cards. Every group shows a count badge, so a 15+ card hand stays readable.
- **Fitting the width:** cards overlap more as the hand grows. The overlap is computed from the dock's width and the group sizes. When even the tightest overlap doesn't fit (a very large hand on a phone), each group draws only its first few cards and the badge carries the total. Card size: about 64×90px on desktop and 48×68px under 600px.
- **Picking cards** replaces the +/− `ResourcePicker` everywhere:
  - A **tray** above the hand holds the cards you've picked, with a title ("Discard 4", "You give", "You want") and the confirm button. Tap a card in the tray to put it back.
  - **From your hand:** tap a group to pick one card from it.
  - **From the bank:** a strip of the five resource cards. Tap one to add it (for "You want", Bounty and Monopoly).
  - **Discard:** hand → tray; the button enables at exactly the amount in `decision.data.amounts`.
  - **Bank / port trade:** tap a hand group and the tray takes your rate's worth of it (from `ratios`; each group shows its rate as a badge in this mode). Then tap a bank card for what you get. Trade is enabled only when `legal` has that `BANK_TRADE`.
  - **Player offer:** two trays (give from your hand, want from the bank strip), then Offer.
  - **Bounty:** two bank picks. **Monopoly:** one bank pick, then confirm.
- **Dev cards:** one card each, with our own name and blurb. Cards bought this turn are dimmed with a "New" tag and can't be played. Tap a card to raise it and show its Play button, which is enabled only from `legal`. Victory Point cards are marked as secret.
- **Opponents:** each player row shows a small fan of face-down resource backs and dev backs, each with a count (fans draw at most 8 backs).
- **Trade offers:** the open offer shows give / want as small card faces, for everyone (spectators too).
- **Animation:** cards you gain fly into their group (from the bank, or from the player row when the latest events say who they came from: steals, trades, Monopoly). Cards you lose fly out. Opponents' fans pulse with +n / −n. Under `prefers-reduced-motion`, cards just appear or disappear with a short highlight.
- Keyboard: every hand group, bank card and tray card is a button with a label ("Pick one wood, you have 3").

**Non-scope**

- Drag and drop, reordering cards by hand, counter-offers (not in the engine).
- Real per-card identity. The engine keeps counts, so card *n* of a group is just a position.

## Rules

- No game rules in the UI. Amounts the UI enforces (the discard total, at most what you hold, two Bounty picks) only shape the controls. The server validates every action as before, and buttons that map to a single legal action (bank trade, play a card, steal) are enabled from `legal`.
- Picking state is local and is thrown away whenever the top decision changes.

## Engine changes

Hands and dev zones are already counts per type, and `devnew-<seat>` marks cards bought this turn. One additive change, with no rule changes: `STOLE` events carry `data: { thief, victim }` (plus `resource` on the version only the two of them see), and `TRADED` carries `data: { from, with, give, want }`, so the UI knows who a card came from without parsing log text. Counts alone can't tell, since a one-for-one trade leaves both totals unchanged. Pinned in `robber.test.ts` and `trade.test.ts`.

## Server/UI changes

New, under `apps/web/src/cards/`:

- `CardFace.tsx`: resource faces, dev faces and the card back, as inline SVG that shares icons with the board art (spec 008).
- `fan.ts` (pure): the offset of each card from the dock width, card width and group sizes; how many to draw per group.
- `picking.ts` (pure): the pick state (`purpose`, `give`, `want`) and a reducer for add, remove, clear, and set-from-ratio.
- `handDiff.ts` (pure): previous vs current counts → arrivals and departures per resource. The source is the trade or steal partner from the new events; otherwise players whose totals dropped (Monopoly) or rose; otherwise the bank.
- `HandDock.tsx`: the dock, the tray and the bank strip. Its mode comes from the top decision (discard) or from what you started (trade, Bounty, Monopoly).
- `CardFan.tsx`: the face-down fans for opponents.

Changed:

- `HandPanel.tsx` is replaced by `HandDock.tsx`.
- `ResourcePicker.tsx` is deleted.
- `DevCards.tsx` renders cards.
- `TradePanel.tsx` only starts a trade mode (the picking happens in the dock).
- `Decisions.tsx`: the discard prompt drives the dock; the offer view uses card faces.
- `PlayersPanel.tsx` uses `CardFan`.
- `styles.css`.

## Test plan

- `fan.test.ts`: fits the width for hands of 0–30 cards at 375px and 1280px; overlap never goes below the minimum sliver; groups are capped when needed and counts are preserved.
- `picking.test.ts`: discard can't pick past what you hold; bank mode takes the rate's worth; removing from the tray; clearing on a new decision.
- `handDiff.test.ts`: production, a steal with a source, a trade (gain and loss), Monopoly, and no diff on the first snapshot.
- Manual in the sandbox and online: a discard on a 9-card hand, a bank trade at 4:1 and 2:1, an offer accepted by a second browser, Bounty, Monopoly, a dev card bought then played the next turn, a spectator view; at 375px and desktop width, and with reduced motion on.

## Open questions

None. (Decided: on phones the dock scrolls with the page rather than sticking to the bottom.)

## Status

Shipped
