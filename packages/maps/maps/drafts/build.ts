/**
 * Builds catalog map JSON files from the ASCII shapes below. Every shape here has been promoted
 * into the catalog (specs 023, 229), so the files are written to `packages/maps/maps/`; a new
 * shape still in progress can be written here (`drafts/`) instead by setting `draft: true`.
 *
 *   cd tools/sim && pnpm exec tsx ../../packages/maps/maps/drafts/build.ts
 *   pnpm exec prettier --write packages/maps/maps   # from the repo root (lint checks it)
 *
 * Each shape is drawn on an "odd-r" offset grid: one string per hex row, one character per hex,
 * odd rows sit half a hex to the right (they are indented by one space below so the art looks
 * like the board). Characters:
 *
 *   .  sea            x  random land ("pool:land" + "pool:tokens")
 *   M  mountains      D  desert       F  forest    P  pasture    W  fields    H  hills
 *
 * Fixed terrain (M/D/F/P/W/H) still draws its number token from the pool (deserts get none).
 * The sea is the whole bounding box of the art plus one ring, so every coast has sea next to it.
 * Pools follow the base mix per 19 land hexes, scaled to the map's size (see pools()).
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Terrain = "forest" | "pasture" | "fields" | "hills" | "mountains" | "desert";

interface Shape {
  id: string;
  name: string;
  description: string;
  vpToWin: number;
  modules: string[];
  /**
   * Whole copies of the base token set; the rest is topped up with 4, 9, 5, 10. Chosen so the
   * no-adjacent-red-tokens shuffle (1,000 tries) practically never fails: more copies means more
   * 6s and 8s, and on big maps a random shuffle almost never keeps them all apart.
   */
  tokenCopies: number;
  /** An explicit token pool, for maps too small for a whole copy of the base set. */
  tokens?: number[];
  /** Defaults to 2–4. */
  players?: { min: number; max: number };
  /** Still a draft: write it to `drafts/` for the sandbox's Drafts tab, not the catalog. */
  draft?: boolean;
  art: string;
}

const FIXED: Record<string, Terrain> = {
  M: "mountains",
  D: "desert",
  F: "forest",
  P: "pasture",
  W: "fields",
  H: "hills",
};

const SHAPES: Shape[] = [
  {
    id: "twin-isles",
    name: "Twin Isles",
    description:
      "Two islands across a narrow sea, after Great Britain and Ireland. Needs ships (seafaring).",
    vpToWin: 13,
    modules: ["base", "seafaring"],
    tokenCopies: 2,
    art: `
. . . . . . . x x . . . .
 . . . . . . x M x . . . .
. . . . . x x M x . . . .
 . . . . . . x x x . . . .
. . . . . . . x x . . . .
 . . x . . . x x . . . . .
. . x x . . . x x . . . .
 . x x x . . . x x . . . .
. x x x . . . x x x . . .
 . x x x . . . x x x . . .
. . x x x . x x x x . . .
 . x x . . . x x x x . . .
. . . . . . . x x x x x .
 . . . . . . x x x x x . .
. . . . . x x x x x . . .
`,
  },
  {
    id: "world",
    name: "Six Shores",
    description:
      "A stylised world map: the Americas west, Europe and Africa centre, Asia and Australia east. Needs ships (seafaring).",
    vpToWin: 14,
    modules: ["base", "seafaring"],
    tokenCopies: 3,
    art: `
. . x x x . . x . . x . x x . . x x x . . . . .
 . x x x x x . . . . . . x x x x x x x x . . . .
. . x x x x . . . . . x x x . x x M x x . . x .
 . . x M x . . . . . . . . . . x x x . x . . x .
. . . x x . . . . . x D x x . x . x . x x . . .
 . . . x . . . . . . x x x x . . x . . . x . . .
. . . . . . . . . . . x x . . . . . . . . . . .
 . . . . x x . . . . . x x . x . . . . . . . . .
. . . . x x x . . . . . x . . . . . . x x . . .
 . . . . M x . . . . . . . . . . . . x D x . . .
. . . . x x . . . . . . . . . . . . . . . . . .
 . . . . x . . . . . . . . . . . . . . . . . . .
`,
  },
  {
    id: "archipelagos",
    name: "Scattered Isles",
    description:
      "Four island chains, each a few small isles, with open sea between them. Needs ships (seafaring).",
    vpToWin: 13,
    modules: ["base", "seafaring"],
    tokenCopies: 3,
    art: `
. x x . . . . . . . . . . . . . x . . . . .
 x x x . . x x . . . . . . . . x x . x x . .
. x . . . x x . . . . . . . . . x . . x x .
 . . . . . . . . . . . . . . . . . . x x . .
. . x x . . x . . . . . . . x x . . . . . .
 . x x . . . x x . . . . . . x x x . . . . .
. . . . . . . . . . . . . . . . . . . . . .
 . . . . . . . . . . . . . . . . . . . . . .
. . . . . . . . . . . . . . . . . . . . . .
 . . . . x x . . . . . . . . . x . . . . . .
. . . . x x x . x . . . . . . x x . . x x .
 . . x . . . . . x x . . . . . . . . . x x .
. . x x . . . . x x . . . . . x x x . . . .
 . . x . . . . . . . . . . . x x . . x x . .
. . . . . . . . . . . . . . . . . . . x . .
`,
  },
  {
    id: "grand-diamond",
    name: "Grand Diamond",
    description: "One large diamond-shaped island, like the base board stretched to 49 tiles.",
    vpToWin: 12,
    modules: ["base"],
    tokenCopies: 2,
    art: diamondArt(7),
  },
  {
    id: "little-harbour",
    name: "Little Harbour",
    description: "A small island curled round a sheltered bay. Quick games for one to three.",
    vpToWin: 8,
    modules: ["base"],
    tokenCopies: 0,
    tokens: [2, 3, 4, 4, 5, 5, 6, 8, 9, 10, 10, 11, 12],
    players: { min: 1, max: 3 },
    art: `
. x x x x .
 x x x x . .
x x . x x .
 x . . x . .
`,
  },
  {
    id: "crescent-bay",
    name: "Crescent Bay",
    description: "A crescent of land wrapped around a wide bay that opens to the east.",
    vpToWin: 10,
    modules: ["base"],
    tokenCopies: 1,
    art: `
. . x x x x .
 . x x x x . .
. x x x . . .
 x x x . . . .
. x x x . . .
 . x x x x . .
. . x x x x .
`,
  },
  {
    id: "the-boot",
    name: "The Boot",
    description:
      "A long peninsula after Italy, from the Alps down to the heel and toe, with Sicily joined on.",
    vpToWin: 10,
    modules: ["base"],
    tokenCopies: 1,
    art: `
x M M x x . .
 . x x x . . .
. . x x . . .
 . . x x . . .
. . . x x . .
 . . . x x . .
. . . . x x x
 . . . . x . x
. . . x x . .
 . . x x . . .
`,
  },
  {
    id: "hourglass",
    name: "Hourglass",
    description: "Two broad lands joined by a narrow neck. Whoever holds the neck holds the roads.",
    vpToWin: 11,
    modules: ["base"],
    tokenCopies: 1,
    art: `
. x x x .
 x x x x .
x x x x x
 . x x x .
. . x x .
 . x x . .
. x x x .
 x x x x .
x x x x x
 . x x x .
`,
  },
  {
    id: "lagoon-ring",
    name: "Lagoon Ring",
    description: "A ring of land around a calm lagoon, with one channel out to the open sea.",
    vpToWin: 10,
    modules: ["base"],
    tokenCopies: 1,
    // Land 2-3 steps from the centre; the lagoon inside; a channel cut to the east.
    art: axialArt(3, (q, r) => (dist(q, r) >= 2 && !(r === 0 && q > 0) ? "x" : ".")),
  },
  {
    id: "six-point-star",
    name: "Six-Point Star",
    description: "A round heartland with six narrow points reaching out to sea.",
    vpToWin: 10,
    modules: ["base"],
    tokenCopies: 1,
    // The radius-2 hexagon plus two hexes out from each of its six corners.
    art: axialArt(4, (q, r) => {
      const d = dist(q, r);
      if (d <= 2) return "x";
      const onAxis = q === 0 || r === 0 || q + r === 0;
      return onAxis && d <= 4 ? "x" : ".";
    }),
  },
  {
    id: "great-hexagon",
    name: "Great Hexagon",
    description: "The familiar hexagonal board grown to 61 tiles: five rings around the centre.",
    vpToWin: 13,
    modules: ["base"],
    tokenCopies: 2,
    art: axialArt(4, () => "x"),
  },
  {
    id: "inland-sea",
    name: "Inland Sea",
    description:
      "Shores around an enclosed sea, after the Mediterranean, with its larger islands offshore. Needs ships (seafaring).",
    vpToWin: 14,
    modules: ["base", "seafaring"],
    tokenCopies: 3,
    art: `
. . . . . . x x x x x x x . . . . . . . . . .
 x x x x x x x . x x . . x x x x x x x x x . .
x x x x . . . . . x x . . x x . . x x x x . .
 . x x . . . . x . . x . . . x . . . . . x x .
. x x . . . . x . . . x . . . . . . . . . x .
 . . . . . . . . . x . . . . . . . . . x . x .
x x x . . . . . . . . . . . . x x . . . . x .
 x x x x x x x x . . . . . . . . . . . . x x .
. . . . . . . . x x x x x x x x x x x x x x .
`,
  },
];

/**
 * Turns axial cells into odd-r art, so shapes defined by hex maths (rings, stars) can use the
 * same pipeline. `cell` returns the art character for (q, r), or null for "not drawn".
 */
function axialArt(radius: number, cell: (q: number, r: number) => string | null): string {
  const rows: string[] = [];
  const cols = new Map<number, Map<number, string>>();
  let minCol = Infinity;
  let maxCol = -Infinity;
  for (let r = -radius; r <= radius; r++) {
    const row = r + radius;
    const line = new Map<number, string>();
    for (let q = -radius * 2; q <= radius * 2; q++) {
      if (dist(q, r) > radius) continue;
      const ch = cell(q, r);
      if (ch === null) continue;
      // axial -> odd-r column for this row (parseArt inverts this, up to a translation)
      const col = q + (row - (row & 1)) / 2;
      line.set(col, ch);
      minCol = Math.min(minCol, col);
      maxCol = Math.max(maxCol, col);
    }
    cols.set(row, line);
  }
  for (let row = 0; row <= radius * 2; row++) {
    const line = cols.get(row)!;
    const chars: string[] = [];
    for (let c = minCol; c <= maxCol; c++) chars.push(line.get(c) ?? ".");
    rows.push((row % 2 ? " " : "") + chars.join(" "));
  }
  return rows.join("\n");
}

/** Hex distance from the origin. */
function dist(q: number, r: number): number {
  return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
}

/** A rhombus standing on its point: rows 1, 2, ... n, ... 2, 1 hexes wide. */
function diamondArt(n: number): string {
  const rows: string[] = [];
  const width = n + 2;
  for (let i = 0; i < 2 * n - 1; i++) {
    const w = n - Math.abs(n - 1 - i);
    // Centre each row. Odd rows already sit half a hex to the right.
    const shift = i % 2;
    const start = (width - 1) / 2 - (w - 1 + shift) / 2;
    const cells = Array.from({ length: width }, (_, c) =>
      c >= start && c < start + w ? "x" : ".",
    );
    rows.push((i % 2 ? " " : "") + cells.join(" "));
  }
  return rows.join("\n");
}

// ---------------------------------------------------------------------------

interface Cell {
  q: number;
  r: number;
  ch: string;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
];

function parseArt(art: string): Cell[] {
  const lines = art.split("\n").filter((l) => l.trim().length > 0);
  const cells: Cell[] = [];
  lines.forEach((line, row) => {
    line
      .trim()
      .split(/\s+/)
      .forEach((ch, col) => {
        // odd-r offset -> axial
        const q = col - (row - (row & 1)) / 2;
        cells.push({ q, r: row, ch });
      });
  });
  // One extra ring of sea around the box: pad with "." on all sides.
  const width = Math.max(...lines.map((l) => l.trim().split(/\s+/).length));
  const pad: Cell[] = [];
  for (let row = -1; row <= lines.length; row++) {
    for (let col = -1; col <= width; col++) {
      if (row >= 0 && row < lines.length && col >= 0 && col < width) continue;
      pad.push({ q: col - (row - (row & 1)) / 2, r: row, ch: "." });
    }
  }
  return [...cells, ...pad];
}

/** Largest-remainder split of n hexes into the base mix (4/4/4/3/3/1 per 19). */
function landMix(n: number): Record<Terrain, number> {
  const base: [Terrain, number][] = [
    ["forest", 4],
    ["pasture", 4],
    ["fields", 4],
    ["hills", 3],
    ["mountains", 3],
    ["desert", 1],
  ];
  const exact = base.map(([t, c]) => ({ t, v: (c * n) / 19 }));
  const out = Object.fromEntries(exact.map((e) => [e.t, Math.floor(e.v)])) as Record<
    Terrain,
    number
  >;
  let left = n - Object.values(out).reduce((a, b) => a + b, 0);
  const order = [...exact].sort((a, b) => (b.v % 1) - (a.v % 1));
  for (const e of order) {
    if (left-- <= 0) break;
    out[e.t]++;
  }
  // Every map needs a desert for the robber to start on.
  if (out.desert === 0) {
    out.desert = 1;
    const biggest = (["forest", "pasture", "fields"] as Terrain[]).sort(
      (a, b) => out[b] - out[a],
    )[0]!;
    out[biggest]--;
  }
  return out;
}

const BASE_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const TOP_UP = [4, 9, 5, 10];

function tokenPool(count: number, copies: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < copies; i++) out.push(...BASE_TOKENS);
  if (out.length > count) throw new Error(`${copies} token copies is more than ${count} tokens`);
  for (let i = 0; out.length < count; i++) out.push(TOP_UP[i % TOP_UP.length]!);
  return out.sort((a, b) => a - b);
}

function portPool(n: number): Record<string, number> {
  const k = Math.max(1, Math.round(n / 9));
  return {
    any3to1: Math.max(k, n - 5 * k),
    wood2to1: k,
    brick2to1: k,
    sheep2to1: k,
    wheat2to1: k,
    ore2to1: k,
  };
}

function build(shape: Shape) {
  const cells = parseArt(shape.art);
  const land = cells.filter((c) => c.ch !== ".");
  const landKeys = new Set(land.map((c) => `${c.q},${c.r}`));
  const sea = cells.filter((c) => c.ch === ".");

  const mix = landMix(land.length);
  const fixed = land.filter((c) => c.ch !== "x");
  const pool = { ...mix };
  for (const c of fixed) {
    const t = FIXED[c.ch];
    if (!t) throw new Error(`${shape.id}: unknown art character "${c.ch}"`);
    pool[t]--;
    if (pool[t] < 0) throw new Error(`${shape.id}: too many fixed ${t}`);
  }

  const coastal = land.filter((c) =>
    DIRS.some(([dq, dr]) => !landKeys.has(`${c.q + dq!},${c.r + dr!}`)),
  ).length;
  // About one port per 3.5 coastal hexes, but never fewer than the base board's 9
  // (5 on maps smaller than the base board).
  const minPorts = land.length < 19 ? 5 : 9;
  const ports = portPool(Math.max(minPorts, Math.round(coastal / 3.5)));
  const portCount = Object.values(ports).reduce((a, b) => a + b, 0);

  const hexLines = [
    ...land.map((c) => {
      const terrain = c.ch === "x" ? "pool:land" : FIXED[c.ch]!;
      const token = terrain === "desert" ? "" : `, "token": "pool:tokens"`;
      return `{ "q": ${c.q}, "r": ${c.r}, "terrain": "${terrain}"${token} }`;
    }),
    ...sea.map((c) => `{ "q": ${c.q}, "r": ${c.r}, "terrain": "sea" }`),
  ];
  const tokens = shape.tokens
    ? [...shape.tokens].sort((a, b) => a - b)
    : tokenPool(land.length - mix.desert, shape.tokenCopies);
  if (tokens.length !== land.length - mix.desert) {
    throw new Error(`${shape.id}: ${tokens.length} tokens for ${land.length - mix.desert} hexes`);
  }
  // Player counts are upper bounds (spec 023): every map starts at 1.
  const players = shape.players ?? { min: 1, max: 4 };

  const json = `{
  "id": "${shape.id}",
  "name": "${shape.name}",
  "description": "${shape.description}",
  "version": 1,
  "players": { "min": ${players.min}, "max": ${players.max} },
  "vpToWin": ${shape.vpToWin},
  "hexes": [
    ${hexLines.join(",\n    ")}
  ],
  "pools": {
    "terrain": { "land": ${JSON.stringify(pool).replace(/,/g, ", ").replace(/:/g, ": ")} },
    "tokens": { "tokens": ${JSON.stringify(tokens).replace(/,/g, ", ")} },
    "ports": { "ports": ${JSON.stringify(ports).replace(/,/g, ", ").replace(/:/g, ": ")} }
  },
  "ports": [
    ${Array.from({ length: portCount }, () => `{ "edge": "auto", "type": "pool:ports" }`).join(",\n    ")}
  ],
  "robberStart": "desert",
  "constraints": ["no-adjacent-red-tokens"],
  "modules": ${JSON.stringify(shape.modules).replace(/,/g, ", ")}
}
`;
  const here = dirname(fileURLToPath(import.meta.url));
  writeFileSync(join(here, shape.draft ? "" : "..", `${shape.id}.json`), json);
  const reds = tokens.filter((t) => t === 6 || t === 8).length;
  console.log(
    `${shape.id}: ${land.length} land (${fixed.length} fixed), ${coastal} coastal, ` +
      `${tokens.length} tokens (${reds} red), ${portCount} ports`,
  );
}

for (const s of SHAPES) build(s);
