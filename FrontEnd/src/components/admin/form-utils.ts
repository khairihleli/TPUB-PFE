/** Small helpers shared by the back-office forms (zod v4, French messages). */
import type { z } from "zod";

import { ApiError } from "@/lib/api/errors";

export const REQUIRED = "Ce champ est requis.";

export const maxChars = (n: number) => ({ error: `${n} caractères maximum.` });

export type FormErrors<K extends string> = Partial<Record<K, string>>;

/** One French message per field (first issue wins). Unknown paths are ignored. */
export function firstIssues<K extends string>(
  error: z.ZodError,
  fields: readonly K[],
): FormErrors<K> {
  const out: FormErrors<K> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string" || !(fields as readonly string[]).includes(key)) continue;
    const k = key as K;
    if (!out[k]) out[k] = issue.message;
  }
  return out;
}

/**
 * Maps Spring field errors (already French) onto the form fields.
 * Returns only the keys the form knows about.
 */
export function serverFieldErrors<K extends string>(
  e: unknown,
  fields: readonly K[],
): FormErrors<K> {
  if (!(e instanceof ApiError)) return {};
  const out: FormErrors<K> = {};
  for (const [key, msg] of Object.entries(e.fieldErrors)) {
    if ((fields as readonly string[]).includes(key)) out[key as K] = msg;
  }
  return out;
}

/** "36,8008" or " 36.8008 " → 36.8008 · "" / garbage → null. */
export function parseDecimal(raw: string): number | null {
  const v = raw.trim().replace(",", ".");
  if (!/^[-+]?\d+(\.\d+)?$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** "12" → 12 · "12.5" / "" / garbage → null. */
export function parseInteger(raw: string): number | null {
  const v = raw.trim();
  if (!/^[-+]?\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}

/** Rounds to `digits` decimals (NUMERIC(10,7) columns for coordinates). */
export function roundTo(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * Restored local draft (sessionStorage) over the form defaults: only known keys whose type
 * matches the default are kept, so an older or tampered draft never breaks the form.
 */
export function mergeDraft<T extends object>(base: T, raw: unknown): T {
  if (!raw || typeof raw !== "object") return base;
  const out = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key in out && typeof out[key] === typeof value) out[key] = value;
  }
  return out as T;
}

/** Shallow equality of two flat form value objects. */
export function sameValues<T extends object>(a: T, b: T): boolean {
  const ka = Object.keys(a) as (keyof T)[];
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

/** Focuses the first invalid control of a form (after React commits the error state). */
export function focusFirstInvalid(form: HTMLFormElement | null): void {
  if (!form) return;
  window.requestAnimationFrame(() => {
    const el = form.querySelector<HTMLElement>("[aria-invalid='true']");
    el?.focus();
  });
}
