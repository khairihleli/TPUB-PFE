"use client";

import { CalendarRange, ChartColumn, Mail, Plus, ScrollText, Wallet } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useMemo } from "react";

import {
  BarList,
  ChartTable,
  DonutChart,
  PairedBars,
  type ChartDatum,
} from "@/components/espace/charts";
import { Amount, EstimateTag, PanelHeading } from "@/components/espace/espace-ui";
import {
  bucketSummary,
  budgetByCampaign,
  CAMPAIGN_BUCKETS,
  computeAdvertiserKpis,
} from "@/components/espace/kpis";
import { type AdvertiserData, useAdvertiserData } from "@/components/espace/use-advertiser-data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { PartialNotice } from "@/components/ui/partial-notice";
import { LoadingRegion, Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { CONTACT } from "@/content/site";
import type { CampaignResponse, ReservationStatus } from "@/lib/api/types";
import { RESERVATION_STATUS } from "@/lib/campaign-status";
import { formatCount, formatNumber, formatTND, todayISO } from "@/lib/format";
import { routes } from "@/lib/routes";

const RESERVATION_ORDER: readonly ReservationStatus[] = [
  "TEMPORAIRE",
  "CONFIRMEE",
  "ANNULEE",
  "EXPIREE",
];

/** One-line definitions (glossary, UX-PLAN §3.6). */
const BUDGET_DECLARED_DEFINITION =
  "Somme des budgets saisis pour vos campagnes, hors campagnes refusées ou à corriger.";
const ESTIMATED_COST_DEFINITION =
  "10 % du budget de la campagne par créneau actif, fixé à la réservation. Ni un prix ni une facture.";

export function StatisticsView() {
  const data = useAdvertiserData();

  return (
    <>
      <PageHeader
        title="Statistiques"
        description="Indicateurs calculés uniquement à partir de vos campagnes et de vos réservations."
      />
      {data.campaigns ? (
        data.campaigns.length === 0 ? (
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
        ) : (
          <StatisticsContent campaigns={data.campaigns} data={data} />
        )
      ) : data.error ? (
        <ErrorState error={data.error} onRetry={data.reload} />
      ) : (
        <LoadingRegion
          label="Chargement des statistiques…"
          slow={data.slow}
          onRetry={data.reload}
          className="flex flex-col gap-6"
        >
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
            <Skeleton className="h-80 rounded-card" />
            <Skeleton className="h-80 rounded-card" />
          </div>
        </LoadingRegion>
      )}
    </>
  );
}

function KpiTile({
  label,
  value,
  definition,
  aside,
  footer,
}: {
  label: string;
  value: ReactNode;
  definition: string;
  aside?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-card border border-line bg-grad-card p-5">
      <dt className="font-label text-[0.8125rem] font-medium text-muted">{label}</dt>
      {/* The tag sits beside the value so every tile keeps its value on the same line. */}
      <dd className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-display text-[1.75rem] leading-none font-semibold tracking-tight text-ink-strong tabular">
        {value}
        {aside ? (
          <span className="font-sans text-[0.8125rem] leading-normal font-normal tracking-normal">
            {aside}
          </span>
        ) : null}
      </dd>
      <dd className="text-[0.8125rem] leading-snug text-muted">{definition}</dd>
      {footer ? <dd>{footer}</dd> : null}
    </div>
  );
}

function StatisticsContent({
  campaigns,
  data,
}: {
  campaigns: CampaignResponse[];
  data: AdvertiserData;
}) {
  const today = todayISO();
  const reservations = useMemo(() => data.reservations ?? [], [data.reservations]);
  const loadingResa = data.reservationsLoading;
  const kpis = useMemo(
    () => computeAdvertiserKpis(campaigns, reservations, today),
    [campaigns, reservations, today],
  );
  const budgetRows = useMemo(
    () => budgetByCampaign(campaigns, reservations, 8),
    [campaigns, reservations],
  );

  const bucketData: ChartDatum[] = CAMPAIGN_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    value: kpis.byBucket[b.key],
    tone: b.tone,
    href: routes.espace.campaigns({ statut: b.filter }),
    linkLabel: `${b.label} : ${formatCount(kpis.byBucket[b.key], "campagne", "campagnes")}, voir la liste`,
  }));
  const reservationData: ChartDatum[] = RESERVATION_ORDER.map((s) => ({
    key: s,
    label: RESERVATION_STATUS[s].label,
    value: kpis.reservationsByStatus[s],
    tone: RESERVATION_STATUS[s].tone,
    href: routes.espace.reservations({ statut: s }),
    linkLabel: `${RESERVATION_STATUS[s].label} : ${formatCount(kpis.reservationsByStatus[s], "créneau", "créneaux")}, voir les réservations`,
  }));
  const eligibleCount = campaigns.filter(
    (c) => c.status !== "BLOCKED" && c.status !== "REJECTED_BY_AI",
  ).length;
  const partial = data.partial ? <PartialNotice onRetry={data.retryReservations} /> : null;

  return (
    <div className="flex flex-col gap-6" aria-busy={data.refreshing || undefined}>
      <section aria-labelledby="stats-kpis">
        <h2 id="stats-kpis" className="sr-only">
          Indicateurs clés
        </h2>
        <dl className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            label="Campagnes"
            value={formatNumber(kpis.campaignCount)}
            definition={bucketSummary(kpis.byBucket).join(" · ")}
          />
          <KpiTile
            label="Budget déclaré"
            value={<Amount value={kpis.totalBudget} />}
            definition={BUDGET_DECLARED_DEFINITION}
          />
          <KpiTile
            label="Coût estimé des créneaux"
            aside={<EstimateTag />}
            value={
              loadingResa ? (
                <Skeleton className="h-7 w-28" />
              ) : (
                <Amount value={kpis.estimatedCost} />
              )
            }
            definition={ESTIMATED_COST_DEFINITION}
            footer={partial}
          />
          <KpiTile
            label="Créneaux actifs"
            value={
              loadingResa ? (
                <Skeleton className="h-7 w-12" />
              ) : (
                formatNumber(kpis.holdingReservationCount)
              )
            }
            definition={
              loadingResa
                ? "Bloqués ou confirmés"
                : `Bloqués ou confirmés · ${formatCount(kpis.reservedZones, "zone couverte", "zones couvertes")}`
            }
            footer={partial}
          />
        </dl>
        <p className="mt-3 flex items-start gap-2 text-[0.8125rem] text-muted">
          <Wallet aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Suivi de consommation : pas encore disponible. Aucun montant n&apos;est débité en ligne.
        </p>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <Card as="section" aria-labelledby="chart-status">
          <PanelHeading
            id="chart-status"
            title="Campagnes par statut"
            description="Répartition de toutes vos campagnes. Chaque ligne ouvre la liste filtrée."
            className="mb-6"
          />
          <DonutChart
            data={bucketData}
            label="Campagnes par statut"
            centerValue={formatNumber(kpis.campaignCount)}
            centerLabel={kpis.campaignCount > 1 ? "campagnes" : "campagne"}
          />
          <ChartTable
            className="mt-6"
            caption="Campagnes par statut"
            headers={["Statut", "Campagnes"]}
            rows={bucketData.map((d) => [d.label, formatNumber(d.value)])}
          />
        </Card>

        <Card as="section" aria-labelledby="chart-resa">
          <PanelHeading
            id="chart-resa"
            title="Créneaux par statut"
            description={
              loadingResa
                ? "Chargement des créneaux…"
                : formatCount(kpis.reservationCount, "créneau au total", "créneaux au total")
            }
            className="mb-6"
          />
          {partial ? <div className="-mt-3 mb-4">{partial}</div> : null}
          {loadingResa ? (
            <LoadingRegion label="Chargement des créneaux…" className="flex flex-col gap-3">
              <Skeleton className="h-6" />
              <Skeleton className="h-6" />
              <Skeleton className="h-6" />
            </LoadingRegion>
          ) : kpis.reservationCount === 0 ? (
            <EmptyState
              compact
              icon={<CalendarRange />}
              title={data.partial ? "Aucun créneau chargé." : "Aucun créneau réservé."}
              description="Les créneaux se réservent depuis une campagne : choisissez vos Porteurs sur sa période."
              action={
                <Button asChild variant="secondary">
                  <Link href={routes.espace.campaigns()}>Voir mes campagnes</Link>
                </Button>
              }
            />
          ) : (
            <>
              <BarList data={reservationData} label="Créneaux par statut" />
              <ChartTable
                className="mt-6"
                caption="Créneaux par statut"
                headers={["Statut", "Créneaux"]}
                rows={reservationData.map((d) => [d.label, formatNumber(d.value)])}
              />
            </>
          )}
        </Card>
      </div>

      <Card as="section" aria-labelledby="chart-budget">
        <PanelHeading
          id="chart-budget"
          title="Budget déclaré et coût estimé des créneaux, par campagne"
          description={
            eligibleCount > budgetRows.length
              ? `Les ${formatNumber(budgetRows.length)} campagnes au budget le plus élevé, hors campagnes refusées. Montants en dinars (TND).`
              : "Hors campagnes refusées. Montants en dinars (TND)."
          }
          className="mb-6"
        />
        {partial ? <div className="-mt-3 mb-4">{partial}</div> : null}
        {budgetRows.length === 0 ? (
          <EmptyState
            compact
            title="Aucune campagne à afficher."
            description="Vos campagnes refusées ne sont pas comptées dans ce graphique."
          />
        ) : (
          <>
            <PairedBars
              label="Budget déclaré et coût estimé des créneaux par campagne"
              rows={budgetRows.map((r) => ({
                key: String(r.id),
                label: (
                  <Link
                    href={routes.espace.campaign(r.id)}
                    title={r.name}
                    className="hover:text-brand-blue-text hover:underline"
                  >
                    {r.name}
                  </Link>
                ),
                text: r.name,
                a: r.budget,
                b: r.estimatedCost,
              }))}
              seriesA={{
                label: "Budget déclaré",
                fillClass: "fill-cat-2",
                swatchClass: "bg-cat-2",
              }}
              seriesB={{
                label: "Coût estimé des créneaux",
                fillClass: "fill-cat-4",
                swatchClass: "bg-cat-4",
                note: <EstimateTag className="ml-1" />,
              }}
              format={formatTND}
              formatTick={(n) => `${formatNumber(n)} DT`}
            />
            <ChartTable
              className="mt-6"
              caption="Budget déclaré et coût estimé des créneaux par campagne"
              headers={[
                "Campagne",
                "Budget déclaré",
                "Coût estimé des créneaux",
                "Créneaux actifs",
              ]}
              rows={budgetRows.map((r) => [
                r.name,
                formatTND(r.budget),
                formatTND(r.estimatedCost),
                formatNumber(r.reservationCount),
              ])}
            />
          </>
        )}
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <section
          aria-labelledby="stats-estimates"
          className="@container rounded-card border border-dashed border-line-strong bg-overlay-subtle p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="stats-estimates"
              className="font-display text-title font-semibold text-ink-strong"
            >
              Estimations
            </h2>
            <EstimateTag />
          </div>
          <dl className="mt-5 grid grid-cols-1 gap-5 @[18rem]:grid-cols-2">
            <div className="min-w-0">
              <dt className="font-label text-[0.8125rem] font-medium text-muted">Vues estimées</dt>
              <dd className="mt-1 font-display text-[1.5rem] leading-tight font-semibold whitespace-nowrap text-ink-strong tabular">
                {formatNumber(kpis.estimatedViews)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="font-label text-[0.8125rem] font-medium text-muted">
                Coût estimé des créneaux
              </dt>
              <dd className="mt-1 font-display text-[1.5rem] leading-tight font-semibold text-ink-strong">
                {loadingResa ? (
                  <Skeleton className="h-7 w-24" />
                ) : (
                  <Amount value={kpis.estimatedCost} />
                )}
              </dd>
            </div>
          </dl>
          <p className="mt-5 text-[0.8125rem] leading-relaxed text-muted">
            Ces valeurs sont fixées par la plateforme à chaque réservation. Elles ne mesurent ni une
            audience ni une dépense réelle, et ne doivent pas être lues comme telles.
          </p>
        </section>

        <DiffusionLogNote />
      </div>
    </div>
  );
}

/** Honest proof-of-broadcast status (UX-PLAN §6.8, VD-15): nothing claimed as delivered. */
function DiffusionLogNote() {
  return (
    <section
      aria-labelledby="stats-diffusion"
      className="rounded-card border border-line bg-grad-card p-5 sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-line bg-surface-2 text-ink-soft"
        >
          <ScrollText className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h2
            id="stats-diffusion"
            className="font-display text-title leading-snug font-semibold text-ink-strong"
          >
            Journal de diffusion par campagne — mise en service progressive
          </h2>
          <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-ink-soft">
            Les diffusions sont journalisées côté TPUB ; le rapport annonceur n&apos;est pas encore
            ouvert. Aucun indicateur de diffusion n&apos;est affiché ici tant qu&apos;il ne
            l&apos;est pas.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Une question sur la diffusion d&apos;une campagne validée ? Écrivez à votre
            interlocuteur TPUB.
          </p>
          <Button asChild variant="secondary" className="mt-4">
            <a
              href={`mailto:${CONTACT.email}?subject=${encodeURIComponent("Diffusion de ma campagne")}`}
            >
              <Mail aria-hidden="true" />
              Contacter TPUB
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
