"use client";

import { ChartColumn, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { BarList, ChartTable, DailyColumns, dayLabel } from "@/components/espace/charts";
import { ExportMenu } from "@/components/exports/export-menu";
import { PanelHeading } from "@/components/espace/espace-ui";
import { KpiTiles } from "@/components/espace/kpi-tiles";
import { mineKpis } from "@/components/espace/kpis";
import {
  campaignRows,
  EMPTY_TOTALS,
  formatRate,
  parsePeriodPreset,
  PERIOD_PRESETS,
  periodRange,
} from "@/components/espace/statistics-model";
import { useAdvertiserData } from "@/components/espace/use-advertiser-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Field, Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingRegion, Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import type { StatisticsMineResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { formatDateRange, formatNumber, formatTND, todayISO } from "@/lib/format";
import { routes } from "@/lib/routes";
import { param, useUrlState } from "@/lib/url-state";

type Metric = "views" | "clicks" | "interactions";

const METRICS: { key: Metric; label: string }[] = [
  { key: "views", label: "Affichages" },
  { key: "clicks", label: "Clics" },
  { key: "interactions", label: "Interactions" },
];

const URL_SCHEMA = {
  periode: param.string("30"),
  du: param.string(),
  au: param.string(),
};

/** /espace/statistiques — GET /statistics/mine for a period, charts, tables and CSV export. */
export function StatisticsView() {
  const [url, setUrl] = useUrlState(URL_SCHEMA);
  const [today] = useState(() => todayISO());
  const preset = parsePeriodPreset(url.periode);
  const result = periodRange(preset, { from: url.du, to: url.au }, today);
  const fallback = periodRange("30", { from: "", to: "" }, today);
  // An incomplete custom period keeps showing the last 30 days until it becomes valid.
  const effective = result.ok
    ? result.range
    : fallback.ok
      ? fallback.range
      : { from: today, to: today };
  const data = useAdvertiserData(effective);

  return (
    <>
      <PageHeader
        title="Statistiques"
        description="Affichages, clics et interactions mesurés sur les Porteurs, et estimations de vos réservations."
        secondaryActions={
          result.ok ? (
            <ExportMenu
              query={{ type: "mine", from: effective.from, to: effective.to }}
              size="md"
            />
          ) : undefined
        }
      />

      <section aria-label="Période" className="mb-6 flex flex-wrap items-end gap-3">
        <div role="group" aria-label="Période analysée" className="flex flex-wrap gap-1.5">
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={preset === p.value}
              onClick={() => setUrl({ periode: p.value })}
              className={cx(
                "inline-flex min-h-touch items-center rounded-full border px-4 font-label text-[0.8125rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text",
                preset === p.value
                  ? "border-brand-blue-text bg-blue-soft text-ink-strong"
                  : "border-line-strong text-ink-soft hover:border-muted-2",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "perso" ? (
          <>
            <Field label="Du">
              <Input
                type="date"
                value={url.du}
                max={today}
                onChange={(e) => setUrl({ du: e.target.value })}
              />
            </Field>
            <Field label="Au">
              <Input
                type="date"
                value={url.au}
                min={url.du || undefined}
                onChange={(e) => setUrl({ au: e.target.value })}
              />
            </Field>
          </>
        ) : null}
        <p className="text-[0.8125rem] text-muted" aria-live="polite">
          {result.ok ? formatDateRange(effective.from, effective.to, "medium") : result.message}
        </p>
      </section>

      {data.campaigns && data.campaigns.length === 0 ? (
        <EmptyState
          icon={<ChartColumn />}
          title="Pas encore de données."
          description="Créez une campagne pour voir ses indicateurs ici."
          action={
            <Button asChild variant="primary">
              <Link href={routes.espace.wizard(null)}>
                <Plus aria-hidden="true" />
                Créer une campagne
              </Link>
            </Button>
          }
        />
      ) : data.statsError ? (
        <ErrorState error={data.statsError} onRetry={data.reloadStats} />
      ) : !data.stats ? (
        <LoadingRegion label="Chargement des statistiques…" className="flex flex-col gap-6">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <Skeleton className="h-64 rounded-card" />
        </LoadingRegion>
      ) : (
        <StatisticsContent stats={data.stats} refreshing={data.refreshing} />
      )}
    </>
  );
}

function StatisticsContent({
  stats,
  refreshing,
}: {
  stats: StatisticsMineResponse;
  refreshing: boolean;
}) {
  const [metric, setMetric] = useState<Metric>("views");
  const metricLabel = METRICS.find((m) => m.key === metric)?.label ?? "";
  const tiles = mineKpis(stats ?? { totals: EMPTY_TOTALS });
  const campaigns = useMemo(() => campaignRows(stats), [stats]);

  return (
    <div className="flex flex-col gap-6" aria-busy={refreshing || undefined}>
      <section aria-labelledby="stats-kpis">
        <h2 id="stats-kpis" className="sr-only">
          Indicateurs clés
        </h2>
        <KpiTiles tiles={tiles} labelledBy="stats-kpis" />
        <p className="mt-3 text-[0.8125rem] text-muted">
          « Mesuré » : compté à chaque passage sur un Porteur. « Estimation » : calculée à la
          réservation à partir de l&apos;audience du type de Porteur ; ce n&apos;est pas une mesure.
        </p>
      </section>

      <Card as="section" aria-labelledby="stats-daily">
        <PanelHeading
          id="stats-daily"
          title="Historique journalier"
          description="Une mesure à la fois : chaque graphique garde sa propre échelle."
          className="mb-4"
          actions={
            <div role="group" aria-label="Mesure affichée" className="flex flex-wrap gap-1.5">
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={metric === m.key}
                  onClick={() => setMetric(m.key)}
                  className={cx(
                    "inline-flex min-h-9 items-center rounded-full border px-3 text-[0.8125rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text",
                    metric === m.key
                      ? "border-brand-blue-text bg-blue-soft text-ink-strong"
                      : "border-line-strong text-ink-soft hover:border-muted-2",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          }
        />
        <DailyColumns
          data={stats.daily.map((d) => ({ date: d.date, value: d[metric] }))}
          label={`${metricLabel} par jour`}
        />
        <ChartTable
          className="mt-4"
          caption="Historique journalier"
          headers={["Jour", "Affichages", "Clics", "Interactions", "Coût (TND)"]}
          rows={stats.daily.map((d) => [
            dayLabel(d.date),
            formatNumber(d.views),
            formatNumber(d.clicks),
            formatNumber(d.interactions),
            formatTND(d.cost),
          ])}
        />
      </Card>

      <Card as="section" aria-labelledby="stats-campaigns" padding="none">
        <div className="p-5 pb-3 sm:p-6 sm:pb-3">
          <PanelHeading
            id="stats-campaigns"
            title="Par campagne"
            description="Affichages, clics et interactions mesurés ; affichages et coût estimés à la réservation."
          />
        </div>
        {campaigns.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted sm:px-6">Aucune campagne sur cette période.</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <caption className="sr-only">Statistiques par campagne</caption>
              <thead>
                <tr className="border-t border-line bg-surface-2/60 text-left font-label text-[0.75rem] text-muted">
                  <th scope="col" className="px-5 py-2.5 font-semibold">
                    Campagne
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                    Affichages
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                    Clics
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                    Taux de clic
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                    Interactions
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                    Affichages estimés
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                    Coût estimé
                  </th>
                  <th scope="col" className="px-5 py-2.5 text-right font-semibold">
                    Budget consommé
                  </th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.campaignId} className="border-t border-line">
                    <th scope="row" className="px-5 py-3 text-left font-normal">
                      <Link
                        href={routes.espace.campaign(c.campaignId)}
                        className="font-semibold text-ink-strong hover:text-brand-blue-text hover:underline"
                      >
                        {c.name}
                      </Link>
                      <span className="mt-1 block">
                        <StatusPill
                          type="campaign-status"
                          status={c.status}
                          audience="annonceur"
                          size="sm"
                        />
                      </span>
                    </th>
                    <td className="px-3 py-3 text-right tabular">{formatNumber(c.views)}</td>
                    <td className="px-3 py-3 text-right tabular">{formatNumber(c.clicks)}</td>
                    <td className="px-3 py-3 text-right tabular">
                      {formatRate(c.views, c.clicks)}
                    </td>
                    <td className="px-3 py-3 text-right tabular">{formatNumber(c.interactions)}</td>
                    <td className="px-3 py-3 text-right text-muted tabular">
                      {formatNumber(c.estimatedViews)}
                    </td>
                    <td className="px-3 py-3 text-right text-muted tabular">
                      {formatTND(c.estimatedCost)}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap tabular">
                      {formatTND(c.consumedBudget)}
                      <span className="block text-[0.75rem] text-muted">
                        sur {formatTND(c.budget)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <Card as="section" aria-labelledby="stats-supports">
          <PanelHeading
            id="stats-supports"
            title="Par Porteur"
            description="Affichages mesurés."
            className="mb-5"
          />
          {stats.bySupport.length === 0 ? (
            <p className="text-sm text-muted">Aucun affichage sur cette période.</p>
          ) : (
            <>
              <BarList
                label="Affichages par Porteur"
                data={stats.bySupport.slice(0, 10).map((s) => ({
                  key: String(s.supportId),
                  label: `${s.name} · ${s.zoneName}`,
                  value: s.views,
                  tone: "info",
                }))}
              />
              <ChartTable
                className="mt-5"
                caption="Affichages par Porteur"
                headers={["Porteur", "Zone", "Affichages"]}
                rows={stats.bySupport.map((s) => [s.name, s.zoneName, formatNumber(s.views)])}
              />
            </>
          )}
        </Card>
        <Card as="section" aria-labelledby="stats-zones">
          <PanelHeading
            id="stats-zones"
            title="Par zone"
            description="Comparaison des zones, affichages mesurés."
            className="mb-5"
          />
          {stats.byZone.length === 0 ? (
            <p className="text-sm text-muted">Aucun affichage sur cette période.</p>
          ) : (
            <>
              <BarList
                label="Affichages par zone"
                data={stats.byZone.map((z) => ({
                  key: String(z.zoneId),
                  label: z.name,
                  value: z.views,
                  tone: "violet",
                }))}
              />
              <ChartTable
                className="mt-5"
                caption="Affichages par zone"
                headers={["Zone", "Affichages"]}
                rows={stats.byZone.map((z) => [z.name, formatNumber(z.views)])}
              />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
