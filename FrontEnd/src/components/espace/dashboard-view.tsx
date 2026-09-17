"use client";

import {
  ArrowRight,
  Building2,
  CalendarClock,
  CalendarRange,
  PencilLine,
  RotateCcw,
  ScanSearch,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { ChartTable, DailyColumns, dayLabel } from "@/components/espace/charts";
import { PanelHeading } from "@/components/espace/espace-ui";
import { FirstRunPanel, HowItWorks } from "@/components/espace/first-run-panel";
import { KpiTiles } from "@/components/espace/kpi-tiles";
import {
  bucketSummary,
  buildTodos,
  countBuckets,
  type Deadline,
  firstName,
  inDaysLabel,
  type Milestone,
  mineKpis,
  onboardingMilestones,
  type TodoItem,
  type TodoKind,
  upcomingDeadlines,
} from "@/components/espace/kpis";
import { type AdvertiserData, useAdvertiserData } from "@/components/espace/use-advertiser-data";
import { useSession } from "@/components/shell/session-provider";
import { useDemoteTopbarCta } from "@/components/shell/topbar-cta";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState as SectionError } from "@/components/ui/error-state";
import { LoadingRegion, Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import type { CampaignResponse } from "@/lib/api/types";
import { getCampaignTimeCue } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { frTypo } from "@/lib/fr-typo";
import {
  formatCount,
  formatDate,
  formatDateRange,
  formatDayMonth,
  formatNumber,
  formatTND,
  todayISO,
} from "@/lib/format";
import { EMPTY_TOTALS } from "@/components/espace/statistics-model";
import { routes } from "@/lib/routes";

/** 5 recent campaigns on desktop, 3 on mobile (IA-14). */
const RECENT_LIMIT = 5;
const RECENT_MOBILE_LIMIT = 3;
const TODO_LIMIT = 5;

export function DashboardView() {
  const { user } = useSession();
  const prenom = firstName(user.nom);
  const data = useAdvertiserData();

  return (
    <>
      <PageHeader
        title={prenom ? `Bonjour, ${prenom}` : "Bonjour"}
        description="Vos prochaines actions, vos échéances et vos campagnes, au même endroit."
      />

      {data.campaigns ? (
        data.campaigns.length === 0 ? (
          <FirstRunDashboard />
        ) : (
          <ReturningDashboard campaigns={data.campaigns} data={data} />
        )
      ) : data.error ? (
        <ErrorState error={data.error} onRetry={data.reload} />
      ) : (
        <DashboardSkeleton slow={data.slow} onRetry={data.reload} />
      )}
    </>
  );
}

function DashboardSkeleton({ slow, onRetry }: { slow: boolean; onRetry: () => void }) {
  return (
    <LoadingRegion
      label="Chargement du tableau de bord…"
      slow={slow}
      onRetry={onRetry}
      className="flex flex-col gap-6"
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Skeleton className="h-80 rounded-card" />
        <div className="flex flex-col gap-6">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </LoadingRegion>
  );
}

// ---------------------------------------------------------------------------
// First run (0 campaigns)
// ---------------------------------------------------------------------------
function FirstRunDashboard() {
  const milestones = useMemo(() => onboardingMilestones([]), []);
  const next = milestones.find((m) => !m.done) ?? null;
  // The hero holds the page's primary « Créer ma première campagne »: the topbar CTA steps back.
  useDemoteTopbarCta();

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
      <FirstRunPanel milestones={milestones} />
      <div className="flex flex-col gap-6">
        <NextMilestoneCard milestone={next} />
        <HowItWorks />
        <Link
          href={`${routes.espace.profile()}#societe`}
          className="inline-flex min-h-touch items-center gap-2 self-start rounded-sm text-[0.875rem] font-medium text-brand-blue-text underline-offset-4 hover:underline"
        >
          <Building2 aria-hidden="true" className="size-4" />
          Vérifier les informations de votre société
        </Link>
      </div>
    </div>
  );
}

function NextMilestoneCard({ milestone }: { milestone: Milestone | null }) {
  return (
    <Card as="section" aria-labelledby="todo-title" padding="none">
      <div className="p-5 pb-3 sm:p-6 sm:pb-3">
        <PanelHeading id="todo-title" title="À faire" />
      </div>
      {milestone ? (
        <Link
          href={milestone.href}
          className="group/todo flex items-start gap-3.5 border-t border-line px-5 py-4 transition-colors hover:bg-overlay-subtle sm:px-6"
        >
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-blue-line bg-blue-soft text-brand-blue-text [&_svg]:size-4"
          >
            <PencilLine />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-label text-[0.9375rem] leading-snug font-semibold text-ink-strong group-hover/todo:text-brand-blue-text">
              {milestone.title}
            </span>
            <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted">
              {milestone.description}
            </span>
          </span>
          <ArrowRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted" />
        </Link>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Returning advertiser
// ---------------------------------------------------------------------------
function ReturningDashboard({
  campaigns,
  data,
}: {
  campaigns: CampaignResponse[];
  data: AdvertiserData;
}) {
  const today = todayISO();
  const byBucket = useMemo(() => countBuckets(campaigns, today), [campaigns, today]);
  const todos = useMemo(() => buildTodos(campaigns), [campaigns]);
  const deadlines = useMemo(() => upcomingDeadlines(campaigns, today), [campaigns, today]);

  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start"
      aria-busy={data.refreshing || undefined}
    >
      {/* DOM order = mobile order: KPI → À faire → échéances → campagnes récentes → graphique. */}
      <KpiStrip className="lg:col-span-2 lg:row-start-1" data={data} />

      <div className="flex flex-col gap-6 lg:col-start-2 lg:row-start-2">
        {todos.length > 0 ? <TodoList todos={todos} /> : null}
        <DeadlinesCard deadlines={deadlines} />
      </div>

      <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-2">
        <RecentCampaigns
          campaigns={campaigns.slice(0, RECENT_LIMIT)}
          total={campaigns.length}
          summary={bucketSummary(byBucket)}
        />
        <DailyViewsCard data={data} />
      </div>
    </div>
  );
}

function KpiStrip({ data, className }: { data: AdvertiserData; className?: string }) {
  const tiles = mineKpis(data.stats ?? { totals: EMPTY_TOTALS });
  return (
    <section aria-labelledby="kpi-title" className={className}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="kpi-title" className="font-display text-[1.125rem] font-semibold text-ink-strong">
          Vos 30 derniers jours
        </h2>
        <Link
          href={routes.espace.statistics()}
          className="inline-flex min-h-touch items-center gap-1.5 rounded-sm font-label text-[0.8125rem] font-semibold text-brand-blue-text hover:underline"
        >
          Toutes les statistiques
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
      {data.statsError ? (
        <SectionError
          scope="section"
          error={data.statsError}
          onRetry={data.reloadStats}
          title="Indicateurs indisponibles"
        />
      ) : (
        <KpiTiles tiles={tiles} loading={data.statsLoading} labelledBy="kpi-title" />
      )}
    </section>
  );
}

function DailyViewsCard({ data }: { data: AdvertiserData }) {
  const daily = data.stats?.daily ?? [];
  return (
    <Card as="section" aria-labelledby="daily-title">
      <PanelHeading
        id="daily-title"
        title="Affichages par jour"
        description="Passages mesurés de vos publicités sur les Porteurs, 30 derniers jours."
        className="mb-5"
      />
      {data.statsLoading ? (
        <LoadingRegion label="Chargement du graphique…">
          <Skeleton className="h-44 rounded-card" />
        </LoadingRegion>
      ) : data.stats ? (
        <>
          <DailyColumns
            data={daily.map((d) => ({ date: d.date, value: d.views }))}
            label="Affichages par jour"
          />
          <ChartTable
            className="mt-4"
            caption="Affichages, clics et interactions par jour"
            headers={["Jour", "Affichages", "Clics", "Interactions"]}
            rows={daily.map((d) => [
              dayLabel(d.date),
              formatNumber(d.views),
              formatNumber(d.clicks),
              formatNumber(d.interactions),
            ])}
          />
        </>
      ) : (
        <p className="text-sm text-muted">Graphique indisponible pour le moment.</p>
      )}
    </Card>
  );
}

function RecentCampaigns({
  campaigns,
  total,
  summary,
  className,
}: {
  campaigns: CampaignResponse[];
  total: number;
  summary: string[];
  className?: string;
}) {
  const today = todayISO();
  return (
    <Card padding="none" as="section" aria-labelledby="recent-title" className={className}>
      <div className="p-5 pb-3 sm:p-6 sm:pb-3">
        <PanelHeading
          id="recent-title"
          title="Campagnes récentes"
          description={[formatCount(total, "campagne", "campagnes"), ...summary].join(" · ")}
          actions={
            <Link
              href={routes.espace.campaigns()}
              className="inline-flex min-h-touch items-center gap-1.5 rounded-sm font-label text-[0.8125rem] font-semibold text-brand-blue-text hover:underline"
            >
              Toutes les campagnes
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          }
        />
      </div>
      <ul className="flex flex-col pb-2">
        {campaigns.map((c, index) => {
          const held = c.reservationsCount;
          const cue = getCampaignTimeCue(c, today);
          return (
            <li
              key={c.id}
              className={cx(
                "border-t border-line",
                index >= RECENT_MOBILE_LIMIT && "max-sm:hidden",
              )}
            >
              <div className="relative flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-overlay-subtle sm:flex-row sm:items-center sm:gap-5 sm:px-6">
                <div className="min-w-0 flex-1">
                  <Link
                    href={routes.espace.campaign(c.id)}
                    title={c.name}
                    className="block truncate font-label text-[0.9375rem] font-semibold text-ink-strong after:absolute after:inset-0 after:content-[''] hover:text-brand-blue-text"
                  >
                    {c.name}
                  </Link>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.8125rem] text-muted">
                    <span className="whitespace-nowrap">
                      {c.startDate || c.endDate
                        ? formatDateRange(c.startDate, c.endDate, "medium")
                        : "Période à définir"}
                    </span>
                    <span className="whitespace-nowrap tabular">Budget {formatTND(c.budget)}</span>
                    {held !== undefined ? (
                      <span className="whitespace-nowrap">
                        {held > 0
                          ? formatCount(held, "Porteur réservé", "Porteurs réservés")
                          : "Aucun Porteur réservé"}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="relative flex flex-col items-start gap-1 sm:items-end">
                  <StatusPill type="campaign" campaign={c} audience="annonceur" today={today} />
                  {cue ? (
                    <span
                      className={cx(
                        "text-[0.8125rem]",
                        cue.tone === "warning" ? "text-warning" : "text-muted",
                      )}
                    >
                      {cue.label}
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

const TODO_META: Record<
  TodoKind,
  { icon: typeof Send; tone: string; title: (name: string) => string; description: string }
> = {
  submit: {
    icon: Send,
    tone: "border-blue-line bg-blue-soft text-brand-blue-text",
    title: (n) => `Soumettre « ${n} »`,
    description:
      "Vos Porteurs sont réservés : vérifiez puis soumettez la campagne (analyse IA immédiate).",
  },
  reserve: {
    icon: CalendarRange,
    tone: "border-line-strong bg-overlay-hover text-ink-soft",
    title: (n) => `Choisir la zone et les Porteurs de « ${n} »`,
    description: "Au moins un Porteur réservé est nécessaire avant la soumission.",
  },
  finalize: {
    icon: PencilLine,
    tone: "border-line-strong bg-overlay-hover text-ink-soft",
    title: (n) => `Finaliser « ${n} »`,
    description: "Brouillon à compléter : ouvrez la campagne pour voir l'étape suivante.",
  },
  correct: {
    icon: RotateCcw,
    tone: "border-danger/30 bg-danger/10 text-danger",
    title: (n) => `Corriger « ${n} »`,
    description:
      "Refusée par l'analyse IA ou par TPUB : consultez le motif, corrigez puis soumettez à nouveau.",
  },
  analysis: {
    icon: ScanSearch,
    tone: "border-warning/30 bg-warning/10 text-warning",
    title: (n) => `Analyse IA en cours pour « ${n} »`,
    description: "Ouvrez la campagne pour suivre l'analyse de son contenu.",
  },
};

function TodoRowContent({ todo }: { todo: TodoItem }) {
  const meta = TODO_META[todo.kind];
  const Icon = meta.icon;
  return (
    <>
      <span
        aria-hidden="true"
        className={cx(
          "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] border [&_svg]:size-4",
          meta.tone,
        )}
      >
        <Icon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-label text-[0.875rem] leading-snug font-semibold break-words text-ink-strong group-hover/todo:text-brand-blue-text">
          {frTypo(meta.title(todo.campaignName))}
        </span>
        <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted">
          {frTypo(meta.description)}
        </span>
      </span>
    </>
  );
}

function TodoList({ todos }: { todos: TodoItem[] }) {
  const shown = todos.slice(0, TODO_LIMIT);
  const rowClass =
    "group/todo flex w-full items-start gap-3.5 px-5 py-3.5 text-left transition-colors hover:bg-overlay-subtle sm:px-6";
  return (
    <Card as="section" aria-labelledby="todo-title" padding="none">
      <div className="flex items-center justify-between gap-3 p-5 pb-3 sm:p-6 sm:pb-3">
        <PanelHeading id="todo-title" title="À faire" />
        <span className="rounded-full border border-line-strong px-2 py-0.5 font-label text-[0.75rem] font-semibold text-ink-soft tabular">
          {todos.length}
        </span>
      </div>
      <ul className="flex flex-col pb-2">
        {shown.map((t) => (
          <li key={t.key} className="border-t border-line">
            <Link href={t.href} className={rowClass}>
              <TodoRowContent todo={t} />
            </Link>
          </li>
        ))}
      </ul>
      {todos.length > TODO_LIMIT ? (
        <p className="border-t border-line px-5 py-3 text-[0.8125rem] text-muted sm:px-6">
          Et {formatNumber(todos.length - TODO_LIMIT)} autre(s) dans{" "}
          <Link
            href={routes.espace.campaigns({ statut: "a-finaliser" })}
            className="text-brand-blue-text hover:underline"
          >
            vos campagnes à finaliser
          </Link>
          .
        </p>
      ) : null}
    </Card>
  );
}

function DeadlinesCard({ deadlines }: { deadlines: Deadline[] }) {
  return (
    <Card as="section" aria-labelledby="deadlines-title" padding="none">
      <div className="p-5 pb-3 sm:p-6 sm:pb-3">
        <PanelHeading
          id="deadlines-title"
          title="Prochaines échéances"
          description="Dates de vos campagnes dans les 7 prochains jours (14 pour les brouillons)."
        />
      </div>
      {deadlines.length === 0 ? (
        <p className="flex items-start gap-3 border-t border-line px-5 py-4 text-sm text-muted sm:px-6">
          <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Aucune échéance proche.
        </p>
      ) : (
        <ul className="flex flex-col pb-2">
          {deadlines.map((d) => (
            <li key={d.key} className="border-t border-line">
              <Link
                href={routes.espace.campaign(d.campaignId)}
                className="group/deadline flex items-start gap-3.5 px-5 py-3.5 transition-colors hover:bg-overlay-subtle sm:px-6"
              >
                <span className="flex w-[5.5rem] shrink-0 flex-col items-start">
                  <span className="font-label text-[0.8125rem] font-semibold whitespace-nowrap text-ink-strong">
                    <time dateTime={d.date} title={formatDate(d.date, "long")}>
                      {formatDayMonth(d.date)}
                    </time>
                  </span>
                  <span className="text-[0.75rem] whitespace-nowrap text-muted">
                    {inDaysLabel(d.inDays)}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-label text-[0.875rem] font-semibold text-ink-strong group-hover/deadline:text-brand-blue-text">
                    {d.campaignName}
                  </span>
                  <span className="mt-0.5 block text-[0.8125rem] text-muted">{d.label}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
