"use client";

import { Box, CalendarRange, SearchX, X } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { loadNetworkLookups, type NetworkLookups } from "@/components/espace/espace-data";
import { Amount, EstimateTag } from "@/components/espace/espace-ui";
import { computeAdvertiserKpis } from "@/components/espace/kpis";
import {
  activeScopeFilterCount,
  isFiltering,
  countByStatus,
  DEFAULT_RESERVATION_SORT,
  filterByScope,
  filterReservationRows,
  joinReservations,
  RESERVATION_SORT_KEYS,
  RESERVATION_SORT_OPTIONS,
  RESERVATION_STATUSES,
  reservationSortCaption,
  reservationSortValue,
  type ReservationRow,
  zoneOptions,
} from "@/components/espace/reservations-model";
import { type AdvertiserData, useAdvertiserData } from "@/components/espace/use-advertiser-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Field, Select } from "@/components/ui/field";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { PartialNotice } from "@/components/ui/partial-notice";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RESERVATION_STATUS } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { formatCount, formatDateRange, formatEstimate, formatTimeRange } from "@/lib/format";
import { routes } from "@/lib/routes";
import { param, parseSortParam, serializeSort, useTableSort, useUrlState } from "@/lib/url-state";
import { useDismissible } from "@/lib/use-dismissible";
import { useResource } from "@/lib/use-resource";

const URL_SCHEMA = {
  statut: param.optionalEnum(RESERVATION_STATUSES),
  campagne: param.id(),
  zone: param.id(),
};

/** Plural tile labels (glossary: TEMPORAIRE « Bloqué », CONFIRMEE « Confirmé »). */
const STATUS_TABS = [
  { value: "toutes", label: "Toutes" },
  ...RESERVATION_STATUSES.map((s) => ({ value: s, label: RESERVATION_STATUS[s].label })),
] as const;

/** Must render under <Suspense> (URL state). */
export function ReservationsView() {
  const data = useAdvertiserData();
  const lookups = useResource("espace:lookups", loadNetworkLookups);
  const lookupsFailed = lookups.data === undefined && Boolean(lookups.error);
  const resolvedLookups = useMemo<NetworkLookups | undefined>(
    () => lookups.data ?? (lookupsFailed ? { supports: null, zones: null } : undefined),
    [lookups.data, lookupsFailed],
  );

  return (
    <>
      <PageHeader
        title="Réservations"
        description="Vos créneaux par Porteur et par zone, pour toutes vos campagnes."
      />
      {data.campaigns ? (
        <ReservationsContent data={data} lookups={resolvedLookups} />
      ) : data.error ? (
        <ErrorState error={data.error} onRetry={data.reload} />
      ) : (
        <ReservationsSkeleton slow={data.slow} onRetry={data.reload} />
      )}
    </>
  );
}

function ReservationsSkeleton({ slow, onRetry }: { slow?: boolean; onRetry?: () => void }) {
  return (
    <LoadingRegion
      label="Chargement des réservations…"
      slow={slow}
      onRetry={onRetry}
      className="flex flex-col gap-5"
    >
      <Skeleton className="h-20 rounded-card" />
      <Skeleton className="h-11 w-full max-w-lg rounded-full" />
      <Skeleton className="h-72 rounded-card" />
    </LoadingRegion>
  );
}

function ReservationsContent({
  data,
  lookups,
}: {
  data: AdvertiserData;
  lookups: NetworkLookups | undefined;
}) {
  const campaigns = useMemo(() => data.campaigns ?? [], [data.campaigns]);
  const reservations = data.reservations;
  const [state, setState] = useUrlState(URL_SCHEMA);
  const { sort, setSort } = useTableSort("tri", {
    defaultSort: DEFAULT_RESERVATION_SORT,
    allowedKeys: RESERVATION_SORT_KEYS,
  });
  const [explainerDismissed, dismissExplainer] = useDismissible("hint:reservations-explainer");

  // Ids from the URL only filter the caller's own rows (never trusted for access).
  const campaignId =
    state.campagne !== null && campaigns.some((c) => c.id === state.campagne)
      ? state.campagne
      : null;
  const filters = { status: state.statut, campaignId, zoneId: state.zone };

  const rows = useMemo(
    () =>
      reservations
        ? joinReservations(
            reservations,
            campaigns,
            lookups?.supports ?? null,
            lookups?.zones ?? null,
          )
        : [],
    [reservations, campaigns, lookups],
  );
  const kpis = useMemo(
    () => computeAdvertiserKpis(campaigns, reservations ?? []),
    [campaigns, reservations],
  );
  const scoped = useMemo(
    () => filterByScope(rows, { campaignId, zoneId: state.zone }),
    [rows, campaignId, state.zone],
  );
  const counts = useMemo(() => countByStatus(scoped), [scoped]);
  const visible = useMemo(
    () => filterReservationRows(rows, { status: state.statut, campaignId, zoneId: state.zone }),
    [rows, state.statut, campaignId, state.zone],
  );
  const zones = useMemo(() => {
    const options = zoneOptions(rows);
    if (state.zone !== null && !options.some((z) => z.id === state.zone)) {
      options.push({ id: state.zone, name: `Zone n° ${state.zone}` });
    }
    return options;
  }, [rows, state.zone]);

  const ready = reservations !== undefined && lookups !== undefined;
  const namesMissing =
    lookups !== undefined && (lookups.supports === null || lookups.zones === null);
  const activeCount = activeScopeFilterCount(filters);
  const reset = () => setState({ statut: null, campagne: null, zone: null });

  if (ready && rows.length === 0 && !data.partial) {
    return (
      <EmptyState
        icon={<CalendarRange />}
        title="Aucun créneau réservé."
        description="Les créneaux se réservent depuis une campagne : choisissez vos Porteurs sur sa période."
        action={
          <Button asChild variant="primary">
            <Link href={routes.espace.wizard(null)}>Créer une campagne</Link>
          </Button>
        }
      />
    );
  }

  const columns: DataTableColumn<ReservationRow>[] = [
    {
      key: "campagne",
      header: "Campagne",
      cell: (row) => (
        <Link
          href={routes.espace.campaign(row.reservation.campaignId)}
          title={row.campaignName}
          className="break-words text-brand-blue-text hover:underline"
        >
          {row.campaignName}
        </Link>
      ),
    },
    {
      key: "porteur",
      header: "Porteur",
      primary: true,
      sortable: true,
      sortLabel: "Porteur",
      sortValue: (row) => reservationSortValue(row, "porteur"),
      cell: (row) => (
        <Link
          href={routes.espace.network({ porteur: row.reservation.supportId })}
          className="group/porteur inline-flex min-w-0 flex-col items-start gap-1"
        >
          <span className="font-label font-semibold break-words text-ink-strong group-hover/porteur:text-brand-blue-text">
            {row.supportName}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-line-strong px-2 py-0.5 font-label text-[0.75rem] font-semibold whitespace-nowrap text-brand-blue-text">
            <Box aria-hidden="true" className="size-3.5" />
            Voir en 3D
          </span>
        </Link>
      ),
    },
    {
      key: "zone",
      header: "Zone",
      cell: (row) => (
        <Link
          href={routes.espace.network({ zone: row.reservation.zoneId })}
          className="break-words text-brand-blue-text hover:underline"
        >
          {row.zoneName}
        </Link>
      ),
    },
    {
      key: "periode",
      header: "Période",
      sortable: true,
      sortLabel: "période",
      sortValue: (row) => reservationSortValue(row, "periode"),
      nowrap: true,
      cell: (row) => (
        <span className="flex flex-col">
          <span>
            {formatDateRange(row.reservation.startDate, row.reservation.endDate, "medium")}
          </span>
          <span className="text-[0.8125rem] text-muted">
            {formatTimeRange(row.reservation.startTime, row.reservation.endTime)}
          </span>
        </span>
      ),
    },
    {
      key: "statut",
      header: "Statut",
      sortable: true,
      sortLabel: "statut",
      sortValue: (row) => reservationSortValue(row, "statut"),
      mobileMeta: true,
      cell: (row) => <StatusPill type="reservation" status={row.reservation.reservationStatus} />,
    },
    {
      key: "cout",
      header: "Coût estimé",
      sortable: true,
      sortLabel: "coût estimé",
      sortValue: (row) => reservationSortValue(row, "cout"),
      align: "right",
      mobileMeta: true,
      nowrap: true,
      cell: (row) => formatEstimate(row.reservation.estimatedCost, "DT"),
    },
  ];

  const resultCount = formatCount(visible.length, "réservation", "réservations");

  return (
    <div className="flex flex-col gap-6" aria-busy={data.refreshing || undefined}>
      <section
        aria-labelledby="resa-summary"
        className="rounded-card border border-line bg-grad-card"
      >
        <h2 id="resa-summary" className="sr-only">
          Synthèse des réservations
        </h2>
        <dl className="grid grid-cols-3 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.7fr)]">
          {[
            { label: "Créneaux actifs", value: kpis.holdingReservationCount },
            { label: "Bloqués", value: kpis.reservationsByStatus.TEMPORAIRE },
            { label: "Confirmés", value: kpis.reservationsByStatus.CONFIRMEE },
          ].map((item, i) => (
            <div
              key={item.label}
              className={cx(
                "flex min-w-0 flex-col justify-between p-4 sm:p-5",
                i > 0 && "border-l border-line",
              )}
            >
              <dt className="font-label text-[0.8125rem] font-medium text-muted">{item.label}</dt>
              <dd className="mt-1.5 font-display text-[1.5rem] leading-none font-semibold text-ink-strong tabular">
                {ready ? item.value : <Skeleton className="h-6 w-8" />}
              </dd>
            </div>
          ))}
          <div className="col-span-3 border-t border-line p-4 sm:p-5 lg:col-span-1 lg:border-t-0 lg:border-l">
            <dt className="font-label text-[0.8125rem] font-medium text-muted">
              Coût estimé des créneaux actifs
            </dt>
            <dd className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {ready ? (
                <Amount
                  value={kpis.estimatedCost}
                  className="font-display text-[1.5rem] leading-none font-semibold text-ink-strong"
                />
              ) : (
                <Skeleton className="h-6 w-24" />
              )}
              <EstimateTag />
            </dd>
          </div>
        </dl>
        {data.partial ? (
          <div className="border-t border-line px-4 py-3 sm:px-5">
            <PartialNotice
              message="Données partielles : les créneaux de certaines campagnes n'ont pas pu être chargés"
              onRetry={data.retryReservations}
            />
          </div>
        ) : null}
      </section>

      {explainerDismissed ? null : (
        <Alert
          tone="info"
          live="none"
          title="Bloqué, puis confirmé"
          action={
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3.5"
              onClick={dismissExplainer}
              iconLeft={<X aria-hidden="true" />}
            >
              Masquer cette explication
            </Button>
          }
        >
          {RESERVATION_STATUS.TEMPORAIRE.description} Il est confirmé à la validation de votre
          campagne ; si elle est refusée, ses créneaux sont libérés. Pour libérer un créneau,
          contactez votre interlocuteur TPUB.
        </Alert>
      )}

      {namesMissing ? (
        <Alert tone="warning" live="none">
          Certains noms de Porteurs ou de zones n&apos;ont pas pu être chargés : ils sont affichés
          par leur numéro.
        </Alert>
      ) : null}

      <Tabs
        value={state.statut ?? "toutes"}
        onValueChange={(v) =>
          setState({ statut: v === "toutes" ? null : (v as (typeof RESERVATION_STATUSES)[number]) })
        }
      >
        <div className="flex flex-col gap-4">
          <TabsList aria-label="Filtrer par statut" className="self-start">
            {STATUS_TABS.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                count={ready ? counts[t.value] : undefined}
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <FilterBar
            activeCount={activeCount}
            onReset={reset}
            resultCount={ready ? resultCount : undefined}
            sort={{
              value: serializeSort(sort) ?? "periode",
              options: RESERVATION_SORT_OPTIONS,
              onChange: (v) => setSort(parseSortParam(v, RESERVATION_SORT_KEYS)),
            }}
          >
            <Field label="Campagne" className="md:min-w-[220px]">
              <Select
                value={campaignId === null ? "" : String(campaignId)}
                onChange={(e) =>
                  setState({ campagne: e.target.value ? Number(e.target.value) : null })
                }
              >
                <option value="">Toutes les campagnes</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Zone" className="md:min-w-[200px]">
              <Select
                value={state.zone === null ? "" : String(state.zone)}
                onChange={(e) => setState({ zone: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">Toutes les zones</option>
                {zones.map((z) => (
                  <option key={z.id} value={String(z.id)}>
                    {z.name}
                  </option>
                ))}
              </Select>
            </Field>
          </FilterBar>
        </div>

        <TabsContent value={state.statut ?? "toutes"} className="mt-4">
          {ready ? (
            <>
              <DataTable
                columns={columns}
                rows={visible}
                getRowKey={(row) => row.reservation.id}
                caption="Réservations de vos campagnes"
                sort={sort}
                onSortChange={setSort}
                sortCaption={reservationSortCaption(sort)}
                emptyFiltered={
                  !isFiltering(filters) ? (
                    <div className="flex flex-col items-start gap-2 rounded-card border border-line px-5 py-6">
                      <p className="font-label text-[0.9375rem] font-semibold text-ink-strong">
                        Aucun créneau chargé pour le moment.
                      </p>
                      <PartialNotice onRetry={data.retryReservations} />
                    </div>
                  ) : (
                    <div
                      role="status"
                      className="flex flex-col items-start gap-3 rounded-card border border-line px-5 py-6"
                    >
                      <p className="flex items-center gap-2 font-label text-[0.9375rem] font-semibold text-ink-strong">
                        <SearchX aria-hidden="true" className="size-4 text-muted" />
                        Aucun résultat pour ces filtres
                      </p>
                      <Button variant="secondary" onClick={reset}>
                        Réinitialiser les filtres
                      </Button>
                    </div>
                  )
                }
              />
              <p className="mt-4 flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted">
                <EstimateTag />
                Coût estimé : 10 % du budget de la campagne par créneau, fixé à la réservation. Ce
                n&apos;est ni un prix ni une facture.
              </p>
            </>
          ) : (
            <LoadingRegion label="Chargement des créneaux…">
              <Skeleton className="h-72 rounded-card" />
            </LoadingRegion>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
