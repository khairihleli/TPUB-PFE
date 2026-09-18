import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AA_TEXT,
  composite,
  contrastRatio,
  DARK_SURFACES,
  LIGHT_SURFACES,
  LIGHT_THEME_TOKENS,
  parseColor,
  type Rgb,
  STATUS_INKS,
  TEXT_INKS,
} from "@/lib/contrast";

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

/** Token values declared in the first `:root { … }` block (dark set). */
function rootTokens(): Record<string, string> {
  const start = css.indexOf(":root {");
  const end = css.indexOf("\n}", start);
  const block = css.slice(start, end);
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g))
    out[m[1] as string] = (m[2] as string).trim();
  return out;
}

const dark = rootTokens();

function resolveToken(tokens: Record<string, string>, name: string, depth = 0): string {
  const value = tokens[name];
  if (!value) throw new Error(`Token manquant : --${name}`);
  const ref = /^var\(--([a-z0-9-]+)\)$/.exec(value);
  if (ref && depth < 5) return resolveToken(tokens, ref[1] as string, depth + 1);
  return value;
}

function rgb(tokens: Record<string, string>, name: string): Rgb {
  const parsed = parseColor(resolveToken(tokens, name));
  if (!parsed) throw new Error(`Couleur illisible : --${name}`);
  return [parsed[0], parsed[1], parsed[2]];
}

const DARK_INK_NAME: Record<string, string> = {
  "violet-text": "violet-text",
  "blue-text": "blue-text",
  "orange-text": "orange-text",
};

describe("contrast gate — dark set (globals.css)", () => {
  it("declares the phase-1 tokens", () => {
    for (const name of [
      "violet",
      "violet-text",
      "violet-soft",
      "violet-line",
      "status-draft",
      "status-pending",
      "status-scheduled",
      "status-live",
      "status-ended",
      "status-problem",
      "cat-1",
      "cat-2",
      "cat-3",
      "cat-4",
      "overlay-subtle",
      "overlay-hover",
      "overlay-strong",
      "scrim",
      "toast-offset",
      "bottom-bar-h",
    ]) {
      expect(dark[name], `--${name}`).toBeDefined();
    }
    expect(css).toMatch(/--text-caption:/);
    expect(css).toMatch(/--text-body:/);
    expect(css).toMatch(/--text-title:/);
    expect(dark["muted-2"]).toBe("#8e95a2");
  });

  it.each(TEXT_INKS.flatMap((ink) => DARK_SURFACES.map((s) => [ink, s] as const)))(
    "text --%s on --%s ≥ 4.5:1",
    (ink, surface) => {
      expect(contrastRatio(rgb(dark, ink), rgb(dark, surface))).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it.each(
    STATUS_INKS.flatMap((ink) =>
      [...DARK_SURFACES, "surface-3"].map((s) => [DARK_INK_NAME[ink] ?? ink, s] as const),
    ),
  )("status --%s on --%s ≥ 4.5:1", (ink, surface) => {
    expect(contrastRatio(rgb(dark, ink), rgb(dark, surface))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(STATUS_INKS.map((ink) => [ink] as const))(
    "status --%s on its own 12 % tint over surface-2 ≥ 4.5:1",
    (ink) => {
      const fg = rgb(dark, ink);
      const tint = composite([...fg, 0.12], rgb(dark, "surface-2"));
      expect(contrastRatio(fg, tint)).toBeGreaterThanOrEqual(AA_TEXT);
    },
  );

  it("status tokens resolve to the semantic inks", () => {
    expect(resolveToken(dark, "status-pending")).toBe(resolveToken(dark, "warning"));
    expect(resolveToken(dark, "status-scheduled")).toBe(resolveToken(dark, "violet-text"));
    expect(resolveToken(dark, "status-problem")).toBe(resolveToken(dark, "danger"));
  });

  it("categorical tokens never reuse a status hue", () => {
    const statuses = ["success", "warning", "danger"].map((n) => resolveToken(dark, n));
    for (const n of ["cat-1", "cat-2", "cat-3", "cat-4"]) {
      expect(statuses).not.toContain(resolveToken(dark, n));
      expect(contrastRatio(rgb(dark, n), rgb(dark, "surface"))).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});

describe("contrast gate — light set (design-reference §7.3)", () => {
  const light = LIGHT_THEME_TOKENS as Record<string, string>;

  it.each(
    [...TEXT_INKS, ...STATUS_INKS].flatMap((ink) => LIGHT_SURFACES.map((s) => [ink, s] as const)),
  )("--%s on --%s ≥ 4.5:1", (ink, surface) => {
    expect(contrastRatio(rgb(light, ink), rgb(light, surface))).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
