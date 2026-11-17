import type { ActionSpec, BuildOption } from "@settlers/engine";

export interface BuildLocation {
  kind: "edge" | "vertex";
  id: string;
  options: BuildOption[];
}

/** Group server-provided choices; no placement or affordability rules belong in the client. */
export function buildLocations(options: BuildOption[]): BuildLocation[] {
  const locations = new Map<string, BuildLocation>();
  for (const option of options) {
    const action = option.action;
    const kind = "edge" in action ? "edge" : "vertex" in action ? "vertex" : null;
    if (!kind) continue;
    const id = "edge" in action ? action.edge : "vertex" in action ? action.vertex : "";
    const key = `${kind}:${id}`;
    const location = locations.get(key) ?? { kind, id, options: [] };
    location.options.push(option);
    locations.set(key, location);
  }
  return [...locations.values()];
}

/**
 * With a build mode picked in the side panel (spec 231), a click on a location builds at once:
 * the mode's legal action at that edge or corner, if there is one. Otherwise the popup opens.
 */
export function directBuild(modeTargets: ActionSpec[], locationId: string): ActionSpec | undefined {
  return modeTargets.find(
    (a) => ("edge" in a && a.edge === locationId) || ("vertex" in a && a.vertex === locationId),
  );
}
