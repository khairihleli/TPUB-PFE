/**
 * Porteur filters + network search (zones and Porteurs by name/address). Pure, unit-tested.
 */
import type { SupportResponse, TechnicalStatus, ZoneResponse } from "@/lib/api/types";
import { isValidLngLat, type LngLat } from "@/lib/network/geo";
import {
  isBookable,
  PORTEUR_TYPES,
  resolvePorteurType,
  technicalStatusLabel,
  type PorteurType,
} from "@/lib/network/porteur";

export interface SupportFilters {
  /** Empty = every type. */
  types: PorteurType[];
  /** Empty = every status. */
  statuses: TechnicalStatus[];
  bookableOnly: boolean;
}

export const DEFAULT_FILTERS: SupportFilters = Object.freeze({
  types: [],
  statuses: [],
  bookableOnly: false,
});

export const TECHNICAL_STATUS_CODES: readonly TechnicalStatus[] = [
  "ACTIF",
  "MAINTENANCE",
  "INACTIF",
  "HORS_LIGNE",
];

export function matchesFilters(support: SupportResponse, filters: SupportFilters): boolean {
  if (filters.types.length > 0 && !filters.types.includes(resolvePorteurType(support).type)) {
    return false;
  }
  if (filters.statuses.length > 0 && !filters.statuses.includes(support.technicalStatus)) {
    return false;
  }
  if (filters.bookableOnly && !isBookable(support)) return false;
  return true;
}

export function filterSupports<S extends SupportResponse>(
  supports: readonly S[],
  filters: SupportFilters,
): S[] {
  return supports.filter((s) => matchesFilters(s, filters));
}

export function countActiveFilters(filters: SupportFilters): number {
  return filters.types.length + filters.statuses.length + (filters.bookableOnly ? 1 : 0);
}

function toggleIn<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function toggleTypeFilter(filters: SupportFilters, type: PorteurType): SupportFilters {
  return { ...filters, types: toggleIn(filters.types, type) };
}

export function toggleStatusFilter(
  filters: SupportFilters,
  status: TechnicalStatus,
): SupportFilters {
  return { ...filters, statuses: toggleIn(filters.statuses, status) };
}

/**
 * « 12 Porteurs affichés » / « 1 Porteur affiché » / « Aucun Porteur affiché »; with a total:
 * « 8 Porteurs affichés sur 8 » so the user can check that nothing is left out.
 */
export function displayedCountLabel(n: number, total?: number): string {
  const base =
    n <= 0 ? "Aucun Porteur affiché" : n === 1 ? "1 Porteur affiché" : `${n} Porteurs affichés`;
  return total === undefined ? base : `${base} sur ${Math.max(0, total)}`;
}

/** « 1 masqué par les filtres » / « 3 masqués par les filtres » ; "" when nothing is hidden. */
export function hiddenByFiltersLabel(hidden: number): string {
  if (hidden <= 0) return "";
  return hidden === 1 ? "1 masqué par les filtres" : `${hidden} masqués par les filtres`;
}

/** Lowercase, accents stripped, punctuation collapsed. */
export function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type SearchResult =
  | {
      kind: "zone";
      id: number;
      label: string;
      detail: string;
      lngLat: LngLat;
      radiusKm: number | null;
      score: number;
    }
  | {
      kind: "support";
      id: number;
      label: string;
      detail: string;
      lngLat: LngLat;
      type: PorteurType;
      score: number;
    };

/** 3 = full match, 2 = prefix, 1.5 = word prefix, 1 = substring, 0 = none. */
function scoreText(haystack: string, needle: string): number {
  if (!needle || !haystack) return 0;
  if (haystack === needle) return 3;
  if (haystack.startsWith(needle)) return 2;
  if (haystack.split(" ").some((w) => w.startsWith(needle))) return 1.5;
  if (haystack.includes(needle)) return 1;
  // every query word must appear somewhere
  const words = needle.split(" ").filter(Boolean);
  if (words.length > 1 && words.every((w) => haystack.includes(w))) return 0.8;
  return 0;
}

/**
 * Search zones (name) and Porteurs (name, address, zone name). Name matches rank above
 * address matches; zones win ties. Empty query → [].
 */
export function searchNetwork(
  query: string,
  zones: readonly ZoneResponse[],
  supports: readonly SupportResponse[],
  limit = 8,
): SearchResult[] {
  const q = normalizeText(query);
  if (q.length === 0) return [];
  const results: SearchResult[] = [];
  const counts = new Map<number, number>();
  for (const s of supports) counts.set(s.zoneId, (counts.get(s.zoneId) ?? 0) + 1);

  for (const z of zones) {
    const lngLat = { lng: z.longitude, lat: z.latitude };
    if (!isValidLngLat(lngLat)) continue;
    const score = scoreText(normalizeText(z.name), q);
    if (score <= 0) continue;
    const n = counts.get(z.id) ?? 0;
    results.push({
      kind: "zone",
      id: z.id,
      label: z.name,
      detail: `Zone · ${n === 0 ? "aucun Porteur" : n === 1 ? "1 Porteur" : `${n} Porteurs`}${z.isActive ? "" : " · inactive"}`,
      lngLat,
      radiusKm: z.radiusKm,
      score: score + 0.05,
    });
  }
  for (const s of supports) {
    const lngLat = { lng: s.longitude, lat: s.latitude };
    if (!isValidLngLat(lngLat)) continue;
    const nameScore = scoreText(normalizeText(s.name), q);
    const addressScore = scoreText(normalizeText(s.address), q) * 0.6;
    const zoneScore = scoreText(normalizeText(s.zoneName), q) * 0.4;
    const score = Math.max(nameScore, addressScore, zoneScore);
    if (score <= 0) continue;
    const { type } = resolvePorteurType(s);
    const detailParts = [`Type ${type} · ${PORTEUR_TYPES[type].name}`, s.address || s.zoneName];
    detailParts.push(technicalStatusLabel(s.technicalStatus));
    results.push({
      kind: "support",
      id: s.id,
      label: s.name,
      detail: detailParts.filter(Boolean).join(" · "),
      lngLat,
      type,
      score,
    });
  }
  return results
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr"))
    .slice(0, Math.max(0, limit));
}
