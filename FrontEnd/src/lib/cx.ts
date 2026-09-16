export type ClassValue = string | false | null | undefined | 0;

/**
 * Joins class names, skipping falsy values. No tailwind-merge on purpose:
 * primitives own their colours; `className` from callers is for layout/spacing.
 */
export function cx(...values: ClassValue[]): string {
  let out = "";
  for (const v of values) {
    if (v) out = out ? `${out} ${v}` : v;
  }
  return out;
}
