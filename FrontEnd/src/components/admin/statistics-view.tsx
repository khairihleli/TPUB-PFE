"use client";

import { BarChart3, History, ListChecks, MapPinned, RefreshCw, ShieldCheck } from "lucide-react";
import { Suspense } from "react";

import { BarList, ColumnChart, HistoryLineChart } from "@/components/admin/admin-charts";
import { CsvExportButton, InlineFigures, PeriodPicker } from "@/components/admin/admin-controls";
import {
  aiSummaryFigures,
  aiVerdictBreakdown,
  formatRate,
  GROUP_BY_TABS,
  groupByColumn,
  PERIOD_PRESET_VALUES,
  periodRange,
  sectorRows,
  topIssueRows,
  viewsPoints,
} from "@/components/admin/stats-model";
import { useSession } from "@/components/shell/session-provider";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { aiApi, statisticsApi } from "@/lib/api/endpoints";
import type { StatisticsGroupBy, StatisticsViewsRow } from "@/lib/api/types";
import { formatDateRange, formatNumber, formatTND, todayISO } from "@/lib/format";
import { param, useUrlState } from "@/lib/url-state";
import { useResource } from "@/lib/use-resource";

const GROUP_BY_VALUES: readonly StatisticsGroupBy[] = GROUP_BY_TABS.map((t) => t.value);

const URL_SCHEMA = {
  periode: param.enum(PERIOD_PRESET_VALUES, "30"),
  du: param.string(),
  au: param.string(),
  vue: param.enum(GROUP_BY_VALUES, "day"),
};

export function StatisticsView() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <StatisticsContent />
    </Suspense>
  );
}

function StatisticsContent() {
  const { role } = useSession();
  const canSeeAi = role === "ADMINISTRATEUR" || role === "SUPERVISEUR";
  const [url, setUrl] = useUrlState(URL_SCHEMA);
  const today = todayISO();
  const range = periodRange(url.periode, today, { from: url.du, to: url.au });
  const groupBy = url.vue;

  const views = useResource(`admin:stats:views:${groupBy}:${range.from}:${range.to}`, (signal) =>
    statisticsApi.views({ from: range.from, to: range.to, groupBy, signal }),
  );
  const zones = useResource(`admin:stats:zones:${range.from}:${range.to}`, (signal) =>
    statisticsApi.views({ from: range.from, to: range.to, groupBy: "zone", signal }),
  );
  const history = useResource(`admin:stats:history:${range.from}:${range.to}`, (signal) =>
    statisticsApi.history({ from: range.from, to: range.to, signal }),
  );

  const columns: DataTableColumn<StatisticsViewsRow>[] = [
    {
      key: "label",
      header: groupByColumn(groupBy),
      primary: true,
      sortable: true,
      sortValue: (r) => (groupBy === "day" ? r.key : r.label),
      cell: (r) => <span className="font-label font-semibold text-ink-strong">{r.label}</span>,
    },
    {
      key: "views",
      header: "Affichages",
      align: "right",
      sortable: true,
      sortValue: (r) => r.views,
      cell: (r) => <span className="tabular">{formatNumber(r.views)}</span>,
    },
    {
      key: "clicks",
      header: "Clics",
      align: "right",
      sortable: true,
      sortValue: (r) => r.clicks,
      cell: (r) => <span className="tabular">{formatNumber(r.clicks)}</span>,
    },
    {
      key: "interactions",
      header: "Interactions",
      align: "right",
      sortable: true,
      sortValue: (r) => r.interactions,
      cell: (r) => <span className="tabular">{formatNumber(r.interactions)}</span>,
    },
    {
      key: "ctr",
      header: "Taux de clic",
      align: "right",
      cell: (r) => <span className="tabular">{formatRate(r.clicks, r.views)}</span>,
    },
    {
      key: "cost",
      header: "Coût consommé",
      align: "right",
      sortable: true,
      sortValue: (r) => r.cost,
      cell: (r) => <span className="tabular">{formatTND(r.cost)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Statistiques"
        description="Affichages, clics et coûts relevés par les lecteurs d'écran, historique de la plateforme et tableau de bord de l'IA."
        secondaryActions={
          <>
            <Button
              variant="secondary"
              iconLeft={<RefreshCw aria-hidden="true" />}
              loading={views.loading && views.data !== undefined}
              loadingLabel="Actualisation…"
              onClick={() => {
                views.reload();
                zones.reload();
                history.reload();
              }}
            >
              Actualiser
            </Button>
            <CsvExportButton
              size="md"
              label="Exporter le tableau de bord"
              query={{ type: "dashboard", from: range.from, to: range.to }}
            />
          </>
        }
      />

      <div className="mb-8 flex flex-col gap-2">
        <PeriodPicker
          preset={url.periode}
          from={url.periode === "custom" ? url.du || range.from : range.from}
          to={url.periode === "custom" ? url.au || range.to : range.to}
          onChange={(next) =>
            setUrl({
              periode: next.preset,
              du: next.preset === "custom" ? (next.from ?? "") : "",
              au: next.preset === "custom" ? (next.to ?? "") : "",
            })
          }
        />
        <p className="text-[0.8125rem] text-muted">
          Période analysée : {formatDateRange(range.from, range.to)}
        </p>
      </div>

      <div className="flex flex-col gap-10">
        <SectionCard
          icon={BarChart3}
          title="Affichages"
          description="Lignes « publicité » du journal de diffusion : un passage de campagne sur un écran, pas une mesure d'audience."
          aside={
            <CsvExportButton
              label="Exporter ce tableau"
              query={{ type: "views", from: range.from, to: range.to, groupBy }}
            />
          }
        >
          <Tabs
            value={groupBy}
            onValueChange={(v) => {
              const next = GROUP_BY_VALUES.find((g) => g === v);
              if (next) setUrl({ vue: next });
            }}
          >
            <TabsList aria-label="Regrouper les affichages" className="mb-5 w-fit">
              {GROUP_BY_TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {views.data ? (
            <div className="flex flex-col gap-5">
              <InlineFigures
                items={[
                  { label: "Affichages", value: formatNumber(views.data.totals.views) },
                  { label: "Clics", value: formatNumber(views.data.totals.clicks) },
                  { label: "Interactions", value: formatNumber(views.data.totals.interactions) },
                  {
                    label: "Taux de clic",
                    value: formatRate(views.data.totals.clicks, views.data.totals.views),
                  },
                  { label: "Coût consommé", value: formatTND(views.data.totals.cost) },
                ]}
              />
              {groupBy === "day" ? (
                <ColumnChart points={viewsPoints(views.data.rows)} label="Affichages par jour" />
              ) : (
                <BarList
                  points={viewsPoints(views.data.rows.slice(0, 10))}
                  label={`Affichages ${GROUP_BY_TABS.find((t) => t.value === groupBy)?.label.toLowerCase()}`}
                  emptyText="Aucun affichage sur la période."
                />
              )}
              <DataTable
                columns={columns}
                rows={views.data.rows}
                getRowKey={(r) => r.key}
                caption={`Affichages — ${groupByColumn(groupBy).toLowerCase()}`}
                empty={
                  <EmptyState
                    compact
                    icon={<BarChart3 />}
                    title="Aucun affichage sur la période"
                    description="Les lignes apparaissent dès qu'un lecteur diffuse une campagne validée."
                  />
                }
              />
            </div>
          ) : views.error ? (
            <ErrorState error={views.error} onRetry={views.reload} scope="section" />
          ) : (
            <LoadingRegion label="Chargement des affichages…">
              <Skeleton className="h-56 w-full" />
            </LoadingRegion>
          )}
        </SectionCard>

        <SectionCard
          icon={MapPinned}
          title="Comparatif des zones"
          description="Affichages et clics par zone sur la période, du plus au moins diffusé."
        >
          {zones.data ? (
            zones.data.rows.length === 0 ? (
              <p className="text-sm text-muted">Aucun affichage par zone sur la période.</p>
            ) : (
              <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
                <BarList
                  points={viewsPoints(zones.data.rows)}
                  label="Affichages par zone"
                  tone="bg-success"
                />
                <BarList
                  points={viewsPoints(zones.data.rows, "clicks")}
                  label="Clics par zone"
                  tone="bg-brand-orange-text"
                />
              </div>
            )
          ) : zones.error ? (
            <ErrorState error={zones.error} onRetry={zones.reload} scope="section" />
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </SectionCard>

        <SectionCard
          icon={History}
          title="Historique de la plateforme"
          description="Instantanés quotidiens des campagnes (relevés toutes les 15 minutes)."
        >
          {history.data ? (
            <HistoryLineChart rows={history.data} />
          ) : history.error ? (
            <ErrorState error={history.error} onRetry={history.reload} scope="section" />
          ) : (
            <Skeleton className="h-44 w-full" />
          )}
        </SectionCard>

        {canSeeAi ? <AiDashboardSection /> : null}
      </div>
    </>
  );
}

function AiDashboardSection() {
  const ai = useResource("admin:stats:ai-dashboard", (signal) => aiApi.dashboard({ signal }));
  return (
    <SectionCard
      icon={ShieldCheck}
      title="Tableau de bord IA"
      description="Analyses définitives (hors pré-analyses), décisions humaines et écarts avec l'IA."
    >
      {ai.data ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {aiSummaryFigures(ai.data).map((f) => (
              <StatCard key={f.key} label={f.label} value={f.value} hint={f.hint} accent="blue" />
            ))}
          </div>
          <InlineFigures
            items={[
              { label: "Verdicts IA", value: aiVerdictBreakdown(ai.data) },
              { label: "Validations par dérogation", value: formatNumber(ai.data.overrideCount) },
              {
                label: "Désaccords IA / administrateur",
                value: formatNumber(ai.data.disagreementCount),
              },
            ]}
          />
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 flex items-center gap-2 font-label text-[0.9375rem] font-semibold text-ink-strong">
                <BarChart3 aria-hidden="true" className="size-4 text-brand-blue-text" />
                Campagnes par secteur
              </h3>
              <BarList
                points={sectorRows(ai.data)}
                label="Campagnes par secteur"
                emptyText="Aucune analyse."
              />
            </div>
            <div>
              <h3 className="mb-3 flex items-center gap-2 font-label text-[0.9375rem] font-semibold text-ink-strong">
                <ListChecks aria-hidden="true" className="size-4 text-warning" />
                Problèmes les plus fréquents
              </h3>
              <BarList
                points={topIssueRows(ai.data)}
                label="Problèmes les plus fréquents"
                tone="bg-warning"
                emptyText="Aucun problème relevé."
              />
            </div>
          </div>
        </div>
      ) : ai.error ? (
        <ErrorState error={ai.error} onRetry={ai.reload} scope="section" />
      ) : (
        <Skeleton className="h-40 w-full" />
      )}
    </SectionCard>
  );
}
