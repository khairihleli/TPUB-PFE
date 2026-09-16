/** Pure filters for the authenticated network catalogue (/espace/reseau). */
import type { SupportResponse, SupportType, TechnicalStatus, ZoneResponse } from "@/lib/api/types";

export interface SupportFilters {
  /** "" = all zones */
  zoneId: string;
  /** "" = all types */
  type: "" | SupportType;
  /** "" = all statuses */
  status: "" | TechnicalStatus;
}

export const DEFAULT_SUPPORT_FILTERS: SupportFilters = { zoneId: "", type: "", status: "" };

export function filterSupports(
  supports: readonly SupportResponse[],
  f: SupportFilters,
): SupportResponse[] {
  return supports.filter(
    (s) =>
      (f.zoneId === "" || String(s.zoneId) === f.zoneId) &&
      (f.type === "" || s.supportType === f.type) &&
      (f.status === "" || s.technicalStatus === f.status),
  );
}

export interface ZoneSummary {
  zone: ZoneResponse;
  supportCount: number;
  activeCount: number;
}

export function summarizeZones(
  zones: readonly ZoneResponse[],
  supports: readonly SupportResponse[],
): ZoneSummary[] {
  const counts = new Map<number, { total: number; active: number }>();
  for (const s of supports) {
    const c = counts.get(s.zoneId) ?? { total: 0, active: 0 };
    c.total += 1;
    if (s.technicalStatus === "ACTIF") c.active += 1;
    counts.set(s.zoneId, c);
  }
  return zones.map((zone) => ({
    zone,
    supportCount: counts.get(zone.id)?.total ?? 0,
    activeCount: counts.get(zone.id)?.active ?? 0,
  }));
}

/** Distinct values present in the data, in a stable display order. */
export function presentValues<T extends string>(values: readonly T[], order: readonly T[]): T[] {
  const set = new Set(values);
  return order.filter((v) => set.has(v));
}

/** « 36,8008° N · 10,1800° E » */
export function formatCoordinates(lat: number, lng: number): string {
  const f = new Intl.NumberFormat("fr-TN", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "O";
  return `${f.format(Math.abs(lat))}° ${ns} · ${f.format(Math.abs(lng))}° ${ew}`;
}
