/**
 * Fanned hand layout. Each non-empty group shows its first card in full and the rest as
 * overlapping "slivers". Slivers shrink as the hand grows; when even the smallest sliver
 * doesn't fit, each group draws only its first few cards and the count badge carries the total.
 */
export interface FanInput {
  /** Pixels available. */
  width: number;
  cardW: number;
  /** Space between groups. */
  gap: number;
  /** Cards per group, in display order. */
  groups: number[];
  minSliver?: number;
}

export interface Fan {
  /** Visible width of each card behind the first in a group. */
  sliver: number;
  /** Cards to draw per group (0 for an empty group). */
  shown: number[];
}

export const MIN_SLIVER = 6;

export function layoutFan({ width, cardW, gap, groups, minSliver = MIN_SLIVER }: FanInput): Fan {
  const maxSliver = cardW * 0.5;
  const nonEmpty = groups.filter((n) => n > 0).length;
  const base = nonEmpty * cardW + gap * Math.max(0, nonEmpty - 1);
  const extra = groups.reduce((a, n) => a + Math.max(0, n - 1), 0);
  if (extra === 0) return { sliver: maxSliver, shown: [...groups] };

  // Rounded down so float error never makes the fan a hair wider than the space.
  const fits = Math.floor(((width - base) / extra) * 100) / 100;
  if (fits >= minSliver) return { sliver: Math.min(maxSliver, fits), shown: [...groups] };

  // Cap every group at `cap` cards, as many as fit at the minimum sliver.
  let cap = Math.max(...groups);
  const extraAt = (c: number) => groups.reduce((a, n) => a + Math.max(0, Math.min(n, c) - 1), 0);
  while (cap > 1 && base + extraAt(cap) * minSliver > width) cap--;
  return { sliver: minSliver, shown: groups.map((n) => Math.min(n, cap)) };
}

/** Total width a fan takes. */
export function fanWidth(fan: Fan, cardW: number, gap: number): number {
  const drawn = fan.shown.filter((n) => n > 0);
  return (
    drawn.reduce((a, n) => a + cardW + (n - 1) * fan.sliver, 0) +
    gap * Math.max(0, drawn.length - 1)
  );
}
