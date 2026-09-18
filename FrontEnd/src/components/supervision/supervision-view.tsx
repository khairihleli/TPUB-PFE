"use client";

import { Activity, BellRing, MonitorSmartphone, Pause, Play, RefreshCw, Siren } from "lucide-react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AdminSectionHeading } from "@/components/admin/admin-ui";
import {
  ALERT_TYPE_LABEL,
  CONTENT_TYPE_LABEL,
  emptySnapshot,
  filterSupports,
  PRESENCE_FILTERS,
  PRESENCE_LABEL,
  PRESENCE_TONE,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  applyAlert,
  applyDiffusion,
  applyEmergency,
  applyPresence,
  pushFeed,
  recountStats,
  sinceLabel,
  type PresenceFilter,
} from "@/components/supervision/supervision-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Field, Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/toast";
import { supervisionApi } from "@/lib/api/endpoints-supervision";
import { presentError } from "@/lib/api/errors";
import type {
  DiffusionLiveEvent,
  EmergencyLiveEvent,
  PresenceEvent,
  SupervisionAlert,
  SupervisionSnapshot,
  SupervisionStats,
  SupervisionSupportRow,
} from "@/lib/api/types-supervision";
import { cx } from "@/lib/cx";
import { formatDateTime, formatNumber } from "@/lib/format";
import { FALLBACK_MESSAGE, useEventStream } from "@/lib/realtime/use-event-stream";
import { useResource } from "@/lib/use-resource";

const SupervisionMap = dynamic(
  () => import("@/components/supervision/supervision-map").then((m) => m.SupervisionMap),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[24rem] w-full rounded-card sm:h-[28rem]" />,
  },
);

const CONNECTION_LABEL = {
  connecting: "Temps réel · reconnexion",
  open: "Temps réel · connecté",
  fallback: "Temps réel · actualisation périodique",
} as const;

/** Live supervision (docs/round2-contract.md §5.8): map, feed, alerts, emergencies and Porteur table. */
export function SupervisionView() {
  const { toast } = useToast();
  const params = useSearchParams();
  const focusParam = Number(params?.get("porteur") ?? "");
  const [snapshot, setSnapshot] = useState<SupervisionSnapshot>(() => emptySnapshot());
  const [paused, setPaused] = useState(false);
  const [presence, setPresence] = useState<PresenceFilter>("tous");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(
    Number.isFinite(focusParam) && focusParam > 0 ? focusParam : null,
  );
  const [pulsingId, setPulsingId] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const { data, error, loading, reload } = useResource("admin:supervision:snapshot", (signal) =>
    supervisionApi.snapshot({ signal }),
  );

  useEffect(() => {
    if (data) setSnapshot(data);
  }, [data]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    const next = await supervisionApi.snapshot();
    setSnapshot(next);
  }, []);

  const handlers = useMemo(
    () => ({
      snapshot: (payload: unknown) => setSnapshot(payload as SupervisionSnapshot),
      presence: (payload: unknown) =>
        setSnapshot((prev) => {
          const supports = applyPresence(prev.supports, payload as PresenceEvent);
          return {
            ...prev,
            supports,
            stats: recountStats(prev.stats, supports, prev.alerts, prev.emergencies),
          };
        }),
      diffusion: (payload: unknown) => {
        const event = payload as DiffusionLiveEvent;
        setPulsingId(event.supportId);
        setSnapshot((prev) => ({
          ...prev,
          supports: applyDiffusion(prev.supports, event),
          recentDiffusions: pausedRef.current
            ? prev.recentDiffusions
            : pushFeed(prev.recentDiffusions, event),
        }));
      },
      alert: (payload: unknown) =>
        setSnapshot((prev) => {
          const alerts = applyAlert(prev.alerts, payload as SupervisionAlert);
          return {
            ...prev,
            alerts,
            stats: recountStats(prev.stats, prev.supports, alerts, prev.emergencies),
          };
        }),
      emergency: (payload: unknown) =>
        setSnapshot((prev) => {
          const emergencies = applyEmergency(prev.emergencies, payload as EmergencyLiveEvent);
          return {
            ...prev,
            emergencies,
            stats: recountStats(prev.stats, prev.supports, prev.alerts, emergencies),
          };
        }),
      stats: (payload: unknown) =>
        setSnapshot((prev) => ({ ...prev, stats: payload as SupervisionStats })),
    }),
    [],
  );

  const status = useEventStream("/api/realtime/supervision", handlers, { fallback: refresh });

  const rows = useMemo(
    () => filterSupports(snapshot.supports, presence, query),
    [snapshot.supports, presence, query],
  );

  const acknowledge = async (alert: SupervisionAlert) => {
    try {
      const updated = await supervisionApi.acknowledge(alert.id);
      setSnapshot((prev) => ({
        ...prev,
        alerts: prev.alerts.map((a) => (a.id === updated.id ? updated : a)),
      }));
      toast({ title: "Alerte prise en compte", variant: "success" });
    } catch (e) {
      toast({ title: "Action impossible", description: presentError(e).message, variant: "danger" });
    }
  };

  const columns: DataTableColumn<SupervisionSupportRow>[] = [
    {
      key: "name",
      header: "Porteur",
      primary: true,
      cell: (row) => (
        <button
          type="button"
          onClick={() => setSelectedId(row.supportId)}
          className="text-left font-label font-semibold text-ink-strong underline-offset-4 hover:underline"
        >
          {row.name}
          <span className="sr-only"> — centrer sur la carte</span>
        </button>
      ),
    },
    { key: "zone", header: "Zone", cell: (row) => row.zoneName ?? "—" },
    {
      key: "presence",
      header: "Présence",
      cell: (row) => (
        <Badge tone={PRESENCE_TONE[row.presence]}>{PRESENCE_LABEL[row.presence]}</Badge>
      ),
    },
    {
      key: "heartbeat",
      header: "Dernier signal",
      cell: (row) => <span className="tabular">{sinceLabel(row.lastHeartbeatAt, now)}</span>,
    },
    {
      key: "current",
      header: "À l'écran",
      cell: (row) =>
        row.current ? (
          <span className="text-[0.8125rem] text-ink-soft">
            {CONTENT_TYPE_LABEL[row.current.contentType]}
            {row.current.title ? ` · ${row.current.title}` : ""}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "version",
      header: "Lecteur",
      cell: (row) => row.playerVersion ?? <span className="text-muted">—</span>,
    },
  ];

  const header = (
    <PageHeader
      title="Supervision"
      description="Ce que les écrans diffusent en ce moment, leur présence et les alertes du réseau."
      meta={
        <span
          className={cx(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-label text-xs font-semibold",
            status === "open"
              ? "border-success/30 bg-success/10 text-success"
              : status === "fallback"
                ? "border-warning/30 bg-warning/10 text-warning"
                : "border-line-strong text-muted",
          )}
        >
          <Activity aria-hidden="true" className="size-3.5" />
          {CONNECTION_LABEL[status]}
        </span>
      }
      secondaryActions={
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<RefreshCw aria-hidden="true" />}
          onClick={reload}
        >
          Actualiser
        </Button>
      }
    />
  );

  if (loading && snapshot.supports.length === 0) {
    return (
      <>
        {header}
        <LoadingRegion label="Chargement de la supervision…">
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-card" />
            ))}
          </div>
          <Skeleton className="mt-6 h-[24rem] rounded-card" />
        </LoadingRegion>
      </>
    );
  }

  if (error && snapshot.supports.length === 0) {
    return (
      <>
        {header}
        <ErrorState error={error} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      {header}
      <p aria-live="polite" className="sr-only">
        {status === "fallback" ? FALLBACK_MESSAGE : CONNECTION_LABEL[status]}
      </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Écrans en ligne"
            value={formatNumber(snapshot.stats.onlineSupports)}
            hint={`${formatNumber(snapshot.stats.offlineSupports)} hors ligne · ${formatNumber(snapshot.stats.unknownSupports)} inconnus`}
            icon={<MonitorSmartphone />}
            accent="blue"
          />
          <StatCard
            label="Diffusions (1 h)"
            value={formatNumber(snapshot.stats.diffusionsLastHour)}
            icon={<Activity />}
          />
          <StatCard
            label="Messages prioritaires"
            value={formatNumber(snapshot.stats.activeEmergencies)}
            icon={<Siren />}
            accent="orange"
          />
          <StatCard
            label="Alertes ouvertes"
            value={formatNumber(snapshot.stats.openAlerts)}
            icon={<BellRing />}
            accent="orange"
          />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <SectionCard title="Carte du réseau" description="Un point par Porteur, coloré par présence.">
            <SupervisionMap
              supports={snapshot.supports}
              selectedId={selectedId}
              onSelect={setSelectedId}
              pulsingId={pulsingId}
            />
          </SectionCard>

          <SectionCard
            title="Diffusions en direct"
            aside={
              <Button
                size="sm"
                variant="secondary"
                iconLeft={paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? "Reprendre le défilement" : "Suspendre le défilement"}
              </Button>
            }
          >
            <ul aria-live="polite" className="flex max-h-[26rem] flex-col gap-2 overflow-y-auto">
              {snapshot.recentDiffusions.length === 0 ? (
                <li className="py-6 text-center text-sm text-muted">
                  Aucune diffusion pour le moment.
                </li>
              ) : null}
              {snapshot.recentDiffusions.map((event) => (
                <li
                  key={event.diffusionLogId}
                  className="rounded-control border border-line px-3 py-2 text-[0.8125rem]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-label font-semibold text-ink-strong">
                      {event.supportName}
                    </span>
                    <span className="text-muted tabular">{formatDateTime(event.diffusedAt)}</span>
                  </div>
                  <p className="text-muted">
                    {CONTENT_TYPE_LABEL[event.contentType]}
                    {event.title ? ` · ${event.title}` : ""}
                    {event.zoneName ? ` · ${event.zoneName}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <SectionCard title="Alertes" description="Écrans silencieux, zones saturées, approbations en attente.">
            {snapshot.alerts.length === 0 ? (
              <EmptyState
                icon={<BellRing />}
                title="Aucune alerte ouverte"
                description="Le réseau fonctionne normalement."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {snapshot.alerts.map((alert) => (
                  <li key={alert.id} className="rounded-control border border-line px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={SEVERITY_TONE[alert.severity]}>
                        {SEVERITY_LABEL[alert.severity]}
                      </Badge>
                      <span className="font-label text-[0.8125rem] font-semibold text-ink-strong">
                        {ALERT_TYPE_LABEL[alert.type]}
                      </span>
                      <span className="ml-auto text-xs text-muted tabular">
                        {formatDateTime(alert.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-[0.8125rem] text-muted">{alert.message}</p>
                    <div className="mt-2 flex items-center gap-3">
                      {alert.acknowledgedAt ? (
                        <span className="text-xs text-muted">
                          Prise en compte par {alert.acknowledgedByName ?? "un membre de l'équipe"}
                        </span>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => void acknowledge(alert)}>
                          Prendre en compte
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Messages prioritaires" description="En cours, programmés ou en attente d'approbation.">
            {snapshot.emergencies.length === 0 ? (
              <EmptyState
                icon={<Siren />}
                title="Aucun message prioritaire"
                description="Aucun message ne prend la main sur les écrans."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {snapshot.emergencies.map((emergency) => (
                  <li
                    key={emergency.emergencyId}
                    className="rounded-control border border-line px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-label text-[0.8125rem] font-semibold text-ink-strong">
                        {emergency.title}
                      </span>
                      <Badge tone={emergency.state === "EN_COURS" ? "danger" : "neutral"}>
                        {emergency.state === "EN_ATTENTE_APPROBATION"
                          ? `En attente d'approbation (${emergency.approvalsCount}/${emergency.approvalsRequired})`
                          : emergency.state === "EN_COURS"
                            ? "En cours"
                            : "Programmé"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[0.8125rem] text-muted">
                      {formatNumber(emergency.affectedSupports)} Porteur(s) ciblé(s)
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <section className="mt-8">
          <AdminSectionHeading
            title="Porteurs"
            description="Équivalent non visuel de la carte : filtrez par présence ou cherchez un écran."
          />
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div
              role="group"
              aria-label="Filtrer par présence"
              className="flex flex-wrap gap-1 rounded-control border border-line-strong bg-overlay-inset p-1"
            >
              {PRESENCE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={presence === f.value}
                  onClick={() => setPresence(f.value)}
                  className={cx(
                    "min-h-9 rounded-[9px] px-3 font-label text-[0.8125rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-text",
                    presence === f.value
                      ? "bg-surface-3 text-ink-strong shadow-lift"
                      : "text-muted hover:text-ink",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Field label="Rechercher un Porteur" className="w-64">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nom, zone ou numéro"
              />
            </Field>
          </div>
          <div className="mt-3">
            <DataTable
              caption="Porteurs supervisés"
              columns={columns}
              rows={rows}
              getRowKey={(row) => row.supportId}
              empty={
                <EmptyState
                  icon={<MonitorSmartphone />}
                  title="Aucun Porteur"
                  description="Aucun écran ne correspond à ce filtre."
                />
              }
            />
          </div>
        </section>
    </>
  );
}
