import forest from "./assets/realism/tiles/forest.png";
import hills from "./assets/realism/tiles/hills.png";
import pasture from "./assets/realism/tiles/pasture.png";
import fields from "./assets/realism/tiles/fields.png";
import mountains from "./assets/realism/tiles/mountains.png";
import desert from "./assets/realism/tiles/desert.png";
import wood from "./assets/realism/cards/wood.png";
import brick from "./assets/realism/cards/brick.png";
import sheep from "./assets/realism/cards/sheep.png";
import wheat from "./assets/realism/cards/wheat.png";
import ore from "./assets/realism/cards/ore.png";
import type { Artwork } from "./appearance";

const TILES: Record<string, string> = { forest, hills, pasture, fields, mountains, desert };
const CARDS: Record<string, string> = { wood, brick, sheep, wheat, ore };

export function tileImage(artwork: Artwork, terrain: string): string | undefined {
  return artwork === "realism" ? TILES[terrain] : undefined;
}

export function cardImage(artwork: Artwork, resource: string): string | undefined {
  return artwork === "realism" ? CARDS[resource] : undefined;
}
