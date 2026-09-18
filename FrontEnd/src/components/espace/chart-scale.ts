/** Pure helpers for the small SVG charts (no chart library). */

/** Rounds a maximum up to a clean axis value: 0.87 → 1, 1 234 → 2 000, 4 100 → 5 000. */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const nice =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * exponent;
}

/** Evenly spaced ticks from 0 to max (inclusive). */
export function axisTicks(max: number, intervals = 2): number[] {
  const n = Math.max(1, Math.floor(intervals));
  return Array.from({ length: n + 1 }, (_, i) => (max * i) / n);
}

/** Share of `value` on a 0..max scale, in percent, clamped to [0, 100]. */
export function percentOf(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) return 0;
  return Math.min(100, (value / max) * 100);
}

export interface DonutArc {
  /** Visible arc length. */
  length: number;
  /** stroke-dashoffset (negative distance from the start of the circle). */
  offset: number;
  /** Share of the total, 0..1. */
  share: number;
}

/**
 * Arcs for a donut drawn with stroke-dasharray. Zero values get a zero-length arc.
 * `gap` (surface gap between segments) is removed from each visible arc when there are
 * at least two non-zero segments.
 */
export function donutArcs(values: readonly number[], circumference: number, gap = 0): DonutArc[] {
  const clean = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  if (total <= 0) return clean.map(() => ({ length: 0, offset: 0, share: 0 }));
  const visible = clean.filter((v) => v > 0).length;
  const effectiveGap = visible >= 2 ? gap : 0;
  let cursor = 0;
  return clean.map((v) => {
    const share = v / total;
    const full = share * circumference;
    const arc: DonutArc = {
      length: v > 0 ? Math.max(0, full - effectiveGap) : 0,
      offset: cursor === 0 ? 0 : -cursor,
      share,
    };
    cursor += full;
    return arc;
  });
}
