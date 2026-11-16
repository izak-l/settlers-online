/**
 * Builds the seafaring scenario map JSON files in this folder from the layouts below, which are
 * transcribed from the rulebook's scenario diagrams (spec 015). Run from the repo root:
 *
 *   pnpm --filter @settlers/sim exec tsx ../../packages/maps/scenarios/build.ts
 *   pnpm exec prettier --write packages/maps/scenarios
 *
 * A layout is one line per hex row, top to bottom. Each line starts with the half-hex column
 * of its first cell (`k`), then its cells left to right, each one hex further right (k += 2).
 * Hexes in neighbouring rows sit half a hex apart, so a row's k values are all odd or all even.
 * Cells:
 *
 *   ~      sea (inside the frame)       _   nothing (a gap: no hex here)
 *   H F P W M G D  hills forest pasture fields(wheat) mountains gold desert, then the token,
 *                  then an optional lowercase region letter (no letter = the main region)
 *
 * e.g. "H12n" is hills with a 12 in region n. Axial coordinates: r = row − rowOffset,
 * q = (k − row) / 2.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Dir = "E" | "W" | "NE" | "NW" | "SE" | "SW";
type PortType = "any3to1" | "wood2to1" | "brick2to1" | "sheep2to1" | "wheat2to1" | "ore2to1";

interface Layout {
  /** File name inside the scenario folder, e.g. "3p-fixed". */
  variant: string;
  players: { min: number; max: number };
  /** Rows as "k: cell cell …". */
  rows: string[];
  /** Region letter → region name; unlettered land is "main". */
  regions: Record<string, string>;
  /** A port on the edge between a land hex (row, k) and its neighbour in `dir`. */
  ports: { at: [number, number]; dir: Dir; type: PortType }[];
  robber: [number, number];
  /** A sea hex, or "frame": in play but starting off the board. Omitted: no pirate. */
  pirate?: [number, number] | "frame";
}

interface Scenario {
  id: string;
  name: string;
  description: string;
  vpToWin: number;
  scenario: Record<string, unknown>;
  layouts: Layout[];
}

const TERRAIN: Record<string, string> = {
  H: "hills",
  F: "forest",
  P: "pasture",
  W: "fields",
  M: "mountains",
  G: "gold",
  D: "desert",
};

const STEP: Record<Dir, [number, number]> = {
  E: [0, 2],
  W: [0, -2],
  NE: [-1, 1],
  NW: [-1, -1],
  SE: [1, 1],
  SW: [1, -1],
};

/** Axial key for a (row, k) cell, with rows counted from the middle row so maps are centred. */
function keyOf(row: number, k: number, middle: number): string {
  if ((k - row) % 2 !== 0) throw new Error(`row ${row}: k ${k} has the wrong parity`);
  const q = (k - row) / 2;
  const r = row - middle;
  return `${q},${r}`;
}

const edgeKey = (a: string, b: string) => [a, b].sort().join("|");

function build(s: Scenario, layout: Layout) {
  const middle = Math.floor(layout.rows.length / 2);
  const hexes: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  layout.rows.forEach((line, row) => {
    const [start, cells] = line.split(":");
    let k = Number(start);
    for (const cell of cells!.trim().split(/\s+/)) {
      const key = keyOf(row, k, middle);
      const [q, r] = key.split(",").map(Number);
      k += 2;
      if (cell === "_") continue;
      seen.add(key);
      if (cell === "~") {
        hexes.push({ q, r, terrain: "sea" });
        continue;
      }
      const m = /^([HFPWMGD])(\d{0,2})([a-z]?)$/.exec(cell);
      if (!m) throw new Error(`${s.id} ${layout.variant}: bad cell "${cell}" in row ${row}`);
      const [, t, token, letter] = m;
      const region = letter ? layout.regions[letter] : "main";
      if (!region) throw new Error(`${s.id}: unknown region letter ${letter}`);
      hexes.push({
        q,
        r,
        terrain: TERRAIN[t!],
        ...(token ? { token: Number(token) } : {}),
        region,
      });
    }
  });
  const at = ([row, k]: [number, number]) => keyOf(row, k, middle);
  const ports = layout.ports.map((p) => {
    const land = at(p.at);
    if (!seen.has(land)) throw new Error(`${s.id} ${layout.variant}: port on missing hex ${land}`);
    const [dr, dk] = STEP[p.dir];
    const other = keyOf(p.at[0] + dr, p.at[1] + dk, middle);
    return { edge: edgeKey(land, other), type: p.type };
  });
  return {
    id: `${s.id}-${layout.variant}`,
    name: s.name,
    description: s.description,
    version: 1,
    players: layout.players,
    vpToWin: s.vpToWin,
    hexes,
    ports,
    robberStart: at(layout.robber),
    scenario: {
      ...s.scenario,
      ...(layout.pirate === "frame"
        ? { pirateStart: "frame" }
        : layout.pirate
          ? { pirateStart: at(layout.pirate) }
          : {}),
    },
    modules: ["base", "seafaring"],
  };
}

// ---------------------------------------------------------------------------
// Scenarios (rulebook pages in brackets). Names and descriptions are our own.
// ---------------------------------------------------------------------------

const THREE = { min: 1, max: 3 };
const FOUR = { min: 4, max: 4 };

const SCENARIOS: Scenario[] = [
  {
    // Scenario 1 (pages 4–5)
    id: "new-horizons",
    name: "New Horizons",
    description:
      "Your home island is settled; small islands lie just offshore. Settle each one for 2 extra VP.",
    vpToWin: 14,
    scenario: { islandBonus: 2, home: { regions: ["main"] }, setupRegions: ["main"] },
    layouts: [
      {
        variant: "3p-fixed",
        players: THREE,
        rows: [
          "2: H12n G5n ~ ~",
          "1: ~ ~ ~ P4e M9e",
          "0: ~ W4 P6 ~ W3e ~",
          "-1: ~ P2 M5 F10 ~ G4e ~",
          "0: H8 P10 P9 F8 ~ ~",
          "1: W11 M3 H11 ~ M8s",
          "2: W6 F5 ~ H10s",
        ],
        regions: { n: "north", e: "east", s: "south" },
        ports: [
          { at: [2, 2], dir: "W", type: "wheat2to1" },
          { at: [2, 4], dir: "E", type: "any3to1" },
          { at: [4, 0], dir: "NW", type: "ore2to1" },
          { at: [4, 0], dir: "SW", type: "any3to1" },
          { at: [4, 6], dir: "NE", type: "sheep2to1" },
          { at: [6, 2], dir: "W", type: "brick2to1" },
          { at: [6, 4], dir: "SW", type: "wood2to1" },
          { at: [6, 4], dir: "E", type: "any3to1" },
        ],
        robber: [0, 2],
        pirate: [3, 11],
      },
      {
        variant: "4p-fixed",
        players: FOUR,
        rows: [
          "2: M8n P11n ~ G4e ~",
          "1: ~ ~ ~ ~ H5e M2e",
          "0: ~ P5 F6 M4 ~ F9e ~",
          "-1: ~ W12 H11 W3 P9 ~ G10e ~",
          "0: H6 F10 D W11 F5 ~ ~",
          "1: M3 P4 H9 P8 ~ H3s",
          "2: W8 F2 M10 ~ W6s",
        ],
        regions: { n: "north", e: "east", s: "south" },
        ports: [
          { at: [2, 2], dir: "W", type: "any3to1" },
          { at: [2, 6], dir: "NW", type: "ore2to1" },
          { at: [3, 7], dir: "NE", type: "any3to1" },
          { at: [4, 0], dir: "NW", type: "sheep2to1" },
          { at: [4, 0], dir: "SW", type: "brick2to1" },
          { at: [4, 8], dir: "SE", type: "wheat2to1" },
          { at: [6, 2], dir: "W", type: "any3to1" },
          { at: [6, 4], dir: "SW", type: "wood2to1" },
          { at: [6, 6], dir: "E", type: "any3to1" },
        ],
        robber: [4, 4],
        pirate: [3, 13],
      },
    ],
  },
  {
    // Scenario 2 (pages 6–7)
    id: "four-isles",
    name: "Four Isles",
    description:
      "Four islands and no mainland. Start on one or two of them; every other island you settle is worth 2 extra VP.",
    vpToWin: 13,
    scenario: { islandBonus: 2, home: "setup" },
    layouts: [
      {
        variant: "3p-fixed",
        players: THREE,
        rows: [
          "2: ~ ~ W4a P3a",
          "1: M4b F9b ~ W9a H5a",
          "0: P6b M10b ~ F8a H11a ~",
          "-1: ~ ~ ~ ~ ~ ~ ~",
          "0: W11c M8c F3c ~ H10d H6d",
          "1: F5c P9c ~ M2d W5d",
          "2: P12c ~ ~ ~",
        ],
        regions: { a: "northeast", b: "northwest", c: "southwest", d: "southeast" },
        ports: [
          { at: [2, 0], dir: "NW", type: "any3to1" },
          { at: [1, 3], dir: "SE", type: "ore2to1" },
          { at: [1, 9], dir: "NE", type: "any3to1" },
          { at: [2, 8], dir: "SW", type: "brick2to1" },
          { at: [4, 0], dir: "NE", type: "wood2to1" },
          { at: [4, 0], dir: "SW", type: "any3to1" },
          { at: [5, 3], dir: "SE", type: "sheep2to1" },
          { at: [5, 7], dir: "NW", type: "any3to1" },
          { at: [4, 10], dir: "SE", type: "wheat2to1" },
        ],
        robber: [6, 2],
        pirate: "frame",
      },
      {
        variant: "4p-fixed",
        players: FOUR,
        rows: [
          "2: P8b ~ F9a F11a",
          "1: H10b ~ M3a W12a P5a",
          "0: W5b F3b ~ H5a M10a ~",
          "-1: ~ ~ ~ F6a ~ ~ ~",
          "0: H4c P9c ~ ~ F9d P11d",
          "1: W6c M4c H2c ~ M8d",
          "2: P10c W11c ~ W4d",
        ],
        regions: { a: "northeast", b: "northwest", c: "southwest", d: "southeast" },
        ports: [
          { at: [1, 1], dir: "W", type: "wheat2to1" },
          { at: [2, 0], dir: "SE", type: "any3to1" },
          { at: [3, 5], dir: "NW", type: "any3to1" },
          { at: [1, 9], dir: "SE", type: "wood2to1" },
          { at: [4, 10], dir: "NW", type: "ore2to1" },
          { at: [4, 10], dir: "SE", type: "any3to1" },
          { at: [4, 0], dir: "SW", type: "brick2to1" },
          { at: [5, 3], dir: "NE", type: "any3to1" },
          { at: [6, 2], dir: "W", type: "sheep2to1" },
        ],
        robber: [1, 7],
        pirate: "frame",
      },
    ],
  },
  {
    // Scenario 4 (pages 10–11). The deserts split the big island: the main region (deserts
    // included) and a strip beyond them, which counts as unexplored like the small islands.
    id: "across-the-sands",
    name: "Across the Sands",
    description:
      "A desert splits your island. Cross it, or sail to the islands to the east: each new region is worth 2 extra VP.",
    vpToWin: 14,
    scenario: { islandBonus: 2, home: { regions: ["main"] }, setupRegions: ["main"] },
    layouts: [
      {
        variant: "3p-fixed",
        players: THREE,
        rows: [
          "2: G4s D ~ M8a",
          "1: F3s D F4 ~ P12a",
          "0: W6s D H5 P6 ~ ~",
          "-1: ~ ~ M3 F10 ~ G5e ~",
          "0: F11 H6 W2 H9 ~ ~",
          "1: M10 W9 F8 ~ W9b",
          "2: P8 P4 ~ M5b",
        ],
        regions: { s: "strip", a: "northeast", e: "east", b: "southeast" },
        ports: [
          { at: [1, 5], dir: "NE", type: "wood2to1" },
          { at: [4, 2], dir: "NW", type: "wheat2to1" },
          { at: [4, 6], dir: "NE", type: "any3to1" },
          { at: [4, 0], dir: "SW", type: "sheep2to1" },
          { at: [4, 6], dir: "SE", type: "any3to1" },
          { at: [6, 2], dir: "W", type: "ore2to1" },
          { at: [6, 2], dir: "SE", type: "brick2to1" },
          { at: [6, 4], dir: "E", type: "any3to1" },
        ],
        robber: [1, 3],
        pirate: "frame",
      },
      {
        variant: "4p-fixed",
        players: FOUR,
        rows: [
          "2: G10s D F5 ~ M9a",
          "1: M11s D H3 P6 ~ W4a",
          "0: W8s D M8 W10 F4 ~ H2a",
          "-1: ~ ~ F10 H11 P9 ~ ~ ~",
          "0: H12 H6 W5 F8 ~ G5e P3e",
          "1: P3 P11 M4 ~ ~ ~",
          "2: ~ F9 ~ M6b W12b",
        ],
        regions: { s: "strip", a: "northeast", e: "east", b: "southeast" },
        ports: [
          { at: [0, 6], dir: "E", type: "brick2to1" },
          { at: [2, 8], dir: "NE", type: "any3to1" },
          { at: [2, 8], dir: "SE", type: "any3to1" },
          { at: [3, 3], dir: "W", type: "sheep2to1" },
          { at: [4, 6], dir: "SE", type: "any3to1" },
          { at: [5, 1], dir: "W", type: "wheat2to1" },
          { at: [5, 1], dir: "SE", type: "ore2to1" },
          { at: [6, 4], dir: "E", type: "wood2to1" },
          { at: [6, 4], dir: "SW", type: "any3to1" },
        ],
        robber: [1, 3],
        pirate: "frame",
      },
    ],
  },
];

const here = dirname(fileURLToPath(import.meta.url));
for (const s of SCENARIOS) {
  mkdirSync(join(here, s.id), { recursive: true });
  for (const layout of s.layouts) {
    const def = build(s, layout);
    writeFileSync(join(here, s.id, `${layout.variant}.json`), JSON.stringify(def, null, 2) + "\n");
    const land = def.hexes.filter((x) => x.terrain !== "sea").length;
    console.log(`${def.id}: ${def.hexes.length} hexes (${land} land), ${def.ports.length} ports`);
  }
}
