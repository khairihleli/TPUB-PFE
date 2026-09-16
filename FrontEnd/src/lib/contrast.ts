/**
 * WCAG 2.x contrast helpers + the light token set (design-reference §7.3, phase 1 of VD-10).
 * The dark set is read from globals.css by `__tests__/contrast.test.ts`; the light set lives here
 * until phase 2 ships `:root[data-theme="light"]` (the test then reads both from CSS).
 */

export type Rgb = readonly [number, number, number];
export type Rgba = readonly [number, number, number, number];

export function parseColor(value: string): Rgba | null {
  const v = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (hex) {
    const h = hex[1] as string;
    const full =
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
      1,
    ];
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v);
  if (rgb)
    return [
      Number(rgb[1]),
      Number(rgb[2]),
      Number(rgb[3]),
      rgb[4] === undefined ? 1 : Number(rgb[4]),
    ];
  return null;
}

/** Alpha-composites `fg` over an opaque `bg`. */
export function composite(fg: Rgba, bg: Rgb): Rgb {
  const a = fg[3];
  return [
    Math.round(fg[0] * a + bg[0] * (1 - a)),
    Math.round(fg[1] * a + bg[1] * (1 - a)),
    Math.round(fg[2] * a + bg[2] * (1 - a)),
  ];
}

export function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Light work-surface tokens (design-reference §7.3; `--muted-2` adjusted to pass on bg). */
export const LIGHT_THEME_TOKENS = {
  bg: "#f7f7f5",
  "bg-2": "#efefec",
  surface: "#ffffff",
  "surface-2": "#f3f4f6",
  "ink-strong": "#0f1219",
  ink: "#0f1219",
  "ink-soft": "#262b36",
  muted: "#4a5160",
  "muted-2": "#646b78",
  success: "#067647",
  warning: "#b54708",
  danger: "#b42318",
  info: "#175cd3",
  "violet-text": "#6941c6",
  "blue-text": "#0a5ca8",
  "orange-text": "#b4530a",
  "red-text": "#c8101c",
} as const;

/** Text inks that must reach 4.5:1 on every work surface. */
export const TEXT_INKS = ["ink-strong", "ink", "ink-soft", "muted", "muted-2"] as const;
/** Status / feedback inks (pills, alerts). */
export const STATUS_INKS = [
  "success",
  "warning",
  "danger",
  "info",
  "violet-text",
  "blue-text",
  "orange-text",
  "muted",
  "ink-soft",
] as const;
export const DARK_SURFACES = ["bg", "bg-2", "surface", "surface-2"] as const;
export const LIGHT_SURFACES = ["bg", "surface", "surface-2"] as const;
export const AA_TEXT = 4.5;
