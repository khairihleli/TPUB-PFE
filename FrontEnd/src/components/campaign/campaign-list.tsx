"use client";

import { ArrowRight, CalendarDays, Clock3, Megaphone, RotateCcw, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { activeReservations } from "@/components/campaign/campaign-data";
import {
  CAMPAIGN_SORT_OPTIONS,
  countByFilter,
  filterCampaigns,
  parseCampaignSort,
  parseFilter,
  serializeCampaignSort,
  sortCampaigns,
} from "@/components/campaign/campaign-list-model";
import { TONE_ACCENT } from "@/components/campaign/campaign-ui";
import { useDemoteTopbarCta } from "@/components/shell/topbar-cta";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { campaignsApi, reservationsApi } from "@/lib/api/endpoints";
import type { CampaignResponse } from "@/lib/api/types";
import {
  CAMPAIGN_FILTERS,
  type CampaignFilterValue,
  getCampaignStatusMeta,
  getCampaignTimeCue,
  LEGACY_CAMPAIGN_FILTERS,
} from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { formatCount, formatDateRange, formatTimeRange, formatTND, todayISO } from "@/lib/format";
import { fetchCached, resourceKeys } from "@/lib/resource-cache";
import { routes } from "@/lib/routes";
import { param, useUrlState } from "@/lib/url-state";
import { useResource } from "@/lib/use-resource";

const FILTER_VALUES = CAMPAIGN_FILTERS.map((f) => f.value);

const URL_SCHEMA = {
  statut: param.enum<CampaignFilterValue>(FILTER_VALUES, "toutes", LEGACY_CAMPAIGN_FILTERS),
  q: param.string(),
  tri: param.string(),
};

/**
 * Active créneaux per draft, read through the shared cache (same key as the nav badge, so no
 * extra request when the badge already loaded them). Failures leave the draft unknown.
 */
function useDraftCreneaux(draftIds: readonly number[]): ReadonlyMap<number, number> {
  const key = draftIds.join(",");
  const [counts, setCounts] = useState<ReadonlyMap<number, number>>(() => new Map());

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const ids = key.split(",").map(Number);
    const out = new Map<number, number>();
    let next = 0;
    const worker = async () => {
      while (next < ids.length) {
        const id = ids[next++] as number;
        try {
          const list = await fetchCached(
            resourceKeys.reservationsByCampaign(id),
            (s) => reservationsApi.byCampaign(id, { signal: s }),
            { signal: controller.signal },
          );
          out.set(id, activeReservations(list).length);
        } catch {
          /* unknown for this draft: generic « Finaliser » */
        }
      }
    };
    void Promise.all([worker(), worker(), worker(), worker()]).then(() => {
      if (!controller.signal.aborted) setCounts(new Map(out));
    });
    return () => controller.abort();
  }, [key]);

  return counts;
}

function CampaignRow({
  campaign,
  today,
  creneaux,
}: {
  campaign: CampaignResponse;
  today: string;
  /** Active créneaux of a draft (undefined when unknown or not a draft). */
  creneaux: number | undefined;
}) {
  const meta = getCampaignStatusMeta(campaign, { audience: "annonceur", today });
  const cue = getCampaignTimeCue(campaign, today);
  const isDraft = campaign.status === "BROUILLON";
  const finaliseHref = routes.espace.wizard(
    campaign.id,
    creneaux !== undefined && creneaux > 0 ? "verification" : "porteurs",
  );

  return (
    <li>
      <article
        className={cx(
          "group relative isolate grid gap-x-8 gap-y-4 overflow-hidden rounded-card border border-line bg-grad-card py-5 pr-5 pl-6",
          "transition-[border-color,box-shadow] duration-300 ease-expo hover:border-line-strong hover:shadow-lift focus-within:border-line-strong",
          // Fixed side columns so dates and statuses line up from one card to the next.
          "xl:grid-cols-[minmax(0,1fr)_16rem_19rem] xl:items-center",
        )}
      >
        <span
          aria-hidden="true"
          // Kept clear of the card's corner radius so the clipped bar stays straight.
          className={cx("absolute inset-y-6 left-0 w-[3px] rounded-r-full", TONE_ACCENT[meta.tone])}
        />

        <div className="min-w-0">
          <h2 className="font-display text-[1.0625rem] leading-snug font-semibold text-balance text-ink-strong">
            <Link
              href={routes.espace.campaign(campaign.id)}
              className="rounded-sm break-words after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text"
            >
              {campaign.name}
            </Link>
          </h2>
          <p className="mt-1 line-clamp-1 text-[0.875rem] text-muted">
            {campaign.objective?.trim() || "Objectif non renseigné"}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[0.8125rem] sm:grid-cols-[auto_auto_auto] sm:justify-start xl:grid-cols-1">
          {/* Full row on phones: the end date must never be truncated. */}
          <div className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">
            <dt className="text-muted-2">
              <CalendarDays aria-hidden="true" className="size-4" />
              <span className="sr-only">Période</span>
            </dt>
            <dd className="whitespace-nowrap text-ink-soft tabular">
              {formatDateRange(campaign.startDate, campaign.endDate, "medium")}
            </dd>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <dt className="text-muted-2">
              <Clock3 aria-hidden="true" className="size-4" />
              <span className="sr-only">Plage horaire</span>
            </dt>
            <dd className="whitespace-nowrap text-ink-soft tabular">
              {formatTimeRange(campaign.startTime, campaign.endTime)}
            </dd>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <dt className="text-muted-2">
              <Wallet aria-hidden="true" className="size-4" />
              <span className="sr-only">Budget déclaré</span>
            </dt>
            <dd className="whitespace-nowrap text-ink-soft tabular">
              {formatTND(campaign.budget)}
            </dd>
          </div>
        </dl>

        {/* Same structure for every status: pill + hint, then the time cue / next action. */}
        <div className="flex flex-col items-start gap-1.5 border-t border-line pt-4 xl:items-end xl:border-t-0 xl:pt-0 xl:text-right">
          <StatusPill
            type="campaign"
            campaign={campaign}
            audience="annonceur"
            today={today}
            showHint
            className="xl:justify-end"
          />
          {cue ? (
            <p
              className={cx(
                "text-[0.8125rem] leading-snug",
                cue.tone === "warning"
                  ? "text-warning"
                  : cue.tone === "danger"
                    ? "text-danger"
                    : "text-muted",
              )}
            >
              {cue.label}
            </p>
          ) : null}
          {isDraft ? (
            <>
              {creneaux !== undefined ? (
                <p className="text-[0.8125rem] leading-snug text-muted">
                  {creneaux > 0
                    ? formatCount(creneaux, "créneau bloqué", "créneaux bloqués")
                    : "Aucun Porteur réservé"}
                </p>
              ) : null}
              <Link
                href={finaliseHref}
                className="relative z-[1] -mx-1 inline-flex min-h-touch items-center gap-1.5 rounded-control px-1 font-label text-[0.8125rem] font-semibold text-brand-blue-text transition-colors hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text xl:min-h-9"
              >
                Finaliser
                <ArrowRight aria-hidden="true" className="size-4" />
                <span className="sr-only"> : {campaign.name}</span>
              </Link>
            </>
          ) : null}
        </div>
      </article>
    </li>
  );
}

function ListSkeleton({ slow, onRetry }: { slow?: boolean; onRetry?: () => void }) {
  return (
    <LoadingRegion
      label="Chargement des campagnes…"
      slow={slow}
      onRetry={onRetry}
      className="flex flex-col gap-3"
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-card border border-line bg-surface p-5">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-6 w-28 rounded-full" />
          </div>
          <Skeleton className="mt-3 h-3.5 w-3/5" />
          <Skeleton className="mt-4 h-3.5 w-1/3" />
        </div>
      ))}
    </LoadingRegion>
  );
}

export function CampaignListSkeleton({ slow, onRetry }: { slow?: boolean; onRetry?: () => void }) {
  return (
    <div>
      <div className="mb-6 flex flex-col gap-4">
        <Skeleton className="h-12 w-full max-w-xl rounded-full" />
        <Skeleton className="h-11 w-full max-w-sm" />
      </div>
      <ListSkeleton slow={slow} onRetry={onRetry} />
    </div>
  );
}

const EMPTY_TAB_COPY: Record<CampaignFilterValue, string> = {
  toutes: "Aucune campagne pour l'instant.",
  "a-finaliser": "Aucune campagne à finaliser.",
  "en-examen": "Aucune campagne en examen.",
  validees: "Aucune campagne programmée ou en diffusion.",
  terminees: "Aucune campagne terminée ou refusée.",
};

/**
 * /espace/campagnes — status tabs (?statut=, legacy values mapped), search (?q=) and sort (?tri=)
 * kept in the URL with replace history; rows link to the detail page, drafts to the wizard.
 */
export function CampaignList() {
  const [url, setUrl] = useUrlState(URL_SCHEMA);
  const [today] = useState(() => todayISO());

  // Local mirrors for instant feedback; the URL follows (replace) and wins on Back/refresh.
  const [filter, setFilterState] = useState<CampaignFilterValue>(() => parseFilter(url.statut));
  const [query, setQuery] = useState(url.q);
  const [tri, setTri] = useState(url.tri);
  const [seen, setSeen] = useState(url);
  if (seen !== url) {
    setSeen(url);
    if (url.statut !== seen.statut) setFilterState(url.statut);
    if (url.q !== seen.q && url.q !== query) setQuery(url.q);
    if (url.tri !== seen.tri) setTri(url.tri);
  }

  const setFilter = (value: CampaignFilterValue) => {
    setFilterState(value);
    setUrl({ statut: value });
  };
  const sort = useMemo(() => parseCampaignSort(tri), [tri]);
  const setSort = (value: string) => {
    const next = serializeCampaignSort(parseCampaignSort(value));
    setTri(next);
    setUrl({ tri: next });
  };

  // Search: debounce the URL write, filter instantly.
  useEffect(() => {
    if (query === url.q) return;
    const timer = window.setTimeout(() => setUrl({ q: query }), 300);
    return () => window.clearTimeout(timer);
  }, [query, url.q, setUrl]);

  const { data, error, loading, reload, slow } = useResource(
    "campaigns-mine",
    (signal) => campaignsApi.mine({ signal }),
    { cacheKey: resourceKeys.campaignsMine },
  );

  const campaigns = useMemo(() => data ?? [], [data]);
  const counts = useMemo(() => countByFilter(campaigns, today), [campaigns, today]);
  const visible = useMemo(
    () => sortCampaigns(filterCampaigns(campaigns, filter, query, today), sort),
    [campaigns, filter, query, today, sort],
  );
  const draftIds = useMemo(
    () => campaigns.filter((c) => c.status === "BROUILLON").map((c) => c.id),
    [campaigns],
  );
  const creneaux = useDraftCreneaux(draftIds);
  // The empty state carries the page's primary « Créer une campagne »: the topbar CTA steps back.
  useDemoteTopbarCta(Boolean(data) && campaigns.length === 0);

  const resetAll = () => {
    setFilterState("toutes");
    setQuery("");
    setTri("");
    setUrl({ statut: "toutes", q: "", tri: "" });
  };
  const resetFilters = () => {
    setQuery("");
    setUrl({ q: "" });
    if (filter !== "toutes") setFilter("toutes");
  };

  if (error && !data) {
    return <ErrorState error={error} onRetry={reload} />;
  }

  if (loading && !data) {
    return <CampaignListSkeleton slow={slow} onRetry={reload} />;
  }

  if (campaigns.length === 0) {
    return (
      <EmptyState
        icon={<Megaphone />}
        title="Aucune campagne pour l'instant"
        description="Créez votre première campagne : elle reste en brouillon jusqu'à sa soumission."
        action={
          <Button asChild variant="primary">
            <Link href={routes.espace.wizard(null)}>Créer une campagne</Link>
          </Button>
        }
      />
    );
  }

  const sortValue = sort.dir === "desc" ? `-${sort.key}` : sort.key;
  const searching = query.trim().length > 0;
  const activeCount = (filter !== "toutes" ? 1 : 0) + (tri ? 1 : 0);

  return (
    <Tabs value={filter} onValueChange={(v) => setFilter(parseFilter(v))}>
      <div className="flex flex-col gap-4">
        <TabsList aria-label="Filtrer les campagnes par statut" className="self-start">
          {CAMPAIGN_FILTERS.map((f) => (
            <TabsTrigger
              key={f.value}
              value={f.value}
              count={counts[f.value]}
              title={f.description ?? undefined}
            >
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <FilterBar
          search={{
            value: query,
            onChange: setQuery,
            placeholder: "Rechercher par nom…",
            label: "Rechercher une campagne par nom",
          }}
          sort={{ value: sortValue, options: CAMPAIGN_SORT_OPTIONS, onChange: setSort }}
          resultCount={formatCount(visible.length, "campagne", "campagnes")}
          activeCount={activeCount}
          onReset={resetAll}
        />
      </div>

      {CAMPAIGN_FILTERS.map((f) => (
        <TabsContent key={f.value} value={f.value}>
          {visible.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {visible.map((c) => (
                <CampaignRow key={c.id} campaign={c} today={today} creneaux={creneaux.get(c.id)} />
              ))}
            </ul>
          ) : searching ? (
            <div className="flex flex-col items-start gap-3 py-6">
              <p role="status" className="text-[0.9375rem] text-ink-soft">
                Aucun résultat pour ces filtres
              </p>
              <Button
                variant="secondary"
                iconLeft={<RotateCcw aria-hidden="true" />}
                onClick={resetFilters}
              >
                Réinitialiser les filtres
              </Button>
            </div>
          ) : (
            <EmptyState
              compact
              icon={<Megaphone />}
              title={EMPTY_TAB_COPY[f.value]}
              description={
                f.description
                  ? `Cet onglet regroupe : ${f.description.charAt(0).toLowerCase()}${f.description.slice(1)}.`
                  : "Les campagnes apparaissent ici selon leur statut."
              }
              action={
                <Button variant="secondary" onClick={() => setFilter("toutes")}>
                  Voir toutes les campagnes
                </Button>
              }
            />
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
