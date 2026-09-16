/**
 * Token constants for canvas/WebGL paint (MapLibre style expressions, three.js materials).
 *
 * CSS utilities cannot reach a WebGL paint config, so this module mirrors the design tokens of
 * `src/app/globals.css` as literal values. It is the ONLY place outside globals.css where map/3D
 * colours may be written; `__tests__/theme.test.ts` fails if a value drifts from the stylesheet.
 */

/** Opaque tokens, lowercase `#rrggbb`, keyed by their CSS custom property name (without `--`). */
export const TOKEN_HEX = {
  bg: "#0a0b10",
  "bg-2": "#0f1117",
  surface: "#151821",
  "surface-2": "#1c2029",
  "surface-3": "#252a35",
  "ink-strong": "#ffffff",
  ink: "#f5f3ef",
  "ink-soft": "#d5d8de",
  muted: "#a3a9b5",
  "muted-2": "#8e95a2",
  red: "#e11d2a",
  "red-600": "#c8101c",
  "red-text": "#ff5a63",
  orange: "#f07a1a",
  "orange-text": "#ff9a45",
  blue: "#0a5ca8",
  "blue-600": "#084b8a",
  "blue-text": "#5aa9f0",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
  info: "#60a5fa",
  "on-brand": "#ffffff",
  "on-orange": "#1a0f05",
} as const;

export type TokenName = keyof typeof TOKEN_HEX;

/** Semantic palette for the network map and the 3D studio. */
export const MAP_COLORS = {
  background: TOKEN_HEX.bg,
  land: TOKEN_HEX["bg-2"],
  surface: TOKEN_HEX.surface,
  ink: TOKEN_HEX.ink,
  muted: TOKEN_HEX.muted,
  /** Zones: orange tint (energy), selected: blue (data). */
  zoneFill: TOKEN_HEX.orange,
  zoneLine: TOKEN_HEX["orange-text"],
  zoneInactive: TOKEN_HEX["muted-2"],
  zoneSelected: TOKEN_HEX["blue-text"],
  /** Catchment area (zone de chalandise) + measure line. */
  catchment: TOKEN_HEX["blue-text"],
  measure: TOKEN_HEX["orange-text"],
  measureHalo: TOKEN_HEX.bg,
  /** Porteur type accents. */
  typeA: TOKEN_HEX["orange-text"],
  typeB: TOKEN_HEX["blue-text"],
  typeC: TOKEN_HEX["red-text"],
  typeD: TOKEN_HEX.muted,
  /** Technical status. */
  statusActif: TOKEN_HEX.success,
  statusMaintenance: TOKEN_HEX.warning,
  statusInactif: TOKEN_HEX["muted-2"],
  statusHorsLigne: TOKEN_HEX.danger,
  selected: TOKEN_HEX["blue-text"],
} as const;

/** Opacity presets used by map layers (kept here so 2D/3D stay consistent). */
export const MAP_OPACITY = {
  zoneFill: 0.1,
  zoneFillSelected: 0.16,
  zoneLine: 0.7,
  cone: 0.2,
  coneSelected: 0.34,
  catchmentFill: 0.1,
  extrusion: 0.88,
} as const;

/** Raster basemap paint tuned so the TPUB overlays keep their contrast. */
export const BASEMAP_PAINT = {
  dark: { "raster-opacity": 1, "raster-saturation": -0.35, "raster-brightness-max": 0.9 },
  light: { "raster-opacity": 1, "raster-saturation": -0.2, "raster-brightness-max": 1 },
  satellite: { "raster-opacity": 1, "raster-saturation": -0.15, "raster-brightness-max": 0.85 },
} as const;

/** `#rrggbb` → 0xrrggbb (three.js `Color`). */
export function hexToInt(hex: string): number {
  const clean = hex.trim().replace(/^#/, "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new RangeError(`Couleur invalide : ${hex}`);
  return Number.parseInt(full, 16);
}

/** `#rrggbb` + alpha → `rgba(r, g, b, a)`. */
export function withAlpha(hex: string, alpha: number): string {
  const n = hexToInt(hex);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Token lookup as 0xrrggbb for three.js. */
export function tokenInt(name: TokenName): number {
  return hexToInt(TOKEN_HEX[name]);
}
