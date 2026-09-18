/**
 * Studio 3D palette. Every colour is DERIVED from the design tokens of `src/lib/network/theme.ts`
 * (the single token constants module for WebGL paint) by mixing token pairs — no literal colour
 * lives in the studio. Pure module (no three.js) so it stays unit-testable and tree-shakeable.
 */
import { TOKEN_HEX, hexToInt, type TokenName } from "@/lib/network/theme";

function channels(hex: string): [number, number, number] {
  const n = hexToInt(hex);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Linear sRGB-space mix of two token colours: t = 0 → a, t = 1 → b. */
export function mixTokens(a: TokenName, b: TokenName, t: number): string {
  return mixHex(TOKEN_HEX[a], TOKEN_HEX[b], t);
}

export function mixHex(a: string, b: string, t: number): string {
  const k = Math.min(1, Math.max(0, t));
  const ca = channels(a);
  const cb = channels(b);
  return toHex(
    ca[0] + (cb[0] - ca[0]) * k,
    ca[1] + (cb[1] - ca[1]) * k,
    ca[2] + (cb[2] - ca[2]) * k,
  );
}

/** Scale a colour towards black (f < 1) or leave it (f = 1). */
export function shadeHex(hex: string, f: number): string {
  const [r, g, b] = channels(hex);
  return toHex(r * f, g * f, b * f);
}

export const STUDIO_PALETTE = {
  // Sky & atmosphere
  skyDayTop: mixTokens("blue", "blue-text", 0.35),
  skyDayHorizon: mixTokens("blue-text", "ink", 0.62),
  skyNightTop: mixTokens("bg", "blue-600", 0.22),
  skyNightHorizon: mixTokens("bg-2", "blue", 0.3),
  groundBounceDay: mixTokens("muted-2", "orange", 0.12),
  groundBounceNight: mixTokens("bg", "surface", 0.5),
  sun: mixTokens("ink", "orange-text", 0.22),
  moon: mixTokens("blue-text", "ink", 0.55),
  stars: mixTokens("ink", "blue-text", 0.2),

  // Urban context (Tunisian: whitewashed walls + blue shutters, pale paving, asphalt)
  asphalt: mixTokens("surface-3", "muted-2", 0.28),
  asphaltNight: mixTokens("surface", "surface-3", 0.4),
  paving: mixTokens("muted-2", "ink-soft", 0.42),
  pavingJoint: mixTokens("muted-2", "surface-3", 0.4),
  curb: mixTokens("muted", "ink-soft", 0.5),
  roadMarking: mixTokens("ink-soft", "ink", 0.5),
  roadMarkingYellow: mixTokens("warning", "orange-text", 0.3),
  grass: mixHex(mixTokens("success", "warning", 0.45), TOKEN_HEX["surface-3"], 0.5),
  grassDry: mixHex(mixTokens("success", "warning", 0.65), TOKEN_HEX["surface-3"], 0.45),
  foliage: mixTokens("success", "bg", 0.55),
  trunk: mixTokens("orange", "surface-3", 0.72),
  earth: mixTokens("muted-2", "orange", 0.16),
  wallWhite: mixTokens("ink-soft", "ink", 0.5),
  wallOchre: mixTokens("ink-soft", "orange-text", 0.28),
  shutterBlue: mixTokens("blue", "blue-text", 0.25),
  windowDark: mixTokens("bg", "blue-600", 0.3),
  windowLit: mixTokens("warning", "orange-text", 0.45),
  guardRail: mixTokens("muted", "ink-soft", 0.3),
  hills: mixHex(mixTokens("success", "warning", 0.4), TOKEN_HEX["muted-2"], 0.65),

  // Porteur materials
  aluminium: mixTokens("ink-soft", "ink", 0.3),
  aluminiumDark: mixTokens("muted-2", "surface-3", 0.35),
  steelDark: mixTokens("surface-2", "surface-3", 0.5),
  plinth: mixTokens("muted-2", "surface-3", 0.55),
  bezel: mixTokens("bg", "surface", 0.6),
  screenOff: mixTokens("bg", "blue-600", 0.12),
  ledStrip: TOKEN_HEX["blue-text"],
  solarCell: mixTokens("blue-600", "bg", 0.35),
  solarGrid: mixTokens("blue-text", "muted", 0.4),
  copper: mixTokens("orange", "warning", 0.3),
  gold: mixTokens("orange-text", "warning", 0.55),
  sphereCore: mixTokens("blue-600", "bg", 0.25),
  sphereShellDark: mixTokens("blue-600", "bg", 0.55),
  sensorBody: mixTokens("ink-soft", "muted", 0.4),
  streetLamp: mixTokens("warning", "orange-text", 0.5),
  screenSpill: mixTokens("orange-text", "red-text", 0.35),

  // Creative default texture (ZELQANE gradient)
  creativeRedDeep: TOKEN_HEX["red-600"],
  creativeRed: TOKEN_HEX.red,
  creativeOrange: TOKEN_HEX.orange,
  creativeGround: TOKEN_HEX.bg,
  creativeInk: TOKEN_HEX["on-brand"],
  creativeBlue: TOKEN_HEX["blue-text"],
  /** Neutral multiplier (texture tint, emissive colour). */
  white: TOKEN_HEX["ink-strong"],

  // Repère (calibration)
  axisX: TOKEN_HEX["red-text"],
  axisY: TOKEN_HEX.success,
  axisZ: TOKEN_HEX["blue-text"],
  gridMinor: TOKEN_HEX["surface-3"],
  gridMajor: TOKEN_HEX["muted-2"],
  bbox: TOKEN_HEX["orange-text"],
  anchor: TOKEN_HEX["orange-text"],
  selectedFace: TOKEN_HEX["blue-text"],
} as const;

export type StudioColorName = keyof typeof STUDIO_PALETTE;

/** 0xrrggbb for three.js constructors. */
export function paletteInt(name: StudioColorName): number {
  return hexToInt(STUDIO_PALETTE[name]);
}

/** `rgba()` string for canvas drawing. */
export function paletteRgba(name: StudioColorName, alpha: number): string {
  const [r, g, b] = channels(STUDIO_PALETTE[name]);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
}
