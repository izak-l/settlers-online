import {
  FEATURE_IDS,
  type FeatureId,
  type FeatureOverrides,
  type Features,
} from "@settlers/engine";

/** Our own wording for each switch (spec 014). */
export const FEATURE_LABELS: Record<FeatureId, string> = {
  devCards: "Development cards",
  robber: "Robber",
  longestRoad: "Longest Road",
  largestArmy: "Largest Army",
  ports: "Harbors",
};

/** "No development cards, no robber", or null when everything is on. */
export function featureSummary(features: Features): string | null {
  const off = FEATURE_IDS.filter((id) => !features[id]).map((id) =>
    FEATURE_LABELS[id].toLowerCase(),
  );
  if (off.length === 0) return null;
  const text = `No ${off.join(", no ")}`;
  return text
    .replace("no longest road", "no Longest Road")
    .replace("no largest army", "no Largest Army");
}

/**
 * The house rules to send when the host flips one switch: only switches that differ from the
 * map's own value are kept, so a map change later brings its defaults back for the rest.
 */
export function toggleRule(
  mapFeatures: Features,
  houseRules: FeatureOverrides,
  id: FeatureId,
  on: boolean,
): FeatureOverrides {
  const next: FeatureOverrides = { ...houseRules, [id]: on };
  for (const key of FEATURE_IDS) {
    if (next[key] === undefined || next[key] === mapFeatures[key]) delete next[key];
  }
  return next;
}
