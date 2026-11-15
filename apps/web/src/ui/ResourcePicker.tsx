import { BASE_RESOURCES } from "@settlers/engine";

interface Props {
  value: Record<string, number>;
  onChange(next: Record<string, number>): void;
  /** Most you can pick of each resource (e.g. what's in your hand). */
  max?: Record<string, number>;
  /** Most you can pick in total. */
  limit?: number;
  label: string;
}

/** + / − counters for each resource. Used for discards, Bounty picks and trade offers. */
export function ResourcePicker({ value, onChange, max, limit, label }: Props) {
  const total = Object.values(value).reduce((a, b) => a + b, 0);
  const set = (r: string, n: number) => onChange({ ...value, [r]: Math.max(0, n) });
  return (
    <div className="picker" role="group" aria-label={label}>
      {BASE_RESOURCES.map((r) => {
        const n = value[r] ?? 0;
        const atMax =
          (max !== undefined && n >= (max[r] ?? 0)) || (limit !== undefined && total >= limit);
        return (
          <div key={r} className={`pick res-${r}`}>
            <span className="res-count">{n}</span>
            <span className="res-name">{r}</span>
            <span className="pm">
              <button aria-label={`One less ${r}`} disabled={n === 0} onClick={() => set(r, n - 1)}>
                −
              </button>
              <button aria-label={`One more ${r}`} disabled={atMax} onClick={() => set(r, n + 1)}>
                +
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

/** Drop zero entries before sending. */
export const nonZero = (r: Record<string, number>) =>
  Object.fromEntries(Object.entries(r).filter(([, n]) => n > 0));
