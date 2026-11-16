/**
 * Checks the draft maps in this folder.
 *
 *   cd tools/sim && pnpm exec tsx ../../packages/maps/maps/drafts/check.ts
 *
 * For each draft: parse with MapDefSchema, check pool accounting (deserts drawn from the land
 * pool get no token), generate with 200 seeds, and run validateResolvedMap on every result.
 * "Land is not fully connected" is reported separately: the island maps expect it until
 * seafaring allows islands.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { seedFromString } from "@settlers/engine";
import { MapDefSchema, generateMap, validateResolvedMap, type MapDef } from "../../src/index";

const SEEDS = 200;
const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here)
  .filter((f) => f.endsWith(".json"))
  .sort();

function poolErrors(def: MapDef): string[] {
  const errors: string[] = [];
  const poolLand = def.hexes.filter((h) => h.terrain === "pool:land");
  const land = def.pools?.land ?? {};
  const landTotal = Object.values(land).reduce((a, b) => a + (b ?? 0), 0);
  if (landTotal !== poolLand.length) {
    errors.push(`land pool has ${landTotal} tiles, map has ${poolLand.length} pool:land hexes`);
  }
  const tokenHexes = def.hexes.filter((h) => h.token === "pool:tokens").length;
  const needed = tokenHexes - (land.desert ?? 0);
  const tokens = def.pools?.tokens?.length ?? 0;
  if (tokens !== needed) errors.push(`token pool has ${tokens} tokens, map needs ${needed}`);
  const portEntries = (def.ports ?? []).filter((p) => p.type === "pool:ports").length;
  const portTotal = Object.values(def.pools?.ports ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  if (portTotal !== portEntries) {
    errors.push(`port pool has ${portTotal} ports, map has ${portEntries} pool:ports entries`);
  }
  if (def.hexes.some((h) => h.terrain === "fog" || h.terrain === "gold")) {
    errors.push("unexpected fog/gold terrain");
  }
  return errors;
}

let failed = false;
for (const file of files) {
  const raw = JSON.parse(readFileSync(join(here, file), "utf8")) as unknown;
  const parsed = MapDefSchema.safeParse(raw);
  if (!parsed.success) {
    failed = true;
    console.log(`\n${file}: SCHEMA ERRORS`);
    for (const i of parsed.error.issues) console.log(`  ${i.path.join(".")}: ${i.message}`);
    continue;
  }
  const def = parsed.data;
  const errors = new Map<string, number>();
  const warnings = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  if (`${def.id}.json` !== file) bump(errors, `id "${def.id}" does not match file name`);
  for (const e of poolErrors(def)) bump(errors, e);

  for (let i = 0; i < SEEDS; i++) {
    let map;
    try {
      ({ map } = generateMap(def, seedFromString(`${def.id}:${i}`)));
    } catch (e) {
      bump(errors, `generateMap threw: ${(e as Error).message}`);
      continue;
    }
    for (const e of validateResolvedMap(map).errors) {
      if (e.code === "DISCONNECTED") bump(warnings, e.message);
      else bump(errors, `${e.code}: ${e.message}`);
    }
  }

  const landCount = def.hexes.filter((h) => h.terrain !== "sea").length;
  console.log(`\n${file}  (${landCount} land hexes, ${SEEDS} seeds)`);
  if (errors.size === 0) console.log("  errors: none");
  for (const [msg, n] of errors) console.log(`  ERROR x${n}: ${msg}`);
  for (const [msg, n] of warnings) console.log(`  island warning x${n}: ${msg}`);
  if (errors.size > 0) failed = true;
}

process.exit(failed ? 1 : 0);
