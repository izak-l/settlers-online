# 008 — Board and panel art

## Goal

The game looks finished: a consistent flat illustrated style for the board, pieces and cards, and panels that look like part of the same game.

## Scope / non-scope

**Scope**

- **Terrain:** each hex gets a flat illustration drawn as SVG patterns or symbols on top of its colour: forest (layered pine trees), pasture (grass tufts and a small sheep), fields (rows of wheat), hills (stacked clay bricks and mounds), mountains (peaks with snow caps), desert (dunes) and sea (soft wave lines). The board gets a coastline rim behind the land.
- **Number tokens:** cream discs with a subtle shadow; 6 and 8 in red and bold; pips under the number.
- **Ports:** a small pier on the coast edge, with the ratio and the resource icon (or "?" for 3:1) on a flag or sign.
- **Pieces:** roads as rounded planks with an outline; a settlement as a small house with a lit and a shaded side; a city as a wider building with a tower. All in seat colours with a dark outline, so they read on every terrain. The robber is an original hooded figure with a ground shadow.
- **Dice:** pip faces instead of digits.
- **Panels and overall look:** a refreshed palette (light and dark), clearer headings, a player row with a coloured edge for the current turn, award badges with icons, and buttons that match. Resource icons are shared by hexes, cards, costs and the log.
- **Icons:** a small set of our own SVG icons (resources, dev card types, road / settlement / city, awards, speaker for spec 009).

**Non-scope**

- Raster images, external icon sets, web fonts (we keep the system font stack), themes beyond light and dark.

## Rules

- All art is original, drawn by us as SVG and CSS in the repo. No trademarked names, logos, official art or card text (CLAUDE.md IP rules).
- Art never changes what is clickable: targets stay on top and keep their hit areas.
- Colours meet WCAG AA contrast for text and stay distinguishable for the common colour-vision deficiencies. Resources are told apart by icon, not colour alone.

## Engine changes

None.

## Server/UI changes

- `apps/web/src/art/` (new): `icons.tsx` (resource, dev card, piece and award icons as small React components), `terrain.tsx` (the `<defs>` patterns and symbols for each terrain, rendered once per board), `pieces.tsx` (road, settlement, city, robber shapes).
- `Board.tsx` uses them; port and token drawing move into small components in `board/`.
- `ActionBar.tsx` (pip dice, icon costs), `PlayersPanel.tsx`, `GameLog.tsx` (resource icons inline), `styles.css` (palette tokens, panels, buttons).
- Performance: patterns are defined once in `<defs>` and referenced by each hex, so the board stays one light SVG. Checked by eye at 4× zoom on a laptop.

## Test plan

- Manual: the sandbox at 375px and desktop width, light and dark mode, 1× and 4× zoom; every terrain, both token kinds, all six port types, all piece types in all four seat colours, and the robber on several terrains.
- Existing web tests stay green.

## Open questions

None.

## Status

Draft
