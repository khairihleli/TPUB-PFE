/**
 * Statistics page model (contract §2.9 GET /statistics/mine): period presets, URL parsing and
 * table rows. Pure functions.
 */
import type { StatisticsMineResponse, StatisticsRange } from "@/lib/api/types";
import { todayISO } from "@/lib/format";

export const EMPTY_TOTALS: StatisticsMineResponse["totals"] = {
  campaigns: 0,
  activeCampaigns: 0,
  pendingCampaigns: 0,
  views: 0,
  clicks: 0,
  interactions: 0,
  estimatedViews: 0,
  estimatedCost: 0,
  estimatedBudget: 0,
  consumedBudget: 0,
  confirmedReservations: 0,
};

export type PeriodPreset = "7" | "30" | "90" | "perso";

export const PERIOD_PRESETS: readonly { value: PeriodPreset; label: string }[] = [
  { value: "7", label: "7 jours" },
  { value: "30", label: "30 jours" },
  { value: "90", label: "90 jours" },
  { value: "perso", label: "Personnalisée" },
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** Backend limit (400 INVALID_RANGE beyond). */
export const MAX_RANGE_DAYS = 366;

function shift(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

function spanDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}

export type RangeResult =
  { ok: true; range: Required<StatisticsRange> } | { ok: false; message: string };

/** Last N days ending today (inclusive), or the validated custom range. */
export function periodRange(
  preset: PeriodPreset,
  custom: { from: string; to: string },
  today: string = todayISO(),
): RangeResult {
  if (preset !== "perso") {
    const days = Number(preset);
    return { ok: true, range: { from: shift(today, -(days - 1)), to: today } };
  }
  if (!ISO.test(custom.from) || !ISO.test(custom.to)) {
    return { ok: false, message: "Choisissez une date de début et une date de fin." };
  }
  if (custom.to < custom.from) {
    return { ok: false, message: "La date de fin doit suivre la date de début." };
  }
  if (spanDays(custom.from, custom.to) > MAX_RANGE_DAYS) {
    return { ok: false, message: `La période ne peut pas dépasser ${MAX_RANGE_DAYS} jours.` };
  }
  return { ok: true, range: { from: custom.from, to: custom.to } };
}

export function parsePeriodPreset(raw: string | null | undefined): PeriodPreset {
  return PERIOD_PRESETS.some((p) => p.value === raw) ? (raw as PeriodPreset) : "30";
}

/** Views per campaign sorted by views desc then name (table + bars). */
export function campaignRows(stats: Pick<StatisticsMineResponse, "byCampaign">) {
  return [...stats.byCampaign].sort(
    (a, b) => b.views - a.views || a.name.localeCompare(b.name, "fr"),
  );
}

/** « 1,25 % » of clicks per view, « — » without views. */
export function formatRate(views: number, clicks: number): string {
  if (!(views > 0)) return "—";
  return `${new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 2 }).format((clicks / views) * 100)} %`;
}
