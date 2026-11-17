# Adding artwork

Artwork selects tile and resource-card faces together. It is independent of UI theme colors.
Original SVG/CSS art is the default and the fallback for missing PNGs.
See [spec 226](features/226-artwork-selector.md#adding-a-new-selectable-style) for the exact
code registration steps and its missing-assets/expansion compatibility rules. Missing lookup
entries and browser load failures fall back per face; nonexistent static imports fail the
build. Expansions must supply their original baseline renderer before relying on fallback.

## Source and runtime files

- Keep supplied source PNGs unchanged in `assets/images/hex-tiles/` and
  `assets/images/cards/`. Do not overwrite them with optimized copies.
- Runtime copies live under `apps/web/src/art/assets/<pack>/tiles/` and `cards/`.
  Vite bundles only explicitly imported runtime images, not the source asset directory.
- Use game keys for runtime names: tiles `forest`, `hills`, `pasture`, `fields`,
  `mountains`, `desert`; cards `wood`, `brick`, `sheep`, `wheat`, `ore`.
- Use original or appropriately licensed supplied artwork, with no official logos or text.
  Record attribution requirements alongside new source assets when applicable.

## Preparing the Realism pack

Use Python 3.10+ and Pillow 11.3.0 (the version used for the initial copies). Install Pillow
in a local virtual environment if needed; it is an authoring tool, not an app dependency.

```sh
python3 scripts/prepare-artwork.py
python3 scripts/prepare-artwork.py --check
```

The script reads an explicit list of eleven sources and writes only their runtime copies:

| Category | Canvas | Treatment |
| --- | --- | --- |
| Tiles | 330 × 382 px, RGBA | Complete face resized to a common pointy-top hex; clear pixels outside its silhouette |
| Resource cards | 300 × 420 px, RGBA | Complete face resized to the existing 1:1.4 card ratio |

These supplied frames have slightly different proportions. Normalization makes a small
aspect adjustment, largest for desert, rather than cropping their parchment borders. This
adjustment is specific to these full-face assets, not a rule for arbitrary illustrations.
Review new sources before changing the recipe; use padding or an explicit crop for art that
should retain its aspect ratio. Do not repeatedly resize an already generated image.

## Adding or replacing art

1. Place the source in the appropriate source folder with a clear pack prefix.
2. Inspect transparency, frame, visible content bounds and silhouette. Match the tile center
   and all six corners; matching image dimensions alone is insufficient.
3. Update the explicit preparation recipe and generate runtime copies. Keep the script
   deterministic and limited to named image files; never scan or copy unrelated audio.
4. Register explicit imports in `apps/web/src/art/artwork.ts`. Terrain names and resource
   names are different keys (for example forest → wood and pasture → sheep).
5. For a new selectable pack, add its stable ID and display choice to the appearance setting
   and control. Missing faces retain Original rendering. Keep shared tokens, pieces, ports,
   icons, card backs and development cards outside the pack.
6. Review the live board and map preview, overlaid numbers, small card rows, hand, trade
   trays and card motion at desktop and 375px widths, in both color schemes. Check the largest
   supported zoom as well: the current source resolution may look soft there.
7. Run the preparation check, typecheck, tests, lint and web build. Inspect the exact diff
   before staging; include only the intended image sources/copies and related code/docs.

Do not bake numbers, probability dots, ownership colors, costs or interaction highlights
into new terrain art. They are separate shared layers driven by game data. Resource faces
must retain accessible names even when their artwork contains no printed label.
