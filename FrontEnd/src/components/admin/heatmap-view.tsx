"use client";

import { Flame, RefreshCw } from "lucide-react";
import { Suspense, useMemo } from "react";

import {
  defaultRange,
  demandHeatmap,
  diffusionHeatmap,
  emptyMessage,
  HEATMAP_CONTENT_TYPES,
  HEATMAP_TABS,
  hoursLabel,
  percentLabel,
  rangeError,
  topDiffusions,
  topReservations,
  zonesByDemand,
  type HeatmapTab,
} from "@/components/admin/heatmap-model";
import { HeatmapLegend, NetworkMap } from "@/components/map";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Field, Input, Select } from "@/components/ui/field";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supportsApi, zonesApi } from "@/lib/api/endpoints";
import { heatmapApi } from "@/lib/api/endpoints-carte";
import type { DemandZone } from "@/lib/api/types-carte";
import { DIFFUSION_CONTENT_TYPE_LABEL } from "@/lib/campaign-status";
import { formatNumber, todayISO } from "@/lib/format";
import { fetchCached, resourceKeys } from "@/lib/resource-cache";
import { param, useUrlState } from "@/lib/url-state";
import { useResource } from "@/lib/use-resource";

const URL_SCHEMA = {
  onglet: param.enum(HEATMAP_TABS, "diffusions"),
  du: param.string(),
  au: param.string(),
  contenu: param.optionalEnum(HEATMAP_CONTENT_TYPES),
  zone: param.id(),
};

const TAB_LABEL: Record<HeatmapTab, string> = {
  diffusions: "Diffusions",
  demande: "Demande",
};

interface TopRowView {
  supportId: number;
  supportName: string;
  zoneName: string;
  weight: number;
  detail: number;
}

async function loadNetwork(signal: AbortSignal) {
  const [zones, supports] = await Promise.all([
    fetchCached(resourceKeys.zonesAll, (s) => zonesApi.all({ signal: s }), { signal }),
    fetchCached(resourceKeys.supportsAll, (s) => supportsApi.all({ signal: s }), { signal }),
  ]);
  return { zones, supports };
}

/** « Cartes de chaleur » (docs/round2-contract.md §4.5): diffusions and demand, map + side table. */
export function HeatmapView() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <HeatmapContent />
    </Suspense>
  );
}

function HeatmapContent() {
  const [url, setUrl] = useUrlState(URL_SCHEMA);
  const today = todayISO();
  const fallback = defaultRange(url.onglet, today);
  const from = url.du || fallback.from;
  const to = url.au || fallback.to;
  const invalidRange = rangeError(from, to);

  const network = useResource("carte-chaleur-reseau", loadNetwork);
  const diffusions = useResource(
    url.onglet === "diffusions" && !invalidRange
      ? `chaleur-diffusions:${from}:${to}:${url.contenu ?? ""}:${url.zone ?? ""}`
      : null,
    (signal) =>
      heatmapApi.diffusions(
        {
          from,
          to,
          contentType: url.contenu ? [url.contenu] : undefined,
          zoneId: url.zone,
        },
        { signal },
      ),
  );
  const demand = useResource(
    url.onglet === "demande" && !invalidRange
      ? `chaleur-demande:${from}:${to}:${url.zone ?? ""}`
      : null,
    (signal) => heatmapApi.demand({ from, to, zoneId: url.zone }, { signal }),
  );

  const loading = url.onglet === "diffusions" ? !diffusions.data : !demand.data;
  const error = url.onglet === "diffusions" ? diffusions.error : demand.error;
  const reload = url.onglet === "diffusions" ? diffusions.reload : demand.reload;
  const heatmap = useMemo(
    () =>
      url.onglet === "diffusions" ? diffusionHeatmap(diffusions.data) : demandHeatmap(demand.data),
    [url.onglet, diffusions.data, demand.data],
  );
  const rows: TopRowView[] =
    url.onglet === "diffusions" ? topDiffusions(diffusions.data) : topReservations(demand.data);
  const zoneRows: DemandZone[] = url.onglet === "demande" ? zonesByDemand(demand.data) : [];
  const totalPoints = heatmap?.points.features.length ?? 0;
  const activeFilters =
    (url.du ? 1 : 0) + (url.au ? 1 : 0) + (url.contenu ? 1 : 0) + (url.zone !== null ? 1 : 0);

  const topColumns: DataTableColumn<TopRowView>[] = [
    { key: "supportName", header: "Porteur", primary: true, cell: (r) => r.supportName },
    { key: "zoneName", header: "Zone", mobileMeta: true, cell: (r) => r.zoneName },
    {
      key: "weight",
      header: url.onglet === "diffusions" ? "Diffusions" : "Heures réservées",
      align: "right",
      cell: (r) => (url.onglet === "diffusions" ? formatNumber(r.weight) : hoursLabel(r.weight)),
    },
    {
      key: "detail",
      header: url.onglet === "diffusions" ? "Clics" : "Occupation",
      align: "right",
      cell: (r) => (url.onglet === "diffusions" ? formatNumber(r.detail) : percentLabel(r.detail)),
    },
  ];

  const zoneColumns: DataTableColumn<DemandZone>[] = [
    { key: "zoneName", header: "Zone", primary: true, cell: (z) => z.zoneName },
    {
      key: "occupancy",
      header: "Occupation",
      align: "right",
      cell: (z) => percentLabel(z.occupancy),
    },
    {
      key: "reservedHours",
      header: "Heures réservées",
      align: "right",
      cell: (z) => hoursLabel(z.reservedHours),
    },
    {
      key: "targets",
      header: "Zones ciblées",
      align: "right",
      cell: (z) => formatNumber(z.targets),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Cartes de chaleur"
        description="Où le réseau diffuse et où la demande se concentre. Les densités sont agrégées par Porteur : aucune donnée annonceur n'apparaît ici."
        primaryAction={
          <Button
            variant="secondary"
            iconLeft={<RefreshCw aria-hidden="true" />}
            onClick={() => reload()}
          >
            Actualiser
          </Button>
        }
      />

      <Tabs value={url.onglet} onValueChange={(value) => setUrl({ onglet: value as HeatmapTab })}>
        <TabsList aria-label="Type de carte de chaleur">
          {HEATMAP_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {TAB_LABEL[tab]}
            </TabsTrigger>
          ))}
        </TabsList>

        {HEATMAP_TABS.map((tab) => (
          <TabsContent key={tab} value={tab} className="flex flex-col gap-4">
            <FilterBar
              activeCount={activeFilters}
              onReset={() => setUrl({ du: "", au: "", contenu: null, zone: null })}
              resultCount={
                heatmap ? `${formatNumber(totalPoints)} Porteurs sur la carte` : undefined
              }
            >
              <Field label="Du">
                <Input type="date" value={from} onChange={(e) => setUrl({ du: e.target.value })} />
              </Field>
              <Field label="Au">
                <Input type="date" value={to} onChange={(e) => setUrl({ au: e.target.value })} />
              </Field>
              {tab === "diffusions" ? (
                <Field label="Type de contenu">
                  <Select
                    value={url.contenu ?? ""}
                    onChange={(e) =>
                      setUrl({
                        contenu: (e.target.value || null) as typeof url.contenu,
                      })
                    }
                  >
                    <option value="">Publicités (défaut)</option>
                    {HEATMAP_CONTENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {DIFFUSION_CONTENT_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <Field label="Zone">
                <Select
                  value={url.zone === null ? "" : String(url.zone)}
                  onChange={(e) => setUrl({ zone: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">Toutes les zones</option>
                  {(network.data?.zones ?? []).map((z) => (
                    <option key={z.id} value={String(z.id)}>
                      {z.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </FilterBar>

            {invalidRange ? (
              <Alert tone="warning" title="Période invalide">
                {invalidRange}
              </Alert>
            ) : error ? (
              <ErrorState error={error} onRetry={reload} scope="section" />
            ) : (
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
                <section aria-labelledby={`carte-${tab}`} className="flex min-w-0 flex-col gap-3">
                  <h2 id={`carte-${tab}`} className="sr-only">
                    Carte de chaleur — {TAB_LABEL[tab]}
                  </h2>
                  <NetworkMap
                    mode="explore"
                    zones={network.data?.zones ?? []}
                    supports={network.data?.supports ?? []}
                    heatmap={heatmap}
                    height="clamp(22rem, 62vh, 40rem)"
                    ariaLabel={`Carte de chaleur : ${TAB_LABEL[tab]}`}
                  />
                  <HeatmapLegend label={heatmap?.label ?? "Densité"} className="max-w-sm" />
                </section>

                <aside aria-labelledby={`tableau-${tab}`} className="flex min-w-0 flex-col gap-3">
                  <h2
                    id={`tableau-${tab}`}
                    className="font-display text-[1rem] font-semibold text-ink-strong"
                  >
                    {tab === "diffusions" ? "Top 10 des Porteurs" : "Porteurs les plus réservés"}
                  </h2>
                  {loading ? (
                    <LoadingRegion label="Chargement de la carte de chaleur…">
                      <Skeleton className="h-40 rounded-card" />
                    </LoadingRegion>
                  ) : rows.length === 0 ? (
                    <EmptyState
                      compact
                      icon={<Flame />}
                      title={emptyMessage(tab)}
                      description="Choisissez une autre période ou une autre zone."
                    />
                  ) : (
                    <DataTable
                      caption={`Porteurs les plus actifs (${formatNumber(totalPoints)} points)`}
                      columns={topColumns}
                      rows={rows}
                      getRowKey={(r) => r.supportId}
                    />
                  )}
                  {tab === "demande" && zoneRows.length > 0 ? (
                    <>
                      <h3 className="font-display text-[0.9375rem] font-semibold text-ink-strong">
                        Occupation par zone
                      </h3>
                      <DataTable
                        caption="Occupation des zones sur la période"
                        columns={zoneColumns}
                        rows={zoneRows}
                        getRowKey={(z) => z.zoneId}
                      />
                    </>
                  ) : null}
                </aside>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
