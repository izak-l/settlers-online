import { FEATURE_IDS, type FeatureId, type Features } from "@settlers/engine";
import { FEATURE_LABELS, featureSummary } from "./features";

/**
 * Base-game switches (spec 014). Editable: a checkbox per feature. Read-only: a one-line
 * summary of what's off. The server (or the sandbox's engine) decides; this only displays.
 */
export function HouseRules({
  features,
  editable,
  disabled,
  onToggle,
}: {
  features: Features;
  editable: boolean;
  disabled?: boolean;
  onToggle?: (id: FeatureId, on: boolean) => void;
}) {
  if (!editable) {
    return (
      <p className="muted small">House rules: {featureSummary(features) ?? "standard rules"}</p>
    );
  }
  return (
    <fieldset className="house-rules">
      <legend>House rules</legend>
      {FEATURE_IDS.map((id) => (
        <label key={id} className="check">
          <input
            type="checkbox"
            checked={features[id]}
            disabled={disabled}
            onChange={(e) => onToggle?.(id, e.target.checked)}
          />
          {FEATURE_LABELS[id]}
        </label>
      ))}
    </fieldset>
  );
}
