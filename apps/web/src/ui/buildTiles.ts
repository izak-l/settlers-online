import { BASE_COSTS, SHIP_COST } from "@settlers/engine";
import type { BuildMode } from "../game/seats";

/** One build button beside the hand (spec 232). */
export interface BuildTile {
  /** The board mode it toggles; `null` for the dev card, which buys at once. */
  mode: Exclude<BuildMode, null> | null;
  label: string;
  /** An `art/icons.tsx` name. */
  icon: string;
  action: string;
  cost?: Record<string, number>;
  /** Pieces left (or dev cards left in the deck); absent when unknown. */
  left?: number;
  enabled: boolean;
}

export interface TileInput {
  /** Action types you may send now. */
  legal: readonly string[];
  /** From the snapshot; missing with older servers, so no badges. */
  piecesLeft?: Record<string, number>;
  /** Cards left in the dev deck, if the view has one. */
  devDeck?: number;
  /** Seafaring games add the ship tiles. */
  hasShips: boolean;
  /** The dev card switch (spec 014). */
  devCards: boolean;
}

/** The build tiles in display order. Legality comes from `legal`; counts are only shown. */
export function buildTiles(input: TileInput): BuildTile[] {
  const can = (type: string) => input.legal.includes(type);
  const piece = (
    mode: Exclude<BuildMode, null>,
    label: string,
    action: string,
    cost?: Record<string, number>,
  ): BuildTile => {
    const left = input.piecesLeft?.[mode];
    return {
      mode,
      label,
      icon: mode,
      action,
      ...(cost ? { cost } : {}),
      ...(left !== undefined ? { left } : {}),
      enabled: can(action),
    };
  };
  const tiles: BuildTile[] = [
    piece("road", "Road", "BUILD_ROAD", BASE_COSTS["road"]!),
    piece("settlement", "Settlement", "BUILD_SETTLEMENT", BASE_COSTS["settlement"]!),
    piece("city", "City", "BUILD_CITY", BASE_COSTS["city"]!),
  ];
  if (input.hasShips) {
    tiles.push(piece("ship", "Ship", "BUILD_SHIP", SHIP_COST));
    // Moving uses a ship already on the board, so it has no count of its own.
    tiles.push({
      mode: "move",
      label: "Move ship",
      icon: "moveShip",
      action: "MOVE_SHIP",
      enabled: can("MOVE_SHIP"),
    });
  }
  if (input.devCards)
    tiles.push({
      mode: null,
      label: "Dev card",
      icon: "devCard",
      action: "BUY_DEV_CARD",
      cost: BASE_COSTS["devCard"]!,
      ...(input.devDeck !== undefined ? { left: input.devDeck } : {}),
      enabled: can("BUY_DEV_CARD"),
    });
  return tiles;
}
