# 226 — Artwork selector

## Goal

Let each player choose the existing original artwork or the supplied Realism PNG artwork
through an Appearance control integrated into the top bar.

## Scope / non-scope

- Work on `graphics-upgrades`, created from `main` at `29a1e74`.
- Confirmed: one Artwork selection switches land tiles and resource cards together.
- Confirmed: Appearance belongs in the existing top bar beside the sound control.
- Confirmed: source images may be resized onto standard canvases as needed.
- Confirmed: shared/varying graphics inventory below; keep sources and generate standardized
  runtime copies with a documented workflow (`docs/ARTWORK.md`).
- Initial choices: Original (existing SVG/CSS art) and Realism (supplied PNGs).
- This is an artwork selection. Panel themes and light/dark mode are separate concepts;
  this feature does not add controls for them.
- No engine, protocol, server, sound, gameplay or layout changes.
- Do not merge or modify `m10`. Its gold, ship and pirate art remains separate expansion work.
- Preserve unrelated untracked assets, including audio; stage only explicitly selected files.

## Rules

### Confirmed selection model

Tiles and resource cards switch together; there are no independent tile/card selectors.

### Preference behavior

- Keep Original as the default for existing and new browsers.
- Remember the choice per browser using guarded local storage. An unknown saved choice or
  unavailable storage falls back to Original; storage failure must not prevent switching.
- Apply immediately without reloading or recreating the game. Preserve pan, zoom, build
  selection, picked trade cards and game state.
- The preference belongs to the viewer, not the lobby host or game; players may choose
  different artwork while playing together.
- Use the same selection in the live board, map previews, hand, trade/pick trays, small
  resource-card rows and resource-card motion overlays.

### Shared and varying graphics

| Element | Original | Realism |
| --- | --- | --- |
| Six land terrain faces | Existing SVG/CSS | Supplied hex PNGs |
| Five resource-card faces | Existing SVG/CSS | Supplied card PNGs |
| Sea, coast and unresolved preview tiles | Existing rendering | Shared existing rendering |
| Number discs, numbers and probability dots | Existing SVG | Shared existing SVG above tile images |
| Roads, settlements, cities and robber | Existing SVG | Shared existing SVG |
| Ports, resource/cost/log icons and awards | Existing SVG | Shared existing SVG |
| Development-card faces and all card backs | Existing rendering | Shared existing rendering |
| Panels, buttons, typography, player colors and focus/highlight markers | Existing styling | Shared existing styling |

### Missing assets and expansion compatibility

Fallback is per face, not per pack. A player can keep Realism selected while a terrain or
resource without Realism art uses Original. Available Realism faces continue to render,
and the saved preference and game state do not change.

| Situation | Behavior |
| --- | --- |
| No entry for a terrain in the selected style's tile lookup | `TerrainFace` renders the original gradient polygon and `TerrainArt` for that terrain |
| No entry for a resource in the selected style's card lookup | `ResourceCard` renders the original CSS face, resource icon and accessible name |
| Registered PNG fails to load in the browser | That face switches to its original renderer; other images and the selected style are unaffected |
| Unknown or removed style ID in local storage | Load Original; do not attempt to guess a replacement style |
| Explicit PNG import points to a nonexistent file | Build error, not a browser fallback; remove the import/lookup entry or supply the file before shipping |

When an expansion adds a terrain (for example gold), it must provide its **original baseline
renderer**: the terrain gradient/color tokens, `TerrainArt` case and relevant board/preview
support. The PNG fallback uses that renderer; it does not invent an illustration or palette
for unknown terrain. For a new resource, provide the original card styling, name and shared
icon as part of the expansion UI. Then expansion content works in every style even if no
matching pack image exists. Add optional style-specific images later using the workflow below.

Expansion pieces such as ships/pirates remain shared original graphics under this feature's
scope. Supporting selectable piece art would require an explicit scope change; merely adding
a PNG does not make a new category selectable. Expansion integration must retain the shared
`TerrainFace` path in both the board and map preview, and the shared `ResourceCard` path in
all card contexts. Test the mixed result: Realism base faces plus original expansion faces.
No expansion code is copied from `m10` into this branch.

### Asset inventory and preparation

Sources are under `assets/images/hex-tiles/` and `assets/images/cards/`.

| Game key | Hex source | Card source |
| --- | --- | --- |
| forest / wood | `realism_wood.png` | `realism_wood.png` |
| hills / brick | `realism_brick.png` | `realism_brick.png` |
| pasture / sheep | `realism_pasture.png` | `realism_sheep.png` |
| fields / wheat | `realism_wheat.png` | `realism_wheat.png` |
| mountains / ore | `realism_ore.png` | `realism_ore.png` |
| desert | `realism_desert.png` | — |

All supplied images report alpha transparency. Five hex sources are approximately 331–335 ×
390–391 px; desert is 1038 × 1159 px. Cards are 297–306 × 420 px. Inspected wood and desert
tiles have complete parchment frames; the inspected wood card includes a complete card face.
All eleven sources have now been visually inspected.

- Preserve source PNGs. Put only runtime copies under `apps/web/src/art/assets/realism/`.
- Normalize tiles to 330 × 382 RGBA and cards to 300 × 420 RGBA using the explicit
  `scripts/prepare-artwork.py` recipe. Keep transparency; `--check` verifies regeneration.
- Check visible content bounds, centers and hex corners, not just matching file dimensions.
  The desert's proportions differ: standardization makes a small aspect adjustment to fit
  the shared hex silhouette without cropping its frame; clear stray pixels outside the hex.
- Use the full PNG face without layering original terrain motifs or resource-card artwork
  over it. Preserve accessible resource names and current interactive wrappers/count badges.
- Preserve the SVG geometry and interaction targets. Images are decorative and do not
  intercept pointer events. Verify tile borders meet consistently and do not cover routes.

### Adding a new selectable style

The concrete asset preparation and visual checklist lives in [Adding artwork](../ARTWORK.md).
Adding files alone does not register a style; the current two-style implementation uses
explicit imports, lookups and choices rather than scanning directories.

1. Choose a stable lowercase style ID and a user-facing display name. Preserve existing IDs
   so saved preferences remain meaningful. Keep this artwork identity separate from UI
   themes and light/dark settings.
2. Preserve the supplied sources in `assets/images/hex-tiles/` and `assets/images/cards/`
   with a style prefix. Extend the preparation script with an explicit recipe for the new
   pack; do not overwrite Realism copies or scan unrelated assets. Generate runtime copies
   under `apps/web/src/art/assets/<style-id>/tiles/` and `cards/`, using the standard canvases
   and naming runtime files by terrain/resource key.
3. Import available runtime files in `art/artwork.ts` and add that style's tile/card maps.
   Update `tileImage` and `cardImage` to resolve the new style. Partial packs are allowed:
   omit absent entries and let each face fall back as described above. Do not create imports
   for files that do not exist.
4. Extend the `Artwork` union and `loadArtwork` validation in `art/appearance.ts` to recognize
   the stable ID. Keep Original as the default and unknown saved IDs falling back to it.
5. Add a choice and display name to `ui/AppearanceControl.tsx`, including its sample rendering.
   The initial Original/Realism list and labels are explicit, so both need updating. Continue
   switching tiles and resource cards together through the single preference.
6. Extend preference/lookup tests for the new ID, present faces and omitted faces. Browser-check
   a deliberately missing entry, a failed PNG request and any expansion baseline rendering;
   check previews, hand, trades and card motion as well as the live board.
7. Run the preparation `--check`, workspace typecheck/tests/lint and web build. Review image fit,
   small card readability and the mixed-style fallback before committing. Update this spec's
   inventory and `DESIGN.md` when a new style ships.

## Engine changes

None.

## Server/UI changes

Implementation:

- `apps/web/src/ui/AppearanceControl.tsx`: top-bar button and compact popover containing one
  labeled Artwork choice, Original / Realism, with small samples. Support keyboard operation,
  outside dismissal, Escape and focus return. Fit within a 375px viewport.
- `apps/web/src/App.tsx`: place the control beside sound, available on all screens including
  the sandbox. Ensure the header still fits with username and navigation.
- `apps/web/src/art/appearance.ts` and a small React subscription hook: browser preference
  loading, validation, storage and updates, following the existing sound-settings pattern.
- `apps/web/src/art/artwork.ts`: explicit PNG imports and keyed asset lookup. Avoid a
  generic theme framework; keep theme colors separate from artwork identity.
- `apps/web/src/art/board.tsx`, `board/Board.tsx` and `board/MapPreview.tsx`: share a terrain-face
  renderer so previews and gameplay use the same choice while tokens remain independent.
  Keep hit areas, layer ordering and viewport behavior intact.
- `apps/web/src/cards/CardFace.tsx`: select resource-card faces centrally so every reuse
  follows the preference; keep dev cards and card backs shared.
- `apps/web/src/styles.css`: scoped appearance-popover and image sizing styles. Retain
  selection, disabled, new-card and reduced-motion behaviors.
- Update `CLAUDE.md` Current focus when implementation begins; fold lasting behavior into
  `docs/DESIGN.md` and mark this spec Shipped after validation and user review.

## Test plan

- Focused preference tests: defaults, recognized/unknown saved values, malformed or blocked
  storage, switching and persistence. Verify asset mappings cover the agreed terrain/resources.
- Browser checks for both choices: six land tiles, hand, trade choices, small card rows,
  motion overlays, map previews, shared icons and missing-image fallback.
- Confirm a selection change preserves game state, current pan/zoom, open build popup and
  trade picks; verify Original restores the existing art.
- Check popover labels, keyboard interaction, Escape/focus, pointer dismissal and no board
  gesture interference.
- Inspect at desktop and 375px widths, with both system color schemes and reduced motion.
  Check tile alignment, desert sizing, number readability, seat colors, image sharpness and
  resource recognition at the smallest card sizes.
- Recheck setup placement, build popup enabled/disabled choices, pan at fit, Fit reset and
  floating trade tray reachability.
- Run workspace typecheck, tests, lint and production web build before committing.

## Open questions

None. The user accepted the first implementation and image fit after visual review.

## Status

Shipped on `graphics-upgrades`; approved by the user after visual review on 2026-11-16.
Source PNGs are unchanged. Not merged, pushed or deployed in this session.

Validation: 359 workspace tests pass, including memory and Postgres integration suites.
Workspace typecheck, lint and the production web build pass. Asset regeneration check passes.
Chromium checks at 1440×900, 1024×600, 375×812 and 375×600 cover both color schemes, popover
bounds, Escape/focus return, persistence, direct setup placement, and switching without
changing game state, the board viewBox, trade picks or an open build popup. The image fit
was accepted after visual review; high zoom can expose the resolution of the supplied art.
Additional Chromium checks pass for failed PNG fallback (tiles and cards), blocked local
storage, and fixed versus unresolved map preview faces. No browser runtime errors observed.
