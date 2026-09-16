import type { CampaignResponse } from "@/lib/api/types";
import {
  CAMPAIGN_FILTERS,
  type CampaignFilterValue,
  matchesCampaignFilter,
  parseCampaignFilter,
} from "@/lib/campaign-status";
import { todayISO } from "@/lib/format";
import { parseSortParam, serializeSort, type SortState } from "@/lib/url-state";

type ListCampaign = Pick<CampaignResponse, "status" | "startDate" | "endDate">;

/** Lowercase, accents stripped, spaces collapsed: « Été » matches « ete ». */
export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function matchesSearch(campaign: Pick<CampaignResponse, "name">, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  return normalizeSearch(campaign.name).includes(q);
}

/** Legacy ?statut= values (brouillons, validation…) map to the new tabs (UX-PLAN §4.8). */
export function parseFilter(raw: string | null | undefined): CampaignFilterValue {
  return parseCampaignFilter(raw);
}

/**
 * Tab counters. The campaign (not only its status) is used so derived states land in the right
 * tab: a future ACTIVE campaign is « Programmée » (Validées), a past one « Terminée ».
 */
export function countByFilter(
  campaigns: readonly ListCampaign[],
  today: string = todayISO(),
): Record<CampaignFilterValue, number> {
  const out = Object.fromEntries(CAMPAIGN_FILTERS.map((f) => [f.value, 0])) as Record<
    CampaignFilterValue,
    number
  >;
  for (const c of campaigns) {
    for (const f of CAMPAIGN_FILTERS) {
      if (matchesCampaignFilter(c, f.value, today)) out[f.value] += 1;
    }
  }
  return out;
}

export function filterCampaigns<T extends ListCampaign & Pick<CampaignResponse, "name">>(
  campaigns: readonly T[],
  /** New tab values; legacy values (brouillons, refusees…) are mapped. */
  filter: string,
  query: string,
  today: string = todayISO(),
): T[] {
  return campaigns.filter(
    (c) => matchesCampaignFilter(c, filter, today) && matchesSearch(c, query),
  );
}

// ---------------------------------------------------------------------------
// Sort (?tri=)
// ---------------------------------------------------------------------------

export const CAMPAIGN_SORT_KEYS = ["maj", "debut", "nom"] as const;
export type CampaignSortKey = (typeof CAMPAIGN_SORT_KEYS)[number];

/** Most recent activity first. */
export const DEFAULT_CAMPAIGN_SORT: SortState = { key: "maj", dir: "desc" };

/** Options of the sort select (value = the `?tri=` spelling). */
export const CAMPAIGN_SORT_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "-maj", label: "Mise à jour (récente d'abord)" },
  { value: "debut", label: "Début (le plus proche d'abord)" },
  { value: "-debut", label: "Début (le plus lointain d'abord)" },
  { value: "nom", label: "Nom (A → Z)" },
];

/** `?tri=` → sort (unknown → default « Mise à jour »). */
export function parseCampaignSort(raw: string | null | undefined): SortState {
  return parseSortParam(raw, CAMPAIGN_SORT_KEYS) ?? DEFAULT_CAMPAIGN_SORT;
}

/** Sort → `?tri=` value; the default is omitted from the URL. */
export function serializeCampaignSort(sort: SortState): string {
  return sort.key === DEFAULT_CAMPAIGN_SORT.key && sort.dir === DEFAULT_CAMPAIGN_SORT.dir
    ? ""
    : (serializeSort(sort) ?? "");
}

/**
 * Latest real timestamp known for the campaign (validation, submission, creation). The API
 * exposes no `updatedAt`: nothing else is inferred.
 */
export function lastActivityAt(
  campaign: Pick<CampaignResponse, "createdAt" | "submittedAt" | "validatedAt">,
): string {
  return [campaign.validatedAt, campaign.submittedAt, campaign.createdAt]
    .filter((v): v is string => Boolean(v))
    .reduce((latest, v) => (Date.parse(v) > Date.parse(latest) ? v : latest));
}

type SortableCampaign = Pick<
  CampaignResponse,
  "id" | "name" | "startDate" | "createdAt" | "submittedAt" | "validatedAt"
>;

/** Stable sort; campaigns without a start date always come last. */
export function sortCampaigns<T extends SortableCampaign>(
  campaigns: readonly T[],
  sort: SortState,
): T[] {
  const factor = sort.dir === "desc" ? -1 : 1;
  const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });
  return campaigns
    .map((c, index) => ({ c, index }))
    .sort((a, b) => {
      let diff = 0;
      if (sort.key === "debut") {
        const sa = a.c.startDate;
        const sb = b.c.startDate;
        if (!sa || !sb) diff = !sa && !sb ? 0 : !sa ? 1 : -1;
        else diff = factor * (sa < sb ? -1 : sa > sb ? 1 : 0);
        if (!sa || !sb) return diff || a.index - b.index;
      } else if (sort.key === "nom") {
        diff = factor * collator.compare(a.c.name, b.c.name);
      } else {
        diff = factor * (Date.parse(lastActivityAt(a.c)) - Date.parse(lastActivityAt(b.c)));
      }
      return diff || a.index - b.index;
    })
    .map(({ c }) => c);
}
