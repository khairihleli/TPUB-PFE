"use client";

import { ChartColumn } from "lucide-react";
import { useState } from "react";

import { BarList, ChartTable, DailyColumns, dayLabel } from "@/components/espace/charts";
import { CsvExportButton } from "@/components/espace/csv-export-button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SectionCard } from "@/components/ui/section-card";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { statisticsApi } from "@/lib/api/endpoints";
import type { CampaignResponse, StatisticsCampaignResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { formatDateTime, formatNumber, formatTND } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

type Metric = "views" | "clicks" | "interactions";

const METRICS: { key: Metric; label: string }[] = [
  { key: "views", label: "Affichages" },
  { key: "clicks", label: "Clics" },
  { key: "interactions", label: "Interactions" },
];

/** Statuses for which diffusion figures can exist. */
export function hasDiffusionStats(status: CampaignResponse["status"]): boolean {
  return (
    status === "VALIDATED_BY_ADMIN" ||
    status === "ACTIVE" ||
    status === "TERMINATED" ||
    status === "BLOCKED"
  );
}

export function CampaignStatsBody({ stats }: { stats: StatisticsCampaignResponse }) {
  const [metric, setMetric] = useState<Metric>("views");
  const metricLabel = METRICS.find((m) => m.key === metric)?.label ?? "";
  const daily = stats.daily.map((d) => ({ date: d.date, value: d[metric] }));
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Affichages mesurés", value: formatNumber(stats.views) },
          { label: "Clics", value: formatNumber(stats.clicks) },
          { label: "Interactions", value: formatNumber(stats.interactions) },
          { label: "Budget consommé", value: formatTND(stats.consumedBudget) },
        ].map((k) => (
          <div key={k.label} className="rounded-card border border-line bg-surface px-3.5 py-3">
            <dt className="text-[0.8125rem] text-muted">{k.label}</dt>
            <dd className="mt-0.5 font-display text-[1.25rem] font-semibold whitespace-nowrap text-ink-strong tabular">
              {k.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-[0.8125rem] text-muted">
        Estimation à la réservation : {formatNumber(stats.estimatedViews)} affichages ·{" "}
        {formatTND(stats.estimatedCost)}.{" "}
        {stats.lastDiffusionAt
          ? `Dernière diffusion : ${formatDateTime(stats.lastDiffusionAt)}.`
          : "Aucune diffusion enregistrée pour l'instant."}
      </p>

      <div>
        <div role="group" aria-label="Mesure du graphique" className="mb-3 flex flex-wrap gap-1.5">
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
        <DailyColumns data={daily} label={`${metricLabel} par jour`} />
        <ChartTable
          className="mt-3"
          caption={`${metricLabel} par jour`}
          headers={["Jour", "Affichages", "Clics", "Interactions", "Coût (TND)"]}
          rows={stats.daily.map((d) => [
            dayLabel(d.date),
            formatNumber(d.views),
            formatNumber(d.clicks),
            formatNumber(d.interactions),
            formatTND(d.cost),
          ])}
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 font-label text-[0.875rem] font-semibold text-ink-strong">
            Par Porteur
          </h3>
          {stats.bySupport.length > 0 ? (
            <BarList
              label="Affichages par Porteur"
              data={stats.bySupport.map((s) => ({
                key: String(s.supportId),
                label: `${s.name} · ${s.zoneName}`,
                value: s.views,
                tone: "info",
              }))}
            />
          ) : (
            <p className="text-[0.8125rem] text-muted">Aucun affichage par Porteur.</p>
          )}
        </div>
        <div>
          <h3 className="mb-3 font-label text-[0.875rem] font-semibold text-ink-strong">
            Par zone
          </h3>
          {stats.byZone.length > 0 ? (
            <BarList
              label="Affichages par zone"
              data={stats.byZone.map((z) => ({
                key: String(z.zoneId),
                label: z.name,
                value: z.views,
                tone: "violet",
              }))}
            />
          ) : (
            <p className="text-[0.8125rem] text-muted">Aucun affichage par zone.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** « Statistiques » of the campaign detail page (GET /statistics/campaigns/{id}) + CSV export. */
export function CampaignStatsCard({ campaign }: { campaign: CampaignResponse }) {
  const enabled = hasDiffusionStats(campaign.status);
  const stats = useResource(enabled ? `campaign-stats-${campaign.id}` : null, (signal) =>
    statisticsApi.campaign(campaign.id, { signal }),
  );
  return (
    <SectionCard
      id="statistiques"
      icon={ChartColumn}
      title="Statistiques de diffusion"
      description="Mesures issues du journal de diffusion des Porteurs."
      aside={
        enabled && stats.data ? (
          <CsvExportButton query={{ type: "campaign", campaignId: campaign.id }} />
        ) : null
      }
    >
      {!enabled ? (
        <EmptyState
          compact
          icon={<ChartColumn />}
          title="Pas encore de diffusion"
          description="Les affichages, clics et interactions apparaissent dès que la campagne est validée et diffusée."
        />
      ) : stats.error && !stats.data ? (
        <ErrorState
          scope="section"
          error={stats.error}
          onRetry={stats.reload}
          title="Statistiques indisponibles"
        />
      ) : !stats.data ? (
        <LoadingRegion label="Chargement des statistiques…" className="flex flex-col gap-3">
          <Skeleton className="h-16 rounded-card" />
          <Skeleton className="h-40 rounded-card" />
        </LoadingRegion>
      ) : (
        <CampaignStatsBody stats={stats.data} />
      )}
    </SectionCard>
  );
}
