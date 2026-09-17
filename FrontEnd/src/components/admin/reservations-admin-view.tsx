"use client";

import { CalendarRange, RefreshCw, Search, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";

import { PagerBar, RoleRestricted } from "@/components/admin/admin-controls";
import { IdChip, ReadOnlyNotice } from "@/components/admin/admin-ui";
import {
  CANCEL_REASON_MAX,
  cancelReasonError,
  conflictsSummary,
  groupConflicts,
  RESERVATION_STATUS_VALUES,
  type ReservationFilterState,
  reservationFilterCount,
  reservationSearchQuery,
  windowLabel,
} from "@/components/admin/reservations-admin-model";
import { addDaysISO } from "@/components/admin/stats-model";
import { useSession } from "@/components/shell/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { adminUsersApi, reservationsApi, supportsApi, zonesApi } from "@/lib/api/endpoints";
import type { ReservationResponse } from "@/lib/api/types";
import {
  CAMPAIGN_STATUS,
  canCancelReservation,
  CONFLICT_SEVERITY,
  RESERVATION_STATUS,
} from "@/lib/campaign-status";
import { formatDateRange, formatDateTime, formatNumber, formatTND, todayISO } from "@/lib/format";
import { fetchCached, invalidate, resourceKeys } from "@/lib/resource-cache";
import { routes } from "@/lib/routes";
import { param, useUrlState } from "@/lib/url-state";
import { useResource } from "@/lib/use-resource";

const TABS = ["toutes", "conflits"] as const;

const URL_SCHEMA = {
  onglet: param.enum(TABS, "toutes"),
  statut: param.optionalEnum(RESERVATION_STATUS_VALUES),
  zone: param.id(),
  porteur: param.id(),
  campagne: param.id(),
  client: param.id(),
  du: param.string(),
  au: param.string(),
  page: param.id(),
};

async function loadRefs(signal: AbortSignal) {
  const [zones, supports, clients] = await Promise.all([
    fetchCached(resourceKeys.zonesAll, (s) => zonesApi.all({ signal: s }), { signal }),
    fetchCached(resourceKeys.supportsAll, (s) => supportsApi.all({ signal: s }), { signal }),
    adminUsersApi
      .list({ role: ["ANNONCEUR"], size: 100, signal })
      .then((p) => p.items)
      .catch(() => []),
  ]);
  return { zones, supports, clients };
}

export function ReservationsAdminView() {
  const { role, canAct } = useSession();
  if (role === "OPERATEUR") {
    return (
      <RoleRestricted
        header={<PageHeader title="Réservations" />}
        title="Suivi réservé aux administrateurs et superviseurs"
        description="Consultez l'état des Porteurs dans Réseau et leurs diffusions dans le Journal."
      />
    );
  }
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ReservationsContent canAct={canAct} role={role} />
    </Suspense>
  );
}

function ReservationsContent({
  canAct,
  role,
}: {
  canAct: boolean;
  role: ReturnType<typeof useSession>["role"];
}) {
  const { toast } = useToast();
  const [url, setUrl] = useUrlState(URL_SCHEMA);
  const today = todayISO();
  const refs = useResource("admin:reservations:refs", loadRefs);
  const [toCancel, setToCancel] = useState<ReservationResponse | null>(null);
  const [reason, setReason] = useState("");

  const state: ReservationFilterState = {
    status: url.statut,
    zoneId: url.zone,
    supportId: url.porteur,
    campaignId: url.campagne,
    clientId: url.client,
    from: url.du,
    to: url.au,
    page: url.page ?? 0,
  };
  const query = reservationSearchQuery(state);
  const list = useResource(
    url.onglet === "toutes" ? `admin:reservations:${JSON.stringify(query)}` : null,
    (signal) => reservationsApi.search({ ...query, signal }),
  );
  const conflictFrom = url.du || today;
  const conflictTo = url.au || addDaysISO(conflictFrom, 90);
  const conflicts = useResource(
    url.onglet === "conflits"
      ? `admin:conflicts:${conflictFrom}:${conflictTo}:${url.zone ?? ""}:${url.porteur ?? ""}`
      : null,
    (signal) =>
      reservationsApi.conflicts({
        from: conflictFrom,
        to: conflictTo,
        zoneId: url.zone ?? undefined,
        supportId: url.porteur ?? undefined,
        signal,
      }),
  );
  const groups = conflicts.data ? groupConflicts(conflicts.data) : null;

  const onCancelled = (updated: ReservationResponse) => {
    list.setData((prev) =>
      prev
        ? { ...prev, items: prev.items.map((r) => (r.id === updated.id ? updated : r)) }
        : { items: [updated], page: 0, size: 20, totalItems: 1, totalPages: 1 },
    );
    invalidate(resourceKeys.reservationConflicts);
    if (url.onglet === "conflits") conflicts.reload();
    toast({ title: `Réservation #${updated.id} annulée`, variant: "success" });
  };

  const columns: DataTableColumn<ReservationResponse>[] = [
    {
      key: "campaign",
      header: "Campagne",
      primary: true,
      className: "min-w-[12rem]",
      cell: (r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <IdChip id={r.id} />
            <Link
              href={routes.admin.moderation({ onglet: "toutes", examen: r.campaignId })}
              className="font-label font-semibold text-ink-strong hover:text-brand-blue-text hover:underline"
            >
              {r.campaignName ?? `Campagne n° ${r.campaignId}`}
            </Link>
          </div>
          <p className="mt-1 text-[0.8125rem] text-muted">
            {r.clientCompanyName ?? "Annonceur"}
            {r.campaignStatus ? ` · ${CAMPAIGN_STATUS[r.campaignStatus].label}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "support",
      header: "Porteur",
      cell: (r) => (
        <span>
          {r.supportName ?? `Porteur n° ${r.supportId}`}
          <span className="block text-[0.8125rem] text-muted">
            {r.zoneName ?? `Zone n° ${r.zoneId}`}
          </span>
        </span>
      ),
    },
    {
      key: "window",
      header: "Créneau",
      cell: (r) => <span className="whitespace-nowrap tabular">{windowLabel(r)}</span>,
    },
    {
      key: "status",
      header: "Statut",
      mobileMeta: true,
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <StatusPill type="reservation" status={r.reservationStatus} size="sm" />
          {r.cancelReason ? (
            <span className="max-w-[14rem] text-xs text-muted" title={r.cancelReason}>
              {r.cancelReason}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "estimate",
      header: "Estimation",
      align: "right",
      cell: (r) => (
        <span className="whitespace-nowrap tabular">
          {formatNumber(r.estimatedViews)} aff.
          <span className="block text-xs text-muted">{formatTND(r.estimatedCost)}</span>
        </span>
      ),
    },
    {
      key: "created",
      header: "Créée",
      hideOnMobile: true,
      cell: (r) => (
        <span className="text-[0.8125rem] whitespace-nowrap text-muted">
          {r.createdAt ? formatDateTime(r.createdAt) : "—"}
        </span>
      ),
    },
  ];

  const filterCount = reservationFilterCount(state);
  const resetFilters = () =>
    setUrl({
      statut: null,
      zone: null,
      porteur: null,
      campagne: null,
      client: null,
      du: "",
      au: "",
      page: null,
    });

  const zoneSelect = (
    <Field label="Zone" className="w-44">
      <Select
        value={url.zone !== null ? String(url.zone) : ""}
        onChange={(e) =>
          setUrl({ zone: e.target.value ? Number(e.target.value) : null, page: null })
        }
      >
        <option value="">Toutes les zones</option>
        {(refs.data?.zones ?? []).map((z) => (
          <option key={z.id} value={String(z.id)}>
            {z.name}
          </option>
        ))}
      </Select>
    </Field>
  );
  const supportSelect = (
    <Field label="Porteur" className="w-48">
      <Select
        value={url.porteur !== null ? String(url.porteur) : ""}
        onChange={(e) =>
          setUrl({ porteur: e.target.value ? Number(e.target.value) : null, page: null })
        }
      >
        <option value="">Tous les Porteurs</option>
        {(refs.data?.supports ?? [])
          .filter((s) => url.zone === null || s.zoneId === url.zone)
          .map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.name}
            </option>
          ))}
      </Select>
    </Field>
  );
  const dateFields = (
    <>
      <Field label="Du" className="w-40">
        <Input
          type="date"
          value={url.du}
          max={url.au || undefined}
          onChange={(e) => setUrl({ du: e.target.value, page: null })}
        />
      </Field>
      <Field label="Au" className="w-40">
        <Input
          type="date"
          value={url.au}
          min={url.du || undefined}
          onChange={(e) => setUrl({ au: e.target.value, page: null })}
        />
      </Field>
    </>
  );

  return (
    <>
      <PageHeader
        title="Réservations"
        description="Toutes les réservations de Porteurs, leurs estimations et les créneaux où la capacité est atteinte ou dépassée."
        secondaryActions={
          <Button
            variant="secondary"
            iconLeft={<RefreshCw aria-hidden="true" />}
            onClick={() => (url.onglet === "toutes" ? list.reload() : conflicts.reload())}
          >
            Actualiser
          </Button>
        }
      />
      {!canAct ? (
        <ReadOnlyNotice role={role} className="mb-6">
          Vous consultez les réservations ; leur annulation est réservée aux administrateurs.
        </ReadOnlyNotice>
      ) : null}

      <Tabs
        value={url.onglet}
        onValueChange={(v) => {
          const next = TABS.find((t) => t === v);
          if (next) setUrl({ onglet: next, page: null });
        }}
        className="flex flex-col gap-5"
      >
        <TabsList aria-label="Réservations" className="self-start">
          <TabsTrigger value="toutes" icon={<CalendarRange />}>
            Toutes
          </TabsTrigger>
          <TabsTrigger value="conflits" icon={<TriangleAlert />} count={groups?.length}>
            Conflits
          </TabsTrigger>
        </TabsList>

        <TabsContent value="toutes" className="mt-0 flex flex-col gap-4">
          <FilterBar
            resultCount={
              list.data
                ? `${formatNumber(list.data.totalItems)} réservation${list.data.totalItems > 1 ? "s" : ""}`
                : undefined
            }
            activeCount={filterCount}
            onReset={resetFilters}
          >
            <Field label="Statut" className="w-40">
              <Select
                value={url.statut ?? ""}
                onChange={(e) =>
                  setUrl({
                    statut: RESERVATION_STATUS_VALUES.find((s) => s === e.target.value) ?? null,
                    page: null,
                  })
                }
              >
                <option value="">Tous</option>
                {RESERVATION_STATUS_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {RESERVATION_STATUS[s].label}
                  </option>
                ))}
              </Select>
            </Field>
            {zoneSelect}
            {supportSelect}
            <Field label="Annonceur" className="w-48">
              <Select
                value={url.client !== null ? String(url.client) : ""}
                onChange={(e) =>
                  setUrl({ client: e.target.value ? Number(e.target.value) : null, page: null })
                }
              >
                <option value="">Tous les annonceurs</option>
                {(refs.data?.clients ?? [])
                  .filter((u) => u.client)
                  .map((u) => (
                    <option key={u.userId} value={String(u.client?.clientId)}>
                      {u.client?.companyName || u.societe || u.nom}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="N° de campagne" className="w-36">
              <Input
                inputMode="numeric"
                value={url.campagne !== null ? String(url.campagne) : ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setUrl({ campagne: Number.isInteger(n) && n > 0 ? n : null, page: null });
                }}
              />
            </Field>
            {dateFields}
          </FilterBar>
          {list.data ? (
            <>
              <DataTable
                columns={columns}
                rows={list.data.items}
                getRowKey={(r) => r.id}
                caption="Réservations de la plateforme"
                rowActions={
                  canAct
                    ? (r) =>
                        canCancelReservation(r, role) ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            aria-label={`Annuler la réservation #${r.id}`}
                            onClick={() => {
                              setReason("");
                              setToCancel(r);
                            }}
                          >
                            Annuler
                          </Button>
                        ) : null
                    : undefined
                }
                emptyFiltered={
                  filterCount > 0 ? (
                    <EmptyState
                      compact
                      icon={<Search />}
                      title="Aucune réservation pour ces filtres"
                      action={
                        <Button variant="secondary" onClick={resetFilters}>
                          Réinitialiser les filtres
                        </Button>
                      }
                    />
                  ) : undefined
                }
                empty={
                  <EmptyState
                    icon={<CalendarRange />}
                    title="Aucune réservation"
                    description="Les réservations apparaissent quand un annonceur choisit ses Porteurs."
                  />
                }
              />
              <PagerBar
                page={list.data}
                noun="réservations"
                onPage={(p) => setUrl({ page: p > 0 ? p : null })}
              />
            </>
          ) : list.error ? (
            <ErrorState error={list.error} onRetry={list.reload} />
          ) : (
            <LoadingRegion label="Chargement des réservations…" className="flex flex-col gap-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </LoadingRegion>
          )}
        </TabsContent>

        <TabsContent value="conflits" className="mt-0 flex flex-col gap-4">
          <FilterBar
            resultCount={groups ? conflictsSummary(groups) : undefined}
            activeCount={[url.zone, url.porteur, url.du || url.au].filter(Boolean).length}
            onReset={resetFilters}
          >
            {zoneSelect}
            {supportSelect}
            {dateFields}
          </FilterBar>
          <p className="text-[0.8125rem] text-muted">
            Période analysée : {formatDateRange(conflictFrom, conflictTo)}. « Conflit » : plus de
            réservations que la capacité du Porteur ; « Saturé » : capacité entièrement réservée.
          </p>
          {groups ? (
            groups.length === 0 ? (
              <EmptyState
                icon={<CalendarRange />}
                title="Aucun conflit ni Porteur saturé"
                description="Aucun créneau ne dépasse ou n'atteint la capacité des Porteurs sur la période."
              />
            ) : (
              <ul className="flex flex-col gap-4">
                {groups.map((g) => (
                  <li
                    key={g.supportId}
                    className="rounded-card border border-line bg-grad-card p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-label text-[0.9375rem] font-semibold text-ink-strong">
                          {g.supportName}
                        </p>
                        <p className="text-[0.8125rem] text-muted">
                          {g.zoneName} · capacité {formatNumber(g.capacity)}
                        </p>
                      </div>
                      <Badge
                        tone={CONFLICT_SEVERITY[g.severity].tone}
                        title={CONFLICT_SEVERITY[g.severity].description}
                      >
                        {CONFLICT_SEVERITY[g.severity].label}
                      </Badge>
                    </div>
                    <ul className="mt-4 flex flex-col gap-3">
                      {g.conflicts.map((c, i) => (
                        <li
                          key={i}
                          className="rounded-control border border-line bg-overlay-inset p-3"
                        >
                          <p className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                            <StatusPill
                              type="custom"
                              label={CONFLICT_SEVERITY[c.severity].label}
                              tone={CONFLICT_SEVERITY[c.severity].tone}
                              size="sm"
                            />
                            Chevauchement :{" "}
                            <span className="tabular">
                              {windowLabel({
                                startDate: c.overlapStartDate,
                                endDate: c.overlapEndDate,
                                startTime: c.overlapStartTime,
                                endTime: c.overlapEndTime,
                              })}
                            </span>
                            · {c.reservations.length} réservation
                            {c.reservations.length > 1 ? "s" : ""}
                          </p>
                          <ul className="mt-2 flex flex-col divide-y divide-line">
                            {c.reservations.map((r) => (
                              <li
                                key={r.id}
                                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[0.8125rem]"
                              >
                                <IdChip id={r.id} />
                                <Link
                                  href={routes.admin.moderation({
                                    onglet: "toutes",
                                    examen: r.campaignId,
                                  })}
                                  className="font-medium text-brand-blue-text hover:underline"
                                >
                                  {r.campaignName ?? `Campagne n° ${r.campaignId}`}
                                </Link>
                                <span className="text-muted">{r.clientCompanyName ?? ""}</span>
                                <StatusPill
                                  type="reservation"
                                  status={r.reservationStatus}
                                  size="sm"
                                />
                                <span className="text-muted tabular">{windowLabel(r)}</span>
                                {canAct && canCancelReservation(r, role) ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="ml-auto"
                                    onClick={() => {
                                      setReason("");
                                      setToCancel(r);
                                    }}
                                  >
                                    Annuler
                                  </Button>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )
          ) : conflicts.error ? (
            <ErrorState error={conflicts.error} onRetry={conflicts.reload} />
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={toCancel !== null}
        onOpenChange={(open) => {
          if (!open) setToCancel(null);
        }}
        title={toCancel ? `Annuler la réservation #${toCancel.id} ?` : "Annuler la réservation ?"}
        description={
          toCancel
            ? `${toCancel.campaignName ?? "Campagne"} · ${toCancel.supportName ?? "Porteur"} · ${windowLabel(toCancel)}. La capacité du Porteur est libérée ; l'annulation est journalisée.`
            : undefined
        }
        confirmLabel="Annuler la réservation"
        cancelLabel="Garder"
        confirmDisabled={cancelReasonError(reason) !== null}
        onConfirm={async () => {
          if (!toCancel) return;
          const updated = await reservationsApi.cancel(toCancel.id, reason);
          onCancelled(updated);
        }}
      >
        <Field
          label="Motif (optionnel)"
          hint={`Visible par l'annonceur. ${CANCEL_REASON_MAX} caractères maximum.`}
          error={cancelReasonError(reason)}
        >
          <Textarea
            rows={2}
            className="min-h-16"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </ConfirmDialog>
    </>
  );
}
