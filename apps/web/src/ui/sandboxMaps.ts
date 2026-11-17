import { MODULE_IDS } from "@settlers/engine";
import { MAP_CATALOG, MapDefSchema, validateMapDef, type MapDef } from "@settlers/maps";
import { scenarioOptions, type MapOption } from "./MapPicker";

function whyNot(def: MapDef, seats: number): string | undefined {
  const missing = def.modules.filter((m) => !MODULE_IDS.includes(m));
  if (missing.length > 0) return `Needs ${missing.join(", ")} (not built yet)`;
  const { min, max } = def.players;
  if (seats < min || seats > max) return `For ${min}–${max} players`;
  const check = validateMapDef(def);
  if (!check.ok) return check.errors.map((e) => e.message).join("; ");
  return undefined;
}

/**
 * The dev sandbox's maps: the catalog, then every draft file (keyed by path). Maps that can't be
 * played with `seats` players, or at all yet, are listed with the reason.
 */
export function sandboxMapOptions(drafts: Record<string, unknown>, seats: number): MapOption[] {
  const catalog = MAP_CATALOG.map((m) => ({ ...m, disabledReason: whyNot(m.def, seats) }));
  const extra = Object.entries(drafts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, raw]): MapOption | null => {
      const file = path.split("/").at(-1) ?? path;
      const parsed = MapDefSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          id: file,
          name: file,
          description: "",
          def: { ...MAP_CATALOG[0]!.def, hexes: [] },
          tag: "draft",
          disabledReason: `Invalid map file: ${parsed.error.issues[0]?.message ?? "unknown error"}`,
        };
      }
      const def = parsed.data;
      return {
        id: def.id,
        name: def.name ?? def.id,
        description: def.description ?? "",
        def,
        tag: "draft",
        disabledReason: whyNot(def, seats),
      };
    })
    .filter((o): o is MapOption => o !== null);
  // Seafaring scenarios (fixed maps), for this seat count.
  const scenarios = scenarioOptions(seats, "fixed").map((o) => ({ ...o, id: o.def.id }));
  return [...catalog, ...scenarios, ...extra];
}
