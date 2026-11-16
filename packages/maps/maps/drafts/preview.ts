/**
 * Renders every draft map in this folder to one self-contained preview.html.
 *
 *   cd tools/sim && pnpm exec tsx ../../packages/maps/maps/drafts/preview.ts
 *   open packages/maps/maps/drafts/preview.html
 *
 * Each map is generated with the fixed seed "<id>:preview". Pass a directory as the first
 * argument to also write one standalone .svg per map there.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { seedFromString } from "@settlers/engine";
import { MapDefSchema, generateMap, type ResolvedMap } from "../../src/index";

const SIZE = 30;
const SQ3 = Math.sqrt(3);
const FILL: Record<string, string> = {
  forest: "#2f6b34",
  pasture: "#9ccc65",
  fields: "#f2d14b",
  hills: "#c4683f",
  mountains: "#8d8f94",
  desert: "#e6d3a3",
  sea: "#3f7fbf",
};
const PORT_LABEL: Record<string, string> = {
  any3to1: "3:1",
  wood2to1: "2:1 wood",
  brick2to1: "2:1 brick",
  sheep2to1: "2:1 sheep",
  wheat2to1: "2:1 wheat",
  ore2to1: "2:1 ore",
};

const px = (q: number, r: number) => ({ x: SIZE * SQ3 * (q + r / 2), y: SIZE * 1.5 * r });

function corners(cx: number, cy: number, s = SIZE): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${(cx + s * Math.cos(a)).toFixed(1)},${(cy + s * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

function svg(map: ResolvedMap): string {
  const pts = map.hexes.map((h) => px(h.q, h.r));
  const minX = Math.min(...pts.map((p) => p.x)) - SIZE;
  const maxX = Math.max(...pts.map((p) => p.x)) + SIZE;
  const minY = Math.min(...pts.map((p) => p.y)) - SIZE;
  const maxY = Math.max(...pts.map((p) => p.y)) + SIZE;
  const out: string[] = [];
  // Sea first, then land on top.
  const sorted = [...map.hexes].sort(
    (a, b) => Number(a.terrain !== "sea") - Number(b.terrain !== "sea"),
  );
  for (const h of sorted) {
    const { x, y } = px(h.q, h.r);
    out.push(
      `<polygon points="${corners(x, y)}" fill="${FILL[h.terrain] ?? "#f0f"}" stroke="${
        h.terrain === "sea" ? "#5a93cc" : "#3b3326"
      }" stroke-width="${h.terrain === "sea" ? 1 : 1.5}"/>`,
    );
    if (h.token !== undefined) {
      const red = h.token === 6 || h.token === 8;
      out.push(
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${SIZE * 0.4}" fill="#fbf3dc" stroke="#6b5a3a"/>`,
        `<text x="${x.toFixed(1)}" y="${(y + 5).toFixed(1)}" text-anchor="middle" font-size="14" font-weight="700" fill="${
          red ? "#c62828" : "#2b2b2b"
        }">${h.token}</text>`,
      );
    }
  }
  const land = new Set(map.hexes.filter((h) => h.terrain !== "sea").map((h) => `${h.q},${h.r}`));
  for (const p of map.ports) {
    const [a, b] = p.edgeId.split("|").map((k) => k.split(",").map(Number) as [number, number]);
    const [l, s] = land.has(`${a![0]},${a![1]}`) ? [a!, b!] : [b!, a!];
    const L = px(l[0], l[1]);
    const S = px(s[0], s[1]);
    const mx = (L.x + S.x) / 2;
    const my = (L.y + S.y) / 2;
    const lx = L.x + (S.x - L.x) * 0.85;
    const ly = L.y + (S.y - L.y) * 0.85;
    const label = PORT_LABEL[p.type] ?? p.type;
    const w = label.length * 6 + 8;
    out.push(
      `<line x1="${mx.toFixed(1)}" y1="${my.toFixed(1)}" x2="${lx.toFixed(1)}" y2="${ly.toFixed(1)}" stroke="#fff" stroke-width="3"/>`,
      `<rect x="${(lx - w / 2).toFixed(1)}" y="${(ly - 8).toFixed(1)}" width="${w}" height="16" rx="4" fill="#fff" stroke="#24476b"/>`,
      `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle" font-size="10" fill="#24476b">${label}</text>`,
    );
  }
  const w = maxX - minX;
  const h = maxY - minY;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(0)} ${minY.toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" font-family="system-ui, sans-serif">${out.join("")}</svg>`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const here = dirname(fileURLToPath(import.meta.url));
const svgDir = process.argv[2];
const sections: string[] = [];
for (const file of readdirSync(here)
  .filter((f) => f.endsWith(".json"))
  .sort()) {
  const raw = JSON.parse(readFileSync(join(here, file), "utf8")) as Record<string, unknown>;
  const def = MapDefSchema.parse(raw);
  let map: ResolvedMap;
  let note = "";
  try {
    ({ map } = generateMap(def, seedFromString(`${def.id}:preview`)));
  } catch (e) {
    // Still draw the shape, without the token constraint, and say why.
    note = `<p class="warn">generateMap failed: ${esc((e as Error).message)}. Drawn without constraints.</p>`;
    ({ map } = generateMap({ ...def, constraints: [] }, seedFromString(`${def.id}:preview`)));
  }
  const landCount = map.hexes.filter((h) => h.terrain !== "sea").length;
  const picture = svg(map);
  if (svgDir) writeFileSync(join(svgDir, `${def.id}.svg`), picture);
  sections.push(`<section>
  <h2>${esc(String(raw.name ?? def.id))} <code>${esc(def.id)}</code></h2>
  <p>${esc(String(raw.description ?? ""))}</p>
  <p class="meta">${landCount} land hexes · ${def.players.min}–${def.players.max} players · ${def.vpToWin} VP to win · ${map.ports.length} ports · modules: ${esc(def.modules.join(", "))}</p>
  ${note}
  <div class="board">${picture}</div>
</section>`);
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Draft Maps</title>
<style>
  body { margin: 0; padding: 24px; background: #f4efe4; color: #2b2b2b; font-family: system-ui, sans-serif; }
  h1 { margin-top: 0; }
  section { background: #fff; border-radius: 10px; padding: 16px 20px; margin-bottom: 24px; box-shadow: 0 1px 4px #0002; }
  h2 { margin: 0 0 4px; } h2 code { font-size: 0.6em; color: #777; font-weight: 400; }
  .warn { color: #b00020; font-weight: 600; }
  .meta { color: #555; font-size: 0.9em; }
  .board { overflow-x: auto; } .board svg { max-width: 100%; height: auto; }
</style>
</head>
<body>
<h1>Draft maps</h1>
<p>Each map is generated with the fixed seed "&lt;id&gt;:preview". Terrain and tokens are random per game.</p>
${sections.join("\n")}
</body>
</html>
`;
writeFileSync(join(here, "preview.html"), html);
console.log(`wrote ${join(here, "preview.html")}`);
