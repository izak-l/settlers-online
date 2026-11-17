import { MODULE_IDS } from "@settlers/engine";
import { MAP_CATALOG, MapDefSchema, validateMapDef, type MapDef } from "@settlers/maps";
import type { ExtraMap } from "./GamePicker";

function whyNot(def: MapDef, seats: number): string | undefined {
  const missing = def.modules.filter((m) => !MODULE_IDS.includes(m));
  if (missing.length > 0) return `Needs ${missing.join(", ")} (not built yet)`;
  // Player counts are upper bounds (spec 023): fewer players may start.
  if (seats > def.players.max) return `For up to ${def.players.max} players`;
  const check = validateMapDef(def);
  if (!check.ok) return check.errors.map((e) => e.message).join("; ");
  return undefined;
}

/**
 * The dev sandbox's draft maps (keyed by file path), for its Drafts tab. Drafts that can't be
 * played with `seats` players, or at all yet, are listed with the reason.
 */
export function sandboxDrafts(drafts: Record<string, unknown>, seats: number): ExtraMap[] {
  return Object.entries(drafts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, raw]): ExtraMap => {
      const file = path.split("/").at(-1) ?? path;
      const parsed = MapDefSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          id: file,
          name: file,
          description: "",
          def: { ...MAP_CATALOG[0]!.def, hexes: [] },
          disabledReason: `Invalid map file: ${parsed.error.issues[0]?.message ?? "unknown error"}`,
        };
      }
      const def = parsed.data;
      return {
        id: def.id,
        name: def.name ?? def.id,
        description: def.description ?? "",
        def,
        disabledReason: whyNot(def, seats),
      };
    });
}
