"use client";

import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CircleSlash,
  Coins,
  Eye,
  FileClock,
  Flag,
  ListChecks,
  MapPinned,
  Megaphone,
  MonitorCheck,
  MonitorOff,
  MonitorPlay,
  MousePointerClick,
  NotebookPen,
  PauseCircle,
  Receipt,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Siren,
  Sparkles,
  UsersRound,
  Wallet,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { BarList, ColumnChart, HistoryLineChart } from "@/components/admin/admin-charts";
import { CsvExportButton, InlineFigures } from "@/components/admin/admin-controls";
import { IdChip, ReadOnlyNotice } from "@/components/admin/admin-ui";
import { emergencyStateOf } from "@/components/admin/emergency-schema";
import {
  advertiserName,
  formatWaiting,
  moderationSortApi,
  waitingDays,
} from "@/components/admin/moderation-model";
import {
  budgetConsumption,
  buildOverviewGroups,
  coherenceWatch,
  decisionQueueFromDashboard,
  emergenciesWatch,
  liveEmergencies,
  type OverviewItem,
  porteursWatch,
  type WatchItem,
} from "@/components/admin/overview-model";
import {
  addDaysISO,
  aiSummaryFigures,
  aiVerdictBreakdown,
  topRows,
  viewsPoints,
} from "@/components/admin/stats-model";
import { useSession } from "@/components/shell/session-provider";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { PartialNotice } from "@/components/ui/partial-notice";
import { SectionCard } from "@/components/ui/section-card";
import { LoadingRegion, Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { StatusPill } from "@/components/ui/status-pill";
import { InfoTip } from "@/components/ui/tooltip";
import {
  aiApi,
  campaignsApi,
  emergencyApi,
  statisticsApi,
  supportsApi,
  zonesApi,
} from "@/lib/api/endpoints";
import type {
  CampaignResponse,
  DashboardResponse,
  EmergencyResponse,
  StatisticsGroupBy,
} from "@/lib/api/types";
import { EMERGENCY_STATE } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { formatDateTime, formatNumber, formatTND, todayISO } from "@/lib/format";
import { fetchCached, resourceKeys } from "@/lib/resource-cache";
import { routes } from "@/lib/routes";
import { useResource } from "@/lib/use-resource";

const ICONS: Record<OverviewItem["key"], ReactNode> = {
  totalCampaigns: <Megaphone />,
  activeCampaigns: <BadgeCheck />,
  validatedCampaigns: <CalendarClock />,
  pendingCampaigns: <PauseCircle />,
  draftCampaigns: <NotebookPen />,
  terminatedCampaigns: <Flag />,
  blockedCampaigns: <CircleSlash />,
  aiPendingCampaigns: <ScanSearch />,
  approvedByAiCampaigns: <Sparkles />,
  reviewRequiredCampaigns: <ShieldCheck />,
  aiRejectedCampaigns: <CircleSlash />,
  aiFlaggedCampaigns: <Flag />,
  availableSupports: <MonitorCheck />,
  totalSupports: <MonitorCheck />,
  outOfServiceSupports: <MonitorOff />,
  activeZones: <MapPinned />,
  totalClients: <UsersRound />,
  pendingClients: <UsersRound />,
  confirmedReservations: <CalendarCheck />,
  temporaryReservations: <CalendarClock />,
  cancelledReservations: <CalendarX />,
  expiredReservations: <CalendarX />,
  totalViews: <Eye />,
  viewsToday: <Eye />,
  totalClicks: <MousePointerClick />,
  totalInteractions: <MousePointerClick />,
  emergencyViews: <Siren />,
  defaultViews: <MonitorPlay />,
  totalDiffusions: <FileClock />,
  activeEmergencies: <Siren />,
  estimatedBudget: <Wallet />,
  consumedBudget: <Coins />,
  estimatedCost: <Receipt />,
  simulatedRevenue: <Receipt />,
};

/** Rolling 30-day window ending today (inclusive). */
function last30(today: string) {
  return { from: addDaysISO(today, -29), to: today };
}

async function loadActivity(signal: AbortSignal, from: string, to: string) {
  const views = (groupBy: StatisticsGroupBy) => statisticsApi.views({ from, to, groupBy, signal });
  const [byDay, byCampaign, bySupport, byZone] = await Promise.all([
    views("day"),
    views("campaign"),
    views("support"),
    views("zone"),
  ]);
  return { byDay, byCampaign, bySupport, byZone };
}

export function OverviewView() {
  const { role, canAct } = useSession();
  const canSeeCampaigns = role === "ADMINISTRATEUR" || role === "SUPERVISEUR";
  const today = todayISO();
  const range = last30(today);

  const stats = useResource("admin:dashboard", (signal) => statisticsApi.dashboard({ signal }));
  const queue = useResource(canSeeCampaigns ? "admin:overview-queue" : null, (signal) =>
    campaignsApi.search({
      status: ["APPROVED_BY_AI", "REVIEW_REQUIRED"],
      sort: moderationSortApi("attente"),
      size: 4,
      signal,
    }),
  );

  const summary = stats.data ? decisionQueueFromDashboard(stats.data) : null;
  const refreshing = stats.loading && stats.data !== undefined;

  return (
    <>
      <PageHeader
        title="Vue d'ensemble"
        description="Indicateurs de toute la plateforme, tous annonceurs confondus. Ils décrivent l'activité enregistrée, pas une audience."
        primaryAction={
          canSeeCampaigns ? (
            <Button asChild variant="primary">
              <Link href={routes.admin.moderation({ onglet: "a-traiter" })}>
                <ShieldCheck aria-hidden="true" />
                {canAct ? "Traiter la file" : "Consulter la file"}
                {summary ? ` (${formatNumber(summary.total)})` : ""}
              </Link>
            </Button>
          ) : undefined
        }
        secondaryActions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                stats.reload();
                if (canSeeCampaigns) queue.reload();
              }}
              loading={refreshing}
              loadingLabel="Actualisation…"
              iconLeft={<RefreshCw aria-hidden="true" />}
            >
              Actualiser
            </Button>
            <CsvExportButton
              size="md"
              label="Exporter en CSV"
              query={{ type: "dashboard", from: range.from, to: range.to }}
            />
            <Button asChild variant="secondary">
              <Link href={routes.admin.statistics()}>
                <BarChart3 aria-hidden="true" />
                Statistiques détaillées
              </Link>
            </Button>
          </>
        }
      />

      {!canAct ? <ReadOnlyNotice role={role} className="mb-8" /> : null}

      <EmergencyStrip />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        {canSeeCampaigns ? (
          <DecisionPanel
            dashboard={stats.data}
            queue={queue.data?.items}
            error={stats.error ?? queue.error}
            onRetry={() => {
              stats.reload();
              queue.reload();
            }}
          />
        ) : (
          <OperatorPanel />
        )}
        <WatchPanel />
      </div>

      <div className="mt-12 flex flex-col gap-12" aria-busy={stats.loading || undefined}>
        <ActivitySection from={range.from} to={range.to} />
        {stats.data ? <BudgetSection data={stats.data} /> : null}
        {canSeeCampaigns ? <AiSummarySection /> : null}
        <HistorySection from={range.from} to={range.to} />
        {stats.data ? (
          <StatGroups data={stats.data} />
        ) : stats.error ? (
          <ErrorState error={stats.error} onRetry={stats.reload} scope="section" />
        ) : (
          <LoadingRegion label="Chargement des indicateurs…" className="flex flex-col gap-4">
            <Skeleton className="h-6 w-48" />
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </LoadingRegion>
        )}
      </div>
    </>
  );
}

function SectionTitle({
  id,
  title,
  description,
  aside,
}: {
  id: string;
  title: string;
  description: string;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={id} className="font-display text-title leading-snug font-semibold text-ink-strong">
          {title}
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
      </div>
      {aside}
    </div>
  );
}

function StatGroups({ data }: { data: DashboardResponse }) {
  const groups = buildOverviewGroups(data);
  return (
    <>
      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`groupe-${g.id}`}>
          <SectionTitle id={`groupe-${g.id}`} title={g.title} description={g.description} />
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {g.items.map((item) => {
              const formatted =
                item.format === "tnd" ? formatTND(item.value) : formatNumber(item.value);
              return (
                <StatCard
                  key={item.key}
                  label={item.label}
                  value={item.dimmed ? <span className="text-muted">{formatted}</span> : formatted}
                  accent={item.dimmed ? "neutral" : item.accent}
                  icon={ICONS[item.key]}
                  className={cx(item.dimmed && "border-dashed")}
                  hint={
                    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      {item.hint}
                      <InfoTip label={`Que compte « ${item.label} » ?`} content={item.source} />
                      {item.href ? (
                        <Link
                          href={item.href}
                          aria-label={`Voir le détail : ${item.label}`}
                          className="text-brand-blue-text hover:underline"
                        >
                          Voir
                        </Link>
                      ) : null}
                    </span>
                  }
                />
              );
            })}
          </div>
        </section>
      ))}
      <p className="border-t border-line pt-5 text-[0.8125rem] leading-relaxed text-muted">
        Valeurs recalculées à chaque chargement de la page. Le journal de diffusion enregistre les
        appels des lecteurs : il atteste une activité technique, pas la présence d&apos;un public.
        Les affichages et coûts estimés restent indicatifs, et les revenus sont simulés.
      </p>
    </>
  );
}

function ActivitySection({ from, to }: { from: string; to: string }) {
  const activity = useResource(`admin:overview-activity:${from}:${to}`, (signal) =>
    loadActivity(signal, from, to),
  );
  return (
    <section aria-labelledby="activite-30j">
      <SectionTitle
        id="activite-30j"
        title="Affichages des 30 derniers jours"
        description="Passages de publicités enregistrés par les lecteurs, par jour, par campagne, par Porteur et par zone."
        aside={
          <Link
            href={routes.admin.statistics()}
            className="text-sm text-brand-blue-text hover:underline"
          >
            Statistiques détaillées
          </Link>
        }
      />
      {activity.data ? (
        <div className="flex flex-col gap-6">
          <SectionCard icon={BarChart3} title="Historique journalier" headingAs="h3">
            <InlineFigures
              className="mb-4"
              items={[
                { label: "Affichages", value: formatNumber(activity.data.byDay.totals.views) },
                { label: "Clics", value: formatNumber(activity.data.byDay.totals.clicks) },
                {
                  label: "Interactions",
                  value: formatNumber(activity.data.byDay.totals.interactions),
                },
                { label: "Coût consommé", value: formatTND(activity.data.byDay.totals.cost) },
              ]}
            />
            <ColumnChart
              points={viewsPoints(activity.data.byDay.rows)}
              label="Affichages par jour"
            />
          </SectionCard>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-3">
            <SectionCard
              icon={Megaphone}
              title="Par campagne"
              headingAs="h3"
              description="5 premières"
            >
              <BarList
                points={viewsPoints(topRows(activity.data.byCampaign.rows))}
                label="Affichages par campagne"
              />
            </SectionCard>
            <SectionCard
              icon={MonitorCheck}
              title="Par Porteur"
              headingAs="h3"
              description="5 premiers"
            >
              <BarList
                points={viewsPoints(topRows(activity.data.bySupport.rows))}
                label="Affichages par Porteur"
                tone="bg-brand-orange-text"
              />
            </SectionCard>
            <SectionCard icon={MapPinned} title="Par zone" headingAs="h3" description="5 premières">
              <BarList
                points={viewsPoints(topRows(activity.data.byZone.rows))}
                label="Affichages par zone"
                tone="bg-success"
              />
            </SectionCard>
          </div>
        </div>
      ) : activity.error ? (
        <ErrorState error={activity.error} onRetry={activity.reload} scope="section" />
      ) : (
        <LoadingRegion label="Chargement de l'activité…">
          <Skeleton className="h-56 w-full" />
        </LoadingRegion>
      )}
    </section>
  );
}

function BudgetSection({ data }: { data: DashboardResponse }) {
  const b = budgetConsumption(data);
  return (
    <section aria-labelledby="budgets-consommation">
      <SectionTitle
        id="budgets-consommation"
        title="Budget estimé et consommé"
        description="Budgets déclarés des campagnes soumises comparés au budget débité à chaque affichage publicitaire."
      />
      <div className="rounded-card border border-line bg-grad-card p-5 sm:p-6">
        <InlineFigures
          items={[
            { label: "Budget estimé", value: formatTND(b.estimated) },
            { label: "Budget consommé", value: formatTND(b.consumed) },
            { label: "Coût estimé des réservations", value: formatTND(data.estimatedCost ?? 0) },
          ]}
        />
        <div
          className="mt-4 h-3 overflow-hidden rounded-full bg-surface-3"
          role="meter"
          aria-label="Part du budget estimé consommée"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={b.ratio === null ? 0 : Math.round(b.ratio * 100)}
          aria-valuetext={b.label}
        >
          <div
            className="h-full rounded-full bg-success"
            style={{ width: `${(b.ratio ?? 0) * 100}%` }}
          />
        </div>
        <p className="mt-2 text-[0.8125rem] text-muted">{b.label}</p>
      </div>
    </section>
  );
}

function AiSummarySection() {
  const ai = useResource("admin:ai-dashboard", (signal) =>
    fetchCached(resourceKeys.aiDashboard, (s) => aiApi.dashboard({ signal: s }), { signal }),
  );
  return (
    <section aria-labelledby="synthese-ia">
      <SectionTitle
        id="synthese-ia"
        title="Tableau de bord IA"
        description="Scores moyens des analyses (hors pré-analyses) et décisions des administrateurs."
        aside={
          <Link
            href={routes.admin.aiRules()}
            className="text-sm text-brand-blue-text hover:underline"
          >
            Règles de modération
          </Link>
        }
      />
      {ai.data ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {aiSummaryFigures(ai.data).map((f) => (
              <StatCard
                key={f.key}
                label={f.label}
                value={f.value}
                hint={f.hint}
                accent={f.key === "risk" || f.key === "rejection" ? "warning" : "blue"}
                icon={
                  f.key === "risk" ? (
                    <ShieldCheck />
                  ) : f.key === "quality" ? (
                    <Sparkles />
                  ) : (
                    <ListChecks />
                  )
                }
              />
            ))}
          </div>
          <InlineFigures
            items={[
              { label: "Verdicts IA", value: aiVerdictBreakdown(ai.data) },
              { label: "Dérogations", value: formatNumber(ai.data.overrideCount) },
              { label: "Désaccords IA / admin", value: formatNumber(ai.data.disagreementCount) },
            ]}
          />
        </div>
      ) : ai.error ? (
        <ErrorState error={ai.error} onRetry={ai.reload} scope="section" />
      ) : (
        <Skeleton className="h-28 w-full" />
      )}
    </section>
  );
}

function HistorySection({ from, to }: { from: string; to: string }) {
  const history = useResource(`admin:overview-history:${from}:${to}`, (signal) =>
    statisticsApi.history({ from, to, signal }),
  );
  return (
    <section aria-labelledby="historique-plateforme">
      <SectionTitle
        id="historique-plateforme"
        title="Historique de la plateforme"
        description="Instantanés quotidiens : campagnes totales, actives et en attente."
      />
      <div className="rounded-card border border-line bg-grad-card p-5 sm:p-6">
        {history.data ? (
          <HistoryLineChart rows={history.data} />
        ) : history.error ? (
          <ErrorState error={history.error} onRetry={history.reload} scope="section" />
        ) : (
          <Skeleton className="h-44 w-full" />
        )}
      </div>
    </section>
  );
}

function DecisionPanel({
  dashboard,
  queue,
  error,
  onRetry,
}: {
  dashboard: DashboardResponse | undefined;
  queue: CampaignResponse[] | undefined;
  error: unknown;
  onRetry: () => void;
}) {
  const summary = dashboard ? decisionQueueFromDashboard(dashboard) : null;
  const now = new Date();

  return (
    <SectionCard icon={ShieldCheck} title="À décider par TPUB" id="a-decider">
      {summary ? (
        <>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <p
              className={cx(
                "font-display text-[3rem] leading-none font-semibold tracking-tight tabular",
                summary.total === 0 ? "text-muted" : "text-ink-strong",
              )}
            >
              {formatNumber(summary.total)}
            </p>
            <p className="pb-1 text-sm text-muted">{summary.breakdown}</p>
          </div>

          {queue && queue.length > 0 ? (
            <ul className="mt-5 divide-y divide-line border-y border-line">
              {queue.map((c) => (
                <li key={c.id}>
                  <Link
                    href={routes.admin.moderation({ examen: c.id })}
                    className="group/row flex items-start gap-3 py-3 transition-colors hover:bg-overlay-subtle sm:items-center"
                  >
                    <IdChip id={c.id} className="mt-0.5 sm:mt-0" />
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                      <span className="flex min-w-0 flex-col sm:flex-1">
                        <span
                          className="truncate font-label text-[0.9375rem] font-semibold text-ink-strong group-hover/row:text-brand-blue-text"
                          title={c.name}
                        >
                          {c.name}
                        </span>
                        <span className="text-[0.8125rem] text-muted">{advertiserName(c)}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <StatusPill type="campaign" campaign={c} audience="staff" size="sm" />
                        <span className="text-[0.8125rem] whitespace-nowrap text-muted">
                          {formatWaiting(waitingDays(c, now))}
                        </span>
                      </span>
                    </span>
                    <ArrowRight
                      aria-hidden="true"
                      className="mt-1 size-4 shrink-0 text-muted sm:mt-0"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : queue ? (
            <p className="mt-5 text-sm leading-relaxed text-muted">
              Aucune campagne n&apos;attend de décision. Les campagnes arrivent ici après leur
              analyse IA.
            </p>
          ) : (
            <Skeleton className="mt-5 h-24 w-full" />
          )}

          <p className="mt-5 flex items-center gap-2 text-[0.8125rem] leading-snug text-muted">
            <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-brand-blue-text" />
            L&apos;IA assiste, un administrateur décide : rien n&apos;est diffusé sans validation.
            {summary.total > 4 ? (
              <Link
                href={routes.admin.moderation({ onglet: "a-traiter" })}
                className="ml-auto whitespace-nowrap text-brand-blue-text hover:underline"
              >
                Voir les {summary.total} campagnes
              </Link>
            ) : null}
          </p>
        </>
      ) : error ? (
        <ErrorState error={error} onRetry={onRetry} scope="section" />
      ) : (
        <LoadingRegion label="Chargement de la file…" className="flex flex-col gap-3">
          <Skeleton className="h-12 w-24" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </LoadingRegion>
      )}
    </SectionCard>
  );
}

function OperatorPanel() {
  const links = [
    {
      href: routes.admin.network(),
      icon: <MapPinned />,
      title: "État des Porteurs",
      text: "Zones, Porteurs, état technique et indisponibilités.",
    },
    {
      href: routes.admin.emergencies(),
      icon: <Siren />,
      title: "Messages prioritaires",
      text: "Messages d'intérêt général programmés par zone.",
    },
    {
      href: routes.admin.journal({ onglet: "diffusions" }),
      icon: <FileClock />,
      title: "Journal des diffusions",
      text: "Ce que chaque Porteur a diffusé, heure par heure.",
    },
    {
      href: routes.admin.statistics(),
      icon: <BarChart3 />,
      title: "Statistiques",
      text: "Affichages par jour, campagne, Porteur et zone.",
    },
  ];
  return (
    <SectionCard
      icon={Eye}
      title="Votre périmètre"
      description="La file de modération est réservée aux administrateurs et aux superviseurs. Vous suivez le réseau, les diffusions et les messages prioritaires."
    >
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="group/l flex h-full flex-col gap-2 rounded-card border border-line bg-overlay-inset p-4 transition-colors hover:border-line-strong hover:bg-overlay-subtle"
            >
              <span
                aria-hidden="true"
                className="inline-flex size-9 items-center justify-center rounded-[10px] border border-blue-line bg-blue-soft text-brand-blue-text [&_svg]:size-4.5"
              >
                {l.icon}
              </span>
              <span className="flex items-center gap-1.5 font-label text-[0.9375rem] font-semibold text-ink-strong">
                {l.title}
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 transition-transform group-hover/l:translate-x-0.5"
                />
              </span>
              <span className="text-[0.8125rem] leading-snug text-muted">{l.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

async function loadNetwork(signal: AbortSignal) {
  const [zones, supports] = await Promise.all([
    fetchCached(resourceKeys.zonesAll, (s) => zonesApi.all({ signal: s }), { signal }),
    fetchCached(resourceKeys.supportsAll, (s) => supportsApi.all({ signal: s }), { signal }),
  ]);
  return { zones, supports };
}

function useEmergencies() {
  return useResource("admin:overview-emergencies", (signal) => emergencyApi.all({ signal }), {
    cacheKey: resourceKeys.emergencies,
  });
}

/** Messages able to reach a screen right now or later (above the fold). */
function EmergencyStrip() {
  const emergencies = useEmergencies();
  const now = new Date();
  const live: EmergencyResponse[] = emergencies.data ? liveEmergencies(emergencies.data, now) : [];
  if (live.length === 0) return null;
  return (
    <section
      aria-labelledby="urgences-actives"
      className="mb-6 rounded-card border border-danger/30 bg-danger/8 px-4 py-3"
    >
      <h2
        id="urgences-actives"
        className="flex items-center gap-2 font-label text-[0.9375rem] font-semibold text-ink-strong"
      >
        <Siren aria-hidden="true" className="size-4.5 text-danger" />
        Messages prioritaires actifs
      </h2>
      <ul className="mt-2 flex flex-col gap-1.5">
        {live.map((m) => {
          const state = emergencyStateOf(m, now);
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <StatusPill type="urgency" level={m.urgencyLevel} size="sm" />
              <StatusPill
                type="custom"
                label={EMERGENCY_STATE[state].label}
                tone={EMERGENCY_STATE[state].tone}
                size="sm"
              />
              <Link
                href={routes.admin.emergencies()}
                className="font-medium text-ink-strong hover:underline"
              >
                {m.title}
              </Link>
              <span className="text-[0.8125rem] text-muted">
                {m.zoneName ?? `Zone n° ${m.zoneId}`} · jusqu&apos;au{" "}
                {formatDateTime(`${m.endDate}T${m.endTime ?? "23:59:59"}`)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const WATCH_ICON: Record<WatchItem["key"], ReactNode> = {
  coherence: <ListChecks />,
  porteurs: <Wrench />,
  urgences: <Siren />,
};

const WATCH_TONE: Record<WatchItem["tone"], string> = {
  danger: "border-danger/30 bg-danger/10 text-danger",
  warning: "border-warning/30 bg-warning/10 text-warning",
  neutral: "border-line bg-surface-2 text-muted",
};

/** « À surveiller »: network coherence, Porteurs out of service, active priority messages. */
function WatchPanel() {
  const network = useResource("admin:overview-network", loadNetwork);
  const emergencies = useEmergencies();
  const now = new Date();

  const rows: {
    key: WatchItem["key"];
    item: WatchItem | null;
    failed: boolean;
    retry: () => void;
  }[] = [
    {
      key: "coherence",
      item: network.data ? coherenceWatch(network.data.zones, network.data.supports) : null,
      failed: Boolean(network.error) && !network.data,
      retry: network.reload,
    },
    {
      key: "porteurs",
      item: network.data ? porteursWatch(network.data.supports) : null,
      failed: Boolean(network.error) && !network.data,
      retry: network.reload,
    },
    {
      key: "urgences",
      item: emergencies.data ? emergenciesWatch(emergencies.data, now) : null,
      failed: Boolean(emergencies.error) && !emergencies.data,
      retry: emergencies.reload,
    },
  ];

  return (
    <SectionCard
      icon={Eye}
      title="À surveiller"
      description="Réseau et messages prioritaires, d'après les données saisies."
    >
      <ul className="flex flex-col gap-2">
        {rows.map(({ key, item, failed, retry }) => (
          <li key={key}>
            {item ? (
              <Link
                href={item.href}
                className="group/w flex items-center gap-3 rounded-card border border-line bg-overlay-inset px-3.5 py-3 transition-colors hover:border-line-strong hover:bg-overlay-subtle"
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    "inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border [&_svg]:size-4.5",
                    WATCH_TONE[item.tone],
                  )}
                >
                  {WATCH_ICON[key]}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={cx(
                      "font-label text-[0.9375rem] font-semibold",
                      item.count > 0 ? "text-ink-strong" : "text-ink-soft",
                    )}
                  >
                    {item.label}
                  </span>
                  <span className="text-[0.8125rem] text-muted">{item.detail}</span>
                </span>
                <span className="sr-only">{item.linkLabel}</span>
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted transition-transform group-hover/w:translate-x-0.5"
                />
              </Link>
            ) : failed ? (
              <PartialNotice message="Données indisponibles" onRetry={retry} />
            ) : (
              <Skeleton className="h-16 w-full" />
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
