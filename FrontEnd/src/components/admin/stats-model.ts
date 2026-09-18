/**
 * Back-office statistics model (pure): period presets, chart scaling, AI dashboard figures.
 * Every number shown comes from the backend (contract §2.9 / §2.2); nothing is invented here.
 */
import type {
  AiDashboardResponse,
  StatisticsGroupBy,
  StatisticsHistoryRow,
  StatisticsViewsRow,
} from "@/lib/api/types";
import { AI_SECTOR_LABEL } from "@/lib/campaign-status";

// ---------------------------------------------------------------------------
// Period
// ---------------------------------------------------------------------------
export const PERIOD_PRESETS = [
  { value: "7", label: "7 jours", days: 7 },
  { value: "30", label: "30 jours", days: 30 },
  { value: "90", label: "90 jours", days: 90 },
  { value: "custom", label: "Personnalisée", days: null },
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number]["value"];
export const PERIOD_PRESET_VALUES: readonly PeriodPreset[] = PERIOD_PRESETS.map((p) => p.value);

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string | null | undefined): value is string {
  if (!value) return false;
  const m = ISO.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** "2026-09-17" + (-6) → "2026-09-11" (calendar arithmetic, no timezone shift). */
export function addDaysISO(iso: string, days: number): string {
  const m = ISO.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface PeriodRange {
  from: string;
  to: string;
}

/**
 * Range of a preset ending today (inclusive: « 7 jours » = today − 6 → today). A custom range is
 * kept when valid and ordered, otherwise the 30-day default applies.
 */
export function periodRange(
  preset: PeriodPreset,
  today: string,
  custom: { from?: string | null; to?: string | null } = {},
): PeriodRange {
  if (preset === "custom") {
    if (isIsoDate(custom.from) && isIsoDate(custom.to) && custom.from <= custom.to) {
      return { from: custom.from, to: custom.to };
    }
    return { from: addDaysISO(today, -29), to: today };
  }
  const days = PERIOD_PRESETS.find((p) => p.value === preset)?.days ?? 30;
  return { from: addDaysISO(today, -(days - 1)), to: today };
}

// ---------------------------------------------------------------------------
// Views grouping
// ---------------------------------------------------------------------------
export const GROUP_BY_TABS: readonly { value: StatisticsGroupBy; label: string; column: string }[] =
  [
    { value: "day", label: "Par jour", column: "Jour" },
    { value: "campaign", label: "Par campagne", column: "Campagne" },
    { value: "support", label: "Par Porteur", column: "Porteur" },
    { value: "zone", label: "Par zone", column: "Zone" },
  ];

export function groupByColumn(groupBy: StatisticsGroupBy): string {
  return GROUP_BY_TABS.find((t) => t.value === groupBy)?.column ?? "Clé";
}

/** Rounds a maximum up to a clean axis value: 0 → 1, 87 → 100, 1 234 → 2 000. */
export function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const f = value / exponent;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exponent;
}

/** Share of `value` on 0..max, in percent, clamped to [0, 100]. */
export function percentOfMax(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) return 0;
  return Math.min(100, (value / max) * 100);
}

export interface ChartPoint {
  key: string;
  label: string;
  value: number;
}

export function viewsPoints(
  rows: readonly StatisticsViewsRow[],
  metric: "views" | "clicks" | "interactions" | "cost" = "views",
): ChartPoint[] {
  return rows.map((r) => ({ key: r.key, label: r.label, value: finite(r[metric]) }));
}

/** Top `limit` rows by views (the backend already sorts non-day groupings). */
export function topRows(rows: readonly StatisticsViewsRow[], limit = 5): StatisticsViewsRow[] {
  return [...rows].sort((a, b) => finite(b.views) - finite(a.views)).slice(0, limit);
}

/** Click-through rate « 2,4 % » (clicks / views), « — » without views. */
export function formatRate(numerator: number, denominator: number): string {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return "—";
  return `${new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 1 }).format((numerator / denominator) * 100)} %`;
}

/** 0..1 ratio → « 75 % ». */
export function formatRatio(ratio: number | null | undefined): string {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return "—";
  return `${new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 0 }).format(ratio * 100)} %`;
}

/** Score average « 42,5 » (one decimal max). */
export function formatScore(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 1 }).format(value);
}

function finite(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// History (platform snapshots)
// ---------------------------------------------------------------------------
export type HistorySeriesKey = "totalCampaigns" | "activeCampaigns" | "pendingCampaigns";

export const HISTORY_SERIES: readonly { key: HistorySeriesKey; label: string; tone: string }[] = [
  { key: "totalCampaigns", label: "Campagnes", tone: "text-brand-blue-text" },
  { key: "activeCampaigns", label: "Actives", tone: "text-success" },
  { key: "pendingCampaigns", label: "En attente", tone: "text-warning" },
];

/** Polyline points "x,y x,y" of one series on a width×height box (y grows downwards). */
export function linePoints(
  values: readonly number[],
  max: number,
  width: number,
  height: number,
): string {
  if (values.length === 0) return "";
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = values.length > 1 ? i * step : width / 2;
      const y = height - (percentOfMax(v, max) / 100) * height;
      return `${round1(x)},${round1(y)}`;
    })
    .join(" ");
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function historyMax(rows: readonly StatisticsHistoryRow[]): number {
  let max = 0;
  for (const r of rows) for (const s of HISTORY_SERIES) max = Math.max(max, finite(r[s.key]));
  return niceCeil(max);
}

// ---------------------------------------------------------------------------
// AI dashboard
// ---------------------------------------------------------------------------
export interface AiSummaryFigure {
  key: string;
  label: string;
  value: string;
  hint: string;
}

export function aiSummaryFigures(d: AiDashboardResponse): AiSummaryFigure[] {
  const decided = finite(d.adminValidatedCount) + finite(d.adminRejectedCount);
  return [
    {
      key: "risk",
      label: "Risque moyen",
      value: `${formatScore(d.avgRiskScore)} / 100`,
      hint: `Sur ${finite(d.totalChecks)} analyse${finite(d.totalChecks) > 1 ? "s" : ""} (hors pré-analyses)`,
    },
    {
      key: "quality",
      label: "Qualité moyenne",
      value: `${formatScore(d.avgQualityScore)} / 100`,
      hint: "Plus elle est haute, mieux c'est",
    },
    {
      key: "validation",
      label: "Taux de validation",
      value: formatRatio(decided > 0 ? d.validationRate : null),
      hint: `${finite(d.adminValidatedCount)} validée${finite(d.adminValidatedCount) > 1 ? "s" : ""} sur ${decided} décision${decided > 1 ? "s" : ""}`,
    },
    {
      key: "rejection",
      label: "Taux de refus",
      value: formatRatio(decided > 0 ? d.rejectionRate : null),
      hint: `${finite(d.adminRejectedCount)} refusée${finite(d.adminRejectedCount) > 1 ? "s" : ""}`,
    },
  ];
}

/** « 3 favorables · 2 revues · 1 à corriger ». */
export function aiVerdictBreakdown(d: AiDashboardResponse): string {
  const a = finite(d.approvedCount);
  const r = finite(d.reviewRequiredCount);
  const x = finite(d.rejectedCount);
  return `${a} favorable${a > 1 ? "s" : ""} · ${r} revue${r > 1 ? "s" : ""} manuelle${r > 1 ? "s" : ""} · ${x} à corriger`;
}

export function sectorRows(d: AiDashboardResponse): ChartPoint[] {
  return (d.bySector ?? []).map((s) => ({
    key: s.sector,
    label: AI_SECTOR_LABEL[s.sector] ?? s.sector,
    value: finite(s.count),
  }));
}

export function topIssueRows(d: AiDashboardResponse): ChartPoint[] {
  return (d.topIssues ?? []).map((t) => ({ key: t.label, label: t.label, value: finite(t.count) }));
}
