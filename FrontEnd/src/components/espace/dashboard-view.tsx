"use client";

import {
  ArrowRight,
  Building2,
  CalendarClock,
  CalendarRange,
  Copy,
  PencilLine,
  ScanSearch,
  Send,
  ShieldX,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { DuplicateCampaignDialog } from "@/components/campaign/duplicate-campaign-dialog";
import { Amount, EstimateTag, PanelHeading } from "@/components/espace/espace-ui";
import { FirstRunPanel, HowItWorks } from "@/components/espace/first-run-panel";
import {
  bucketSummary,
  buildTodos,
  computeAdvertiserKpis,
  type Deadline,
  firstName,
  inDaysLabel,
  isHoldingReservation,
  type Milestone,
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
import { PartialNotice } from "@/components/ui/partial-notice";
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
  const milestones = useMemo(() => onboardingMilestones([], []), []);
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
  const reservations = useMemo(() => data.reservations ?? [], [data.reservations]);
  const kpis = useMemo(
    () => computeAdvertiserKpis(campaigns, reservations, today),
    [campaigns, reservations, today],
  );
  const knownIds = useMemo(
    () => new Set(data.reservationsByCampaign?.keys() ?? []),
    [data.reservationsByCampaign],
  );
  const todos = useMemo(
    () => buildTodos(campaigns, reservations, { knownCampaignIds: knownIds }),
    [campaigns, reservations, knownIds],
  );
  const deadlines = useMemo(() => upcomingDeadlines(campaigns, today), [campaigns, today]);
  const hasDrafts = campaigns.some((c) => c.status === "BROUILLON");
  const todosPending = data.reservationsLoading && hasDrafts;
  const [duplicateId, setDuplicateId] = useState<number | null>(null);
  const duplicateTarget = campaigns.find((c) => c.id === duplicateId) ?? null;

  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start"
      aria-busy={data.refreshing || undefined}
    >
      {/* DOM order = mobile order: À faire → échéances → campagnes récentes → KPI (IA-14). */}
      <div className="flex flex-col gap-6 lg:col-start-2 lg:row-start-2">
        {todos.length > 0 || todosPending ? (
          <TodoList
            todos={todos}
            pending={todosPending}
            partial={data.partial}
            onRetry={data.retryReservations}
            onDuplicate={setDuplicateId}
          />
        ) : null}
        <DeadlinesCard deadlines={deadlines} />
      </div>

      <RecentCampaigns
        className="lg:col-start-1 lg:row-span-2 lg:row-start-2"
        campaigns={campaigns.slice(0, RECENT_LIMIT)}
        total={campaigns.length}
        summary={bucketSummary(kpis.byBucket)}
        data={data}
      />

      <KpiStrip className="lg:col-span-2 lg:row-start-1" kpis={kpis} data={data} />

      <EstimatesCard className="lg:col-start-2 lg:row-start-3" kpis={kpis} data={data} />

      {duplicateTarget ? (
        <DuplicateCampaignDialog
          campaign={duplicateTarget}
          open
          onOpenChange={(open) => {
            if (!open) setDuplicateId(null);
          }}
        />
      ) : null}
    </div>
  );
}

function KpiStrip({
  kpis,
  data,
  className,
}: {
  kpis: ReturnType<typeof computeAdvertiserKpis>;
  data: AdvertiserData;
  className?: string;
}) {
  const tile = "flex min-w-0 flex-col justify-center gap-1 px-4 py-3 sm:px-5";
  return (
    <section aria-labelledby="kpi-title" className={className}>
      <h2 id="kpi-title" className="sr-only">
        Indicateurs de vos campagnes
      </h2>
      {/* Scrolls horizontally below ~480 px: a focusable region so keyboard users can scroll it. */}
      <div
        role="group"
        // Scrollable region must be keyboard-reachable (WCAG 2.1.1, axe scrollable-region-focusable).
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        aria-label="Indicateurs, défilement horizontal"
        className="overflow-x-auto rounded-card border border-line bg-grad-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text"
      >
        <dl className="grid auto-cols-[minmax(9.5rem,1fr)] grid-flow-col [&>div+div]:border-l [&>div+div]:border-line">
          <div className={tile}>
            <dt className="font-label text-[0.8125rem] font-medium text-muted">Campagnes</dt>
            <dd className="font-display text-[1.375rem] leading-none font-semibold text-ink-strong tabular">
              {formatNumber(kpis.campaignCount)}
            </dd>
          </div>
          <div className={tile}>
            <dt className="font-label text-[0.8125rem] font-medium text-muted">Budget déclaré</dt>
            <dd className="font-display text-[1.375rem] leading-none font-semibold text-ink-strong">
              <Amount value={kpis.totalBudget} />
            </dd>
          </div>
          <div className={tile}>
            <dt className="font-label text-[0.8125rem] font-medium text-muted">Créneaux actifs</dt>
            <dd className="font-display text-[1.375rem] leading-none font-semibold text-ink-strong tabular">
              {data.reservationsLoading ? (
                <Skeleton className="h-[1.375rem] w-10" />
              ) : (
                formatNumber(kpis.holdingReservationCount)
              )}
            </dd>
            {data.partial ? (
              <dd>
                <PartialNotice onRetry={data.retryReservations} />
              </dd>
            ) : null}
          </div>
        </dl>
      </div>
    </section>
  );
}

function RecentCampaigns({
  campaigns,
  total,
  summary,
  data,
  className,
}: {
  campaigns: CampaignResponse[];
  total: number;
  summary: string[];
  data: AdvertiserData;
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
          const list = data.reservationsByCampaign?.get(c.id);
          const failed =
            data.failedCampaignIds.includes(c.id) || (!data.reservationsLoading && !list);
          const holding = list ? list.filter(isHoldingReservation).length : 0;
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
                    <span className="whitespace-nowrap tabular">
                      Budget déclaré {formatTND(c.budget)}
                    </span>
                    <span className="whitespace-nowrap">
                      {list
                        ? holding > 0
                          ? formatCount(holding, "créneau actif", "créneaux actifs")
                          : "Aucun créneau actif"
                        : failed
                          ? "Créneaux indisponibles"
                          : "Créneaux…"}
                    </span>
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
    description: "Vos créneaux sont bloqués : vérifiez puis envoyez la campagne à la modération.",
  },
  reserve: {
    icon: CalendarRange,
    tone: "border-line-strong bg-overlay-hover text-ink-soft",
    title: (n) => `Réserver des créneaux pour « ${n} »`,
    description: "Au moins un Porteur est nécessaire avant la soumission.",
  },
  finalize: {
    icon: PencilLine,
    tone: "border-line-strong bg-overlay-hover text-ink-soft",
    title: (n) => `Finaliser « ${n} »`,
    description: "Brouillon à compléter : ouvrez la campagne pour voir l'étape suivante.",
  },
  duplicate: {
    icon: Copy,
    tone: "border-danger/30 bg-danger/10 text-danger",
    title: (n) => `Dupliquer et corriger « ${n} »`,
    description: "L'analyse IA demande des corrections : repartez d'une copie de la campagne.",
  },
  analysis: {
    icon: ScanSearch,
    tone: "border-warning/30 bg-warning/10 text-warning",
    title: (n) => `Analyse IA en cours pour « ${n} »`,
    description: "Ouvrez la campagne pour suivre l'analyse de son contenu.",
  },
  blocked: {
    icon: ShieldX,
    tone: "border-line-strong bg-overlay-hover text-muted",
    title: (n) => `« ${n} » n'a pas été validée`,
    description: "Consultez le détail de la campagne ou contactez votre interlocuteur TPUB.",
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

function TodoList({
  todos,
  pending,
  partial,
  onRetry,
  onDuplicate,
}: {
  todos: TodoItem[];
  pending: boolean;
  partial: boolean;
  onRetry: () => void;
  onDuplicate: (campaignId: number) => void;
}) {
  const shown = todos.slice(0, TODO_LIMIT);
  const rowClass =
    "group/todo flex w-full items-start gap-3.5 px-5 py-3.5 text-left transition-colors hover:bg-overlay-subtle sm:px-6";
  return (
    <Card as="section" aria-labelledby="todo-title" padding="none">
      <div className="flex items-center justify-between gap-3 p-5 pb-3 sm:p-6 sm:pb-3">
        <PanelHeading id="todo-title" title="À faire" />
        {!pending && todos.length > 0 ? (
          <span className="rounded-full border border-line-strong px-2 py-0.5 font-label text-[0.75rem] font-semibold text-ink-soft tabular">
            {todos.length}
          </span>
        ) : null}
      </div>
      {pending ? (
        <LoadingRegion
          label="Chargement des actions…"
          className="flex flex-col gap-3 px-5 pb-5 sm:px-6"
        >
          <Skeleton className="h-12 rounded-control" />
          <Skeleton className="h-12 rounded-control" />
        </LoadingRegion>
      ) : (
        <>
          {partial ? <PartialNotice className="px-5 pb-3 sm:px-6" onRetry={onRetry} /> : null}
          <ul className="flex flex-col pb-2">
            {shown.map((t) => (
              <li key={t.key} className="border-t border-line">
                {t.kind === "duplicate" ? (
                  <button
                    type="button"
                    className={rowClass}
                    onClick={() => onDuplicate(t.campaignId)}
                  >
                    <TodoRowContent todo={t} />
                  </button>
                ) : (
                  <Link href={t.href} className={rowClass}>
                    <TodoRowContent todo={t} />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {!pending && todos.length > TODO_LIMIT ? (
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

function EstimatesCard({
  kpis,
  data,
  className,
}: {
  kpis: ReturnType<typeof computeAdvertiserKpis>;
  data: AdvertiserData;
  className?: string;
}) {
  return (
    <section
      aria-labelledby="estimates-title"
      className={cx(
        "@container rounded-card border border-dashed border-line-strong bg-overlay-subtle p-5 sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="estimates-title" className="font-display text-title font-semibold text-ink-strong">
          Estimations
        </h2>
        <EstimateTag />
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-4 @[18rem]:grid-cols-2">
        <div className="min-w-0">
          <dt className="font-label text-[0.8125rem] font-medium text-muted">Vues estimées</dt>
          <dd className="mt-1 font-display text-[1.375rem] leading-tight font-semibold whitespace-nowrap text-ink-strong tabular">
            {formatNumber(kpis.estimatedViews)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="font-label text-[0.8125rem] font-medium text-muted">
            Coût estimé des créneaux
          </dt>
          <dd className="mt-1 font-display text-[1.375rem] leading-tight font-semibold text-ink-strong">
            {data.reservationsLoading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <Amount value={kpis.estimatedCost} />
            )}
          </dd>
          {data.partial ? (
            <dd className="mt-1">
              <PartialNotice onRetry={data.retryReservations} />
            </dd>
          ) : null}
        </div>
      </dl>
      <p className="mt-4 text-[0.8125rem] leading-relaxed text-muted">
        Valeurs provisoires calculées par la plateforme : elles ne mesurent ni une audience ni une
        dépense. Paiement en ligne : bientôt disponible.
      </p>
    </section>
  );
}
