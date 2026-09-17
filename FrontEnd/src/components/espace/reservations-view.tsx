"use client";

import { Box, CalendarRange, SearchX, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Amount, EstimateTag } from "@/components/espace/espace-ui";
import {
  activeScopeFilterCount,
  campaignOptions,
  countByStatus,
  DEFAULT_RESERVATION_SORT,
  filterByScope,
  filterReservationRows,
  isFiltering,
  joinReservations,
  RESERVATION_SORT_KEYS,
  RESERVATION_SORT_OPTIONS,
  RESERVATION_STATUSES,
  reservationSortCaption,
  reservationSortValue,
  reservationSummary,
  type ReservationRow,
  zoneOptions,
} from "@/components/espace/reservations-model";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Field, Select, Textarea } from "@/components/ui/field";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { reservationsApi } from "@/lib/api/endpoints";
import type { ReservationResponse } from "@/lib/api/types";
import { canCancelReservation, RESERVATION_STATUS } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { formatCount, formatDateRange, formatEstimate, formatTimeRange } from "@/lib/format";
import { fetchCached, invalidate, resourceKeys } from "@/lib/resource-cache";
import { routes } from "@/lib/routes";
import { param, parseSortParam, serializeSort, useTableSort, useUrlState } from "@/lib/url-state";
import { useDismissible } from "@/lib/use-dismissible";
import { useResource } from "@/lib/use-resource";

const URL_SCHEMA = {
  statut: param.optionalEnum(RESERVATION_STATUSES),
  campagne: param.id(),
  zone: param.id(),
};

const STATUS_TABS = [
  { value: "toutes", label: "Toutes" },
  ...RESERVATION_STATUSES.map((s) => ({ value: s, label: RESERVATION_STATUS[s].label })),
] as const;

/** Cancel reason sent to the backend (≤ 255 characters). */
export const CANCEL_REASON_MAX = 255;

/** `/reservations/mine` through the shared cache (invalidated after any booking change). */
export function loadMyReservations(
  signal: AbortSignal,
  options: { force?: boolean } = {},
): Promise<ReservationResponse[]> {
  return fetchCached(resourceKeys.reservationsMine, (s) => reservationsApi.mine({ signal: s }), {
    signal,
    force: options.force,
  });
}

/**
 * /espace/reservations — GET /reservations/mine (every status, EXPIREE and ANNULEE included),
 * filters in the URL, cancellation of TEMPORAIRE slots when the backend says `cancellable`.
 * Must render under <Suspense> (URL state).
 */
export function ReservationsView() {
  const resource = useResource("espace:reservations", (signal) => loadMyReservations(signal), {
    cacheKey: resourceKeys.reservationsMine,
  });
  const { setData } = resource;

  return (
    <>
      <PageHeader
        title="Réservations"
        description="Vos créneaux par Porteur et par zone, pour toutes vos campagnes."
      />
      {resource.data ? (
        <ReservationsContent
          reservations={resource.data}
          refreshing={resource.loading}
          onChanged={(updated) => {
            setData((prev) => (prev ?? []).map((r) => (r.id === updated.id ? updated : r)));
            invalidate(resourceKeys.reservationsByCampaign(updated.campaignId));
            invalidate(resourceKeys.campaignsMine);
            invalidate(resourceKeys.statisticsMine);
          }}
        />
      ) : resource.error ? (
        <ErrorState error={resource.error} onRetry={resource.reload} />
      ) : (
        <LoadingRegion
          label="Chargement des réservations…"
          slow={resource.slow}
          onRetry={resource.reload}
          className="flex flex-col gap-5"
        >
          <Skeleton className="h-20 rounded-card" />
          <Skeleton className="h-11 w-full max-w-lg rounded-full" />
          <Skeleton className="h-72 rounded-card" />
        </LoadingRegion>
      )}
    </>
  );
}

function ReservationsContent({
  reservations,
  refreshing,
  onChanged,
}: {
  reservations: readonly ReservationResponse[];
  refreshing: boolean;
  onChanged: (updated: ReservationResponse) => void;
}) {
  const { toast } = useToast();
  const [state, setState] = useUrlState(URL_SCHEMA);
  const { sort, setSort } = useTableSort("tri", {
    defaultSort: DEFAULT_RESERVATION_SORT,
    allowedKeys: RESERVATION_SORT_KEYS,
  });
  const [explainerDismissed, dismissExplainer] = useDismissible("hint:reservations-explainer");
  const [cancelling, setCancelling] = useState<ReservationRow | null>(null);
  const [reason, setReason] = useState("");

  const rows = useMemo(() => joinReservations(reservations), [reservations]);
  const campaigns = useMemo(() => campaignOptions(rows), [rows]);
  // Ids from the URL only filter the caller's own rows (never trusted for access).
  const campaignId =
    state.campagne !== null && campaigns.some((c) => c.id === state.campagne)
      ? state.campagne
      : null;
  const filters = { status: state.statut, campaignId, zoneId: state.zone };

  const summary = useMemo(() => reservationSummary(rows), [rows]);
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

  const activeCount = activeScopeFilterCount(filters);
  const reset = () => setState({ statut: null, campagne: null, zone: null });

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<CalendarRange />}
        title="Aucun créneau réservé."
        description="Les créneaux se réservent depuis une campagne : placez votre zone sur la carte puis choisissez vos Porteurs."
        action={
          <Button asChild variant="primary">
            <Link href={routes.espace.wizard(null)}>Créer une campagne</Link>
          </Button>
        }
      />
    );
  }

  const confirmCancel = async () => {
    if (!cancelling) return;
    const trimmed = reason.trim();
    const updated = await reservationsApi.cancel(
      cancelling.reservation.id,
      trimmed ? trimmed.slice(0, CANCEL_REASON_MAX) : null,
    );
    onChanged(updated);
    toast({
      title: "Créneau libéré",
      description: `${cancelling.supportName} · ${cancelling.campaignName}`,
      variant: "success",
    });
    setCancelling(null);
    setReason("");
  };

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
      cell: (row) => (
        <span className="flex flex-col items-start gap-1">
          <StatusPill type="reservation" status={row.reservation.reservationStatus} />
          {row.reservation.reservationStatus === "ANNULEE" && row.reservation.cancelReason ? (
            <span className="text-[0.75rem] text-muted">
              Motif : {row.reservation.cancelReason}
            </span>
          ) : null}
        </span>
      ),
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
  const filtering = isFiltering(filters);

  return (
    <div className="flex flex-col gap-6" aria-busy={refreshing || undefined}>
      <section
        aria-labelledby="resa-summary"
        className="rounded-card border border-line bg-grad-card"
      >
        <h2 id="resa-summary" className="sr-only">
          Synthèse des réservations
        </h2>
        <dl className="grid grid-cols-3 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.7fr)]">
          {[
            { label: "Créneaux actifs", value: summary.holding },
            { label: "Bloqués", value: summary.temporary },
            { label: "Confirmés", value: summary.confirmed },
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
                {item.value}
              </dd>
            </div>
          ))}
          <div className="col-span-3 border-t border-line p-4 sm:p-5 lg:col-span-1 lg:border-t-0 lg:border-l">
            <dt className="font-label text-[0.8125rem] font-medium text-muted">
              Coût estimé des créneaux actifs
            </dt>
            <dd className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Amount
                value={summary.estimatedCost}
                className="font-display text-[1.5rem] leading-none font-semibold text-ink-strong"
              />
              <EstimateTag />
            </dd>
          </div>
        </dl>
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
          campagne. Un créneau dont la période est passée devient «&nbsp;
          {RESERVATION_STATUS.EXPIREE.label}&nbsp;».
        </Alert>
      )}

      <Tabs
        value={state.statut ?? "toutes"}
        onValueChange={(v) =>
          setState({ statut: v === "toutes" ? null : (v as (typeof RESERVATION_STATUSES)[number]) })
        }
      >
        <div className="flex flex-col gap-4">
          <TabsList aria-label="Filtrer par statut" className="self-start">
            {STATUS_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} count={counts[t.value]}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <FilterBar
            activeCount={activeCount}
            onReset={reset}
            resultCount={resultCount}
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
          <DataTable
            columns={columns}
            rows={visible}
            getRowKey={(row) => row.reservation.id}
            caption="Réservations de vos campagnes"
            sort={sort}
            onSortChange={setSort}
            sortCaption={reservationSortCaption(sort)}
            rowActionsLabel="Actions"
            rowActions={(row) =>
              canCancelReservation(row.reservation, "ANNONCEUR") ? (
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft={<X aria-hidden="true" />}
                  onClick={() => {
                    setReason("");
                    setCancelling(row);
                  }}
                >
                  Annuler<span className="sr-only"> le créneau : {row.supportName}</span>
                </Button>
              ) : null
            }
            emptyFiltered={
              <div
                role="status"
                className="flex flex-col items-start gap-3 rounded-card border border-line px-5 py-6"
              >
                <p className="flex items-center gap-2 font-label text-[0.9375rem] font-semibold text-ink-strong">
                  <SearchX aria-hidden="true" className="size-4 text-muted" />
                  {filtering ? "Aucun résultat pour ces filtres" : "Aucun créneau avec ce statut"}
                </p>
                {filtering ? (
                  <Button variant="secondary" onClick={reset}>
                    Réinitialiser les filtres
                  </Button>
                ) : null}
              </div>
            }
          />
          <p className="mt-4 flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted">
            <EstimateTag />
            Coût estimé à la réservation selon le type de Porteur, sa visibilité et la durée du
            créneau. Ce n&apos;est ni un prix ni une facture.
          </p>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open) setCancelling(null);
        }}
        title="Libérer ce créneau ?"
        description={
          cancelling ? (
            <>
              {cancelling.supportName} ·{" "}
              {formatDateRange(
                cancelling.reservation.startDate,
                cancelling.reservation.endDate,
                "medium",
              )}{" "}
              · {cancelling.campaignName}. Le Porteur redevient disponible pour d&apos;autres
              annonceurs.
            </>
          ) : undefined
        }
        confirmLabel="Libérer le créneau"
        cancelLabel="Garder le créneau"
        onConfirm={confirmCancel}
      >
        <Field label="Motif (facultatif)" hint={`${CANCEL_REASON_MAX} caractères au maximum.`}>
          <Textarea
            value={reason}
            maxLength={CANCEL_REASON_MAX}
            rows={2}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
