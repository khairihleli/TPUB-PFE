/**
 * Time-slot presets (CdC §3.7 « matin, après-midi, soir, journée complète ou personnalisé »).
 * Windows are identical to the backend presets of docs/completion-contract.md §2.4 (used for
 * `AvailabilityResponse.alternatives`), so `presetOf` recognises every alternative it returns.
 * Times are "HH:mm:ss" (the API format); "HH:mm" inputs are accepted everywhere.
 */
import type { SlotPreset } from "@/lib/api/types";

export type { SlotPreset } from "@/lib/api/types";

/** Custom times chosen by the user. */
export const PERSONNALISE = "PERSONNALISE" as const;
export type SlotChoice = SlotPreset | typeof PERSONNALISE;

export interface SlotPresetDef {
  id: SlotPreset;
  /** « Matin (7 h – 12 h) » */
  label: string;
  /** « Matin » */
  shortLabel: string;
  /** "HH:mm:ss" */
  startTime: string;
  /** "HH:mm:ss" (exclusive end, like the backend overlap rule) */
  endTime: string;
}

export const SLOT_PRESETS: readonly SlotPresetDef[] = [
  {
    id: "MATIN",
    label: "Matin (7 h – 12 h)",
    shortLabel: "Matin",
    startTime: "07:00:00",
    endTime: "12:00:00",
  },
  {
    id: "APRES_MIDI",
    label: "Après-midi (12 h – 18 h)",
    shortLabel: "Après-midi",
    startTime: "12:00:00",
    endTime: "18:00:00",
  },
  {
    id: "SOIR",
    label: "Soir (18 h – 23 h)",
    shortLabel: "Soir",
    startTime: "18:00:00",
    endTime: "23:00:00",
  },
  {
    id: "JOURNEE",
    label: "Journée complète (7 h – 23 h)",
    shortLabel: "Journée complète",
    startTime: "07:00:00",
    endTime: "23:00:00",
  },
];

export const PERSONNALISE_LABEL = "Personnalisé";

/** Every choice of the radio group, presets first. */
export const SLOT_CHOICES: readonly { id: SlotChoice; label: string }[] = [
  ...SLOT_PRESETS.map((p) => ({ id: p.id, label: p.label })),
  { id: PERSONNALISE, label: PERSONNALISE_LABEL },
];

export function isSlotPreset(value: unknown): value is SlotPreset {
  return SLOT_PRESETS.some((p) => p.id === value);
}

export function getSlotPreset(id: SlotPreset): SlotPresetDef {
  return SLOT_PRESETS.find((p) => p.id === id) as SlotPresetDef;
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

/** "8:00" is rejected; "08:00" / "08:00:00" → "08:00:00". Invalid or empty → null. */
export function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = TIME.exec(value.trim());
  if (!m) return null;
  return `${m[1]}:${m[2]}:${m[3] ?? "00"}`;
}

/** Minutes since midnight, or null when invalid. */
export function timeToMinutes(value: string | null | undefined): number | null {
  const t = normalizeTime(value);
  if (!t) return null;
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

/** Preset whose window equals exactly [start, end), else « PERSONNALISE » (also for null/invalid). */
export function presetOf(
  start: string | null | undefined,
  end: string | null | undefined,
): SlotChoice {
  const s = normalizeTime(start);
  const e = normalizeTime(end);
  if (!s || !e) return PERSONNALISE;
  return SLOT_PRESETS.find((p) => p.startTime === s && p.endTime === e)?.id ?? PERSONNALISE;
}

/** API times of a preset. */
export function slotWindow(preset: SlotPreset): { startTime: string; endTime: string } {
  const p = getSlotPreset(preset);
  return { startTime: p.startTime, endTime: p.endTime };
}

/** "07:00:00" → « 7 h », "12:30" → « 12 h 30 ». Invalid → "". */
export function formatHour(value: string | null | undefined): string {
  const minutes = timeToMinutes(value);
  if (minutes === null) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** Hours between two times (end exclusive); 0 when invalid or reversed. */
export function slotHours(
  start: string | null | undefined,
  end: string | null | undefined,
): number {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === null || e === null || e <= s) return 0;
  return (e - s) / 60;
}

/** Valid window: both times set and start < end (backend INVALID_TIME_RANGE otherwise). */
export function isValidSlot(
  start: string | null | undefined,
  end: string | null | undefined,
): boolean {
  return slotHours(start, end) > 0;
}

/** Null when valid, else the French error shown under the time fields. */
export function validateSlot(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  if (!normalizeTime(start) || !normalizeTime(end)) {
    return "Indiquez une heure de début et une heure de fin (HH:MM).";
  }
  if (!isValidSlot(start, end)) return "L'heure de fin doit être après l'heure de début.";
  return null;
}

/** Backend overlap rule for times: `st < other.et ∧ other.st < et` (touching windows don't overlap). */
export function slotsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = timeToMinutes(aStart);
  const ae = timeToMinutes(aEnd);
  const bs = timeToMinutes(bStart);
  const be = timeToMinutes(bEnd);
  if (as === null || ae === null || bs === null || be === null) return false;
  return as < be && bs < ae;
}

/**
 * « Matin (7 h – 12 h) » for a preset window, « 9 h 30 – 14 h » for custom times,
 * « Horaires non définis » when a time is missing or invalid.
 */
export function formatSlot(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const choice = presetOf(start, end);
  if (choice !== PERSONNALISE) return getSlotPreset(choice).label;
  const s = formatHour(start);
  const e = formatHour(end);
  if (!s || !e) return "Horaires non définis";
  return `${s} – ${e}`;
}

/** Label of a radio choice. */
export function slotChoiceLabel(choice: SlotChoice): string {
  return choice === PERSONNALISE ? PERSONNALISE_LABEL : getSlotPreset(choice).label;
}
