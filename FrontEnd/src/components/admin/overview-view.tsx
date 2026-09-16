"use client";

import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  CircleSlash,
  Coins,
  Eye,
  ListChecks,
  MapPinned,
  Megaphone,
  MonitorCheck,
  MonitorPlay,
  NotebookPen,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Siren,
  Wallet,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { IdChip, ReadOnlyNotice } from "@/components/admin/admin-ui";
import {
  advertiserLabel,
  filterCampaigns,
  formatWaiting,
  waitingDays,
} from "@/components/admin/moderation-model";
import {
  buildOverviewGroups,
  coherenceWatch,
  emergenciesWatch,
  type OverviewItem,
  porteursWatch,
  summarizeDecisionQueue,
  type WatchItem,
} from "@/components/admin/overview-model";
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
  campaignsApi,
  emergencyApi,
  statisticsApi,
  supportsApi,
  zonesApi,
} from "@/lib/api/endpoints";
import type { CampaignResponse, DashboardResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { formatNumber, formatTND, todayISO } from "@/lib/format";
import { fetchCached, resourceKeys } from "@/lib/resource-cache";
import { routes } from "@/lib/routes";
import { useResource } from "@/lib/use-resource";

const ICONS: Record<OverviewItem["key"], ReactNode> = {
  totalCampaigns: <Megaphone />,
  activeCampaigns: <BadgeCheck />,
  aiPendingCampaigns: <ScanSearch />,
  aiRejectedCampaigns: <CircleSlash />,
  availableSupports: <MonitorCheck />,
  confirmedReservations: <CalendarCheck />,
  totalViews: <NotebookPen />,
  estimatedBudget: <Wallet />,
  consumedBudget: <Coins />,
};

export function OverviewView() {
  const { role, canAct } = useSession();
  const canSeeCampaigns = role === "ADMINISTRATEUR" || role === "SUPERVISEUR";

  const stats = useResource("admin:dashboard", (signal) => statisticsApi.dashboard({ signal }));
  const queue = useResource(
    canSeeCampaigns ? "admin:campaigns" : null,
    (signal) => campaignsApi.all({ signal }),
    { cacheKey: resourceKeys.campaignsAll },
  );

  const summary = queue.data ? summarizeDecisionQueue(queue.data) : null;
  const refreshing =
    (stats.loading && stats.data !== undefined) || (queue.loading && queue.data !== undefined);

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
            <Button asChild variant="secondary">
              <Link href={routes.admin.network({ onglet: "ecrans" })}>
                <MonitorPlay aria-hidden="true" />
                Lecteur de démonstration
              </Link>
            </Button>
          </>
        }
      />

      {!canAct ? <ReadOnlyNotice role={role} className="mb-8" /> : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        {canSeeCampaigns ? (
          <DecisionPanel campaigns={queue.data} error={queue.error} onRetry={queue.reload} />
        ) : (
          <OperatorPanel />
        )}
        <WatchPanel />
      </div>

      <div className="mt-12 flex flex-col gap-12" aria-busy={stats.loading || undefined}>
        {stats.data ? (
          <StatGroups data={stats.data} campaigns={queue.data ?? null} />
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

function StatGroups({
  data,
  campaigns,
}: {
  data: DashboardResponse;
  campaigns: CampaignResponse[] | null;
}) {
  const groups = buildOverviewGroups(data, campaigns);
  return (
    <>
      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`groupe-${g.id}`}>
          <div className="mb-5">
            <h2
              id={`groupe-${g.id}`}
              className="font-display text-title leading-snug font-semibold text-ink-strong"
            >
              {g.title}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{g.description}</p>
          </div>
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
                  className={item.dimmed ? "border-dashed" : undefined}
                  hint={
                    <span className="inline-flex items-center gap-0.5">
                      {item.hint}
                      <InfoTip label={`Que compte « ${item.label} » ?`} content={item.source} />
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
        Les vues et coûts estimés affichés côté annonceur restent indicatifs.
      </p>
    </>
  );
}

function DecisionPanel({
  campaigns,
  error,
  onRetry,
}: {
  campaigns: CampaignResponse[] | undefined;
  error: unknown;
  onRetry: () => void;
}) {
  const queue = campaigns ? filterCampaigns(campaigns, "a-traiter", "") : [];
  const summary = campaigns ? summarizeDecisionQueue(campaigns) : null;
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

          {queue.length > 0 ? (
            <ul className="mt-5 divide-y divide-line border-y border-line">
              {queue.slice(0, 4).map((c) => (
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
                        <span className="text-[0.8125rem] text-muted">
                          {advertiserLabel(c.clientId)}
                        </span>
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
          ) : (
            <p className="mt-5 text-sm leading-relaxed text-muted">
              Aucune campagne n&apos;attend de décision. Les campagnes arrivent ici après leur
              analyse IA.
            </p>
          )}

          <p className="mt-5 flex items-center gap-2 text-[0.8125rem] leading-snug text-muted">
            <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-brand-blue-text" />
            L&apos;IA assiste, un administrateur décide : rien n&apos;est diffusé sans validation.
            {queue.length > 4 ? (
              <Link
                href={routes.admin.moderation({ onglet: "a-traiter" })}
                className="ml-auto whitespace-nowrap text-brand-blue-text hover:underline"
              >
                Voir les {queue.length} campagnes
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
      text: "Zones, Porteurs et état technique déclaré.",
    },
    {
      href: routes.admin.emergencies(),
      icon: <Siren />,
      title: "Messages prioritaires",
      text: "Messages d'intérêt général programmés par zone.",
    },
  ];
  return (
    <SectionCard
      icon={Eye}
      title="Votre périmètre"
      description="La file de modération est réservée aux administrateurs et aux superviseurs. Vous suivez le réseau et les messages prioritaires."
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
  const emergencies = useResource(
    "admin:overview-emergencies",
    (signal) => emergencyApi.all({ signal }),
    { cacheKey: resourceKeys.emergencies },
  );
  const today = todayISO();

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
      item: emergencies.data ? emergenciesWatch(emergencies.data, today) : null,
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
