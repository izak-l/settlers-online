#!/usr/bin/env python3
"""Build runtime PNGs from untouched source art. See docs/ARTWORK.md."""

from pathlib import Path
import argparse
import hashlib
import io

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "assets/images"
OUTPUT = ROOT / "apps/web/src/art/assets/realism"
TILES = {
    "forest": "wood",
    "hills": "brick",
    "pasture": "pasture",
    "fields": "wheat",
    "mountains": "ore",
    "desert": "desert",
}
RESOURCES = ("wood", "brick", "sheep", "wheat", "ore")


def prepare(source: Path, size: tuple[int, int], tile: bool) -> bytes:
    with Image.open(source) as image:
        # These are complete framed faces. Normalize their outer silhouette rather
        # than cropping away the frame or adding different margins to each image.
        image = image.convert("RGBA").resize(size, Image.Resampling.LANCZOS)
    if tile:
        # Remove stray pixels outside a canonical pointy-top hex.
        width, height = size
        mask = Image.new("L", size, 0)
        ImageDraw.Draw(mask).polygon(
            [(width / 2, 0), (width - 1, height / 4),
             (width - 1, height * 3 / 4), (width / 2, height - 1),
             (0, height * 3 / 4), (0, height / 4)],
            fill=255,
        )
        image.putalpha(ImageChops.darker(image.getchannel("A"), mask))
    result = io.BytesIO()
    image.save(result, format="PNG", optimize=True)
    return result.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check without writing files")
    args = parser.parse_args()
    entries = [
        (SOURCES / f"hex-tiles/realism_{source}.png", OUTPUT / f"tiles/{key}.png", (330, 382), True)
        for key, source in TILES.items()
    ] + [
        (SOURCES / f"cards/realism_{key}.png", OUTPUT / f"cards/{key}.png", (300, 420), False)
        for key in RESOURCES
    ]
    stale = []
    for source, output, size, tile in entries:
        content = prepare(source, size, tile)
        if args.check:
            if not output.exists() or output.read_bytes() != content:
                stale.append(str(output.relative_to(ROOT)))
        else:
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(content)
        print(f"{output.relative_to(ROOT)} {size[0]}x{size[1]} {hashlib.sha256(content).hexdigest()[:12]}")
    if stale:
        raise SystemExit("Runtime art needs regeneration: " + ", ".join(stale))


if __name__ == "__main__":
    main()
