"use client";

import { Clock, ListOrdered, MonitorSmartphone, Plus, RefreshCw, Siren } from "lucide-react";
import { useMemo, useState } from "react";

import { IdChip, ReadOnlyNotice } from "@/components/admin/admin-ui";
import { EmergencyFormDialog } from "@/components/admin/emergency-form-dialog";
import {
  emergencyStateOf,
  emergencyTargetLabel,
  isLiveState,
  priorityLabel,
  sortEmergencies,
} from "@/components/admin/emergency-schema";
import { useRegisterCommands } from "@/components/shell/command-palette";
import { useSession } from "@/components/shell/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { emergencyApi, supportsApi, zonesApi } from "@/lib/api/endpoints";
import type { EmergencyResponse, SupportResponse, ZoneResponse } from "@/lib/api/types";
import { EMERGENCY_STATE, EMERGENCY_STOP_REASON_LABEL } from "@/lib/campaign-status";
import { formatDateTime, formatNumber } from "@/lib/format";
import { withinKm } from "@/lib/geo";
import { fetchCached, invalidate, resourceKeys } from "@/lib/resource-cache";
import { routes } from "@/lib/routes";
import { useResource } from "@/lib/use-resource";

interface EmergencyData {
  messages: EmergencyResponse[];
  zones: ZoneResponse[];
  /** Map context and impact only: empty when the request failed. */
  supports: SupportResponse[];
}

async function loadEmergencies(signal: AbortSignal): Promise<EmergencyData> {
  const [messages, zones, supports] = await Promise.all([
    emergencyApi.all({ signal }),
    fetchCached(resourceKeys.zonesAll, (s) => zonesApi.all({ signal: s }), { signal }),
    fetchCached(resourceKeys.supportsAll, (s) => supportsApi.all({ signal: s }), { signal }).catch(
      () => [] as SupportResponse[],
    ),
  ]);
  return { messages, zones, supports };
}

type Filter = "actifs" | "historique";

const PRINCIPLES = [
  {
    icon: <ListOrdered />,
    title: "Passe avant la publicité",
    text: "Pendant sa période, un message prend la main sur les écrans ciblés. Entre plusieurs messages, le niveau d'urgence le plus élevé passe d'abord, puis la priorité 1.",
  },
  {
    icon: <Clock />,
    title: "Fenêtre date et heure",
    text: "Le message démarre à la date et l'heure de début et s'arrête automatiquement à la fin de sa période.",
  },
  {
    icon: <MonitorSmartphone />,
    title: "Titre et contenu à l'écran",
    text: "Les Porteurs du cercle (ou de la zone) affichent le titre et le contenu en plein écran, aux couleurs du niveau d'urgence.",
  },
];

/** First ACTIF Porteur reached by the message (« Vérifier sur un écran »). */
export function sampleSupportFor(
  message: Pick<EmergencyResponse, "zoneId" | "latitude" | "longitude" | "radiusKm">,
  supports: readonly SupportResponse[],
): number | null {
  const active = supports.filter((s) => s.technicalStatus === "ACTIF");
  const { latitude, longitude, radiusKm } = message;
  const hit =
    typeof latitude === "number" && typeof longitude === "number" && typeof radiusKm === "number"
      ? active.find((s) => withinKm(s.latitude, s.longitude, latitude, longitude, radiusKm))
      : active.find((s) => s.zoneId === message.zoneId);
  return hit?.id ?? null;
}

export function EmergencyView() {
  const { role, canAct } = useSession();
  const { toast } = useToast();
  const { data, error, loading, reload, setData } = useResource(
    "admin:emergency",
    loadEmergencies,
    {
      pollInterval: 60_000,
    },
  );
  const [filter, setFilter] = useState<Filter>("actifs");
  const [createOpen, setCreateOpen] = useState(false);
  const [toDeactivate, setToDeactivate] = useState<EmergencyResponse | null>(null);
  useRegisterCommands(
    canAct && data
      ? [
          {
            id: "emergency-new",
            label: "Programmer un message prioritaire",
            group: "Cette page",
            keywords: ["urgence", "message", "nouveau"],
            run: () => setCreateOpen(true),
          },
        ]
      : [],
    [canAct, Boolean(data)],
  );

  const now = new Date();
  const zoneName = useMemo(() => {
    const m = new Map((data?.zones ?? []).map((z) => [z.id, z.name]));
    return (id: number) => m.get(id) ?? `Zone n° ${id}`;
  }, [data]);

  const sorted = useMemo(() => sortEmergencies(data?.messages ?? []), [data]);
  const liveRows = sorted.filter((m) => isLiveState(emergencyStateOf(m, now)));
  const rows = filter === "actifs" ? liveRows : sorted;
  const currentCount = sorted.filter((m) => emergencyStateOf(m, now) === "EN_COURS").length;

  const deactivateButton = (m: EmergencyResponse) =>
    m.isActive && isLiveState(emergencyStateOf(m, now)) ? (
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setToDeactivate(m)}
        aria-label={`Arrêter le message ${m.title}`}
      >
        Arrêter
      </Button>
    ) : null;

  const columns: DataTableColumn<EmergencyResponse>[] = [
    {
      key: "title",
      header: "Message",
      primary: true,
      className: "min-w-[16rem]",
      cell: (m) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <IdChip id={m.id} />
            <span className="font-label font-semibold break-words text-ink-strong">{m.title}</span>
          </div>
          <p className="mt-1 line-clamp-2 max-w-[30rem] text-[0.8125rem] leading-snug text-muted">
            {m.content}
          </p>
        </div>
      ),
    },
    {
      key: "target",
      header: "Cible",
      cell: (m) => (
        <span className="md:whitespace-nowrap">{emergencyTargetLabel(m, zoneName)}</span>
      ),
    },
    {
      key: "period",
      header: "Période",
      cell: (m) => (
        <div>
          <p className="md:whitespace-nowrap">
            {formatDateTime(`${m.startDate}T${m.startTime ?? "00:00:00"}`)}
          </p>
          <p className="text-[0.8125rem] text-muted md:whitespace-nowrap">
            → {formatDateTime(`${m.endDate}T${m.endTime ?? "23:59:59"}`)}
          </p>
        </div>
      ),
    },
    {
      key: "level",
      header: "Urgence",
      cell: (m) => (
        <div className="flex flex-col items-start gap-1">
          <StatusPill type="urgency" level={m.urgencyLevel} size="sm" />
          <span className="text-[0.75rem] text-muted md:whitespace-nowrap">
            {priorityLabel(m.priority)} · {m.durationSeconds ?? 15} s
          </span>
        </div>
      ),
    },
    {
      key: "state",
      header: "État",
      mobileMeta: true,
      cell: (m) => {
        const state = emergencyStateOf(m, now);
        const meta = EMERGENCY_STATE[state];
        return (
          <div className="flex flex-col items-start gap-1">
            <Badge tone={meta.tone} dot pulse={meta.pulse} size="sm" title={meta.description}>
              {meta.label}
            </Badge>
            {m.stopReason ? (
              <span className="text-[0.75rem] text-muted md:whitespace-nowrap">
                {EMERGENCY_STOP_REASON_LABEL[m.stopReason]}
                {m.stoppedAt ? ` · ${formatDateTime(m.stoppedAt)}` : ""}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "impact",
      header: "Diffusion",
      cell: (m) => (
        <div className="text-[0.8125rem] md:whitespace-nowrap">
          <p>
            <span className="font-semibold text-ink-strong tabular">
              {formatNumber(m.affectedSupports ?? 0)}
            </span>{" "}
            Porteur{(m.affectedSupports ?? 0) > 1 ? "s" : ""} actif
            {(m.affectedSupports ?? 0) > 1 ? "s" : ""}
          </p>
          <p className="text-muted">
            {formatNumber(m.diffusionCount ?? 0)} passage{(m.diffusionCount ?? 0) > 1 ? "s" : ""}
          </p>
        </div>
      ),
    },
    ...(canAct
      ? [
          {
            key: "actions",
            header: <span className="sr-only">Actions</span>,
            align: "right" as const,
            hideOnMobile: true,
            cell: deactivateButton,
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Messages prioritaires"
        description="Informations d'intérêt général ciblées sur la carte : elles passent avant la publicité sur les écrans concernés pendant leur période."
        meta={
          currentCount > 0 ? (
            <Badge tone="warning" dot pulse>
              {currentCount} en cours
            </Badge>
          ) : null
        }
        primaryAction={
          canAct ? (
            <Button
              variant="primary"
              iconLeft={<Plus aria-hidden="true" />}
              onClick={() => setCreateOpen(true)}
              disabledReason={data ? null : "Chargement des zones en cours…"}
            >
              Nouveau message prioritaire
            </Button>
          ) : undefined
        }
        secondaryActions={
          <Button
            variant="secondary"
            onClick={reload}
            loading={loading && data !== undefined}
            loadingLabel="Actualisation…"
            iconLeft={<RefreshCw aria-hidden="true" />}
          >
            Actualiser
          </Button>
        }
      />

      {!canAct ? (
        <ReadOnlyNotice role={role} className="mb-6">
          La création et l&apos;arrêt des messages sont réservés aux administrateurs.
        </ReadOnlyNotice>
      ) : null}

      <ul className="mb-8 grid grid-cols-[minmax(0,1fr)] gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-3">
        {PRINCIPLES.map((p) => (
          <li key={p.title} className="flex gap-3 bg-surface/95 p-5">
            <span
              aria-hidden="true"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-red-line bg-red-soft text-brand-red-text [&_svg]:size-4.5"
            >
              {p.icon}
            </span>
            <div>
              <p className="font-label text-[0.875rem] font-semibold text-ink-strong">{p.title}</p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{p.text}</p>
            </div>
          </li>
        ))}
      </ul>

      {data ? (
        <Tabs
          value={filter}
          onValueChange={(v) => setFilter(v === "historique" ? "historique" : "actifs")}
          className="flex flex-col gap-5"
        >
          <TabsList aria-label="Filtrer les messages" className="self-start">
            <TabsTrigger value="actifs" count={liveRows.length}>
              En cours et programmés
            </TabsTrigger>
            <TabsTrigger value="historique" count={sorted.length}>
              Historique
            </TabsTrigger>
          </TabsList>

          <TabsContent value={filter} className="mt-0">
            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(m) => m.id}
              caption="Messages prioritaires"
              mobileFooter={canAct ? deactivateButton : undefined}
              empty={
                <EmptyState
                  icon={<Siren />}
                  title={
                    filter === "actifs" && sorted.length > 0
                      ? "Aucun message en cours ou programmé"
                      : "Aucun message prioritaire"
                  }
                  description={
                    filter === "actifs" && sorted.length > 0
                      ? "Les messages terminés ou arrêtés restent consultables dans l'historique."
                      : "Les messages d'intérêt général (information de service, fermeture temporaire d'une voie, alerte météo) apparaîtront ici."
                  }
                  action={
                    filter === "actifs" && sorted.length > 0 ? (
                      <Button variant="secondary" onClick={() => setFilter("historique")}>
                        Voir l&apos;historique
                      </Button>
                    ) : canAct ? (
                      <Button
                        variant="secondary"
                        onClick={() => setCreateOpen(true)}
                        iconLeft={<Plus aria-hidden="true" />}
                      >
                        Programmer un message
                      </Button>
                    ) : undefined
                  }
                />
              }
            />
          </TabsContent>
        </Tabs>
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <LoadingRegion
          label="Chargement des messages prioritaires…"
          className="flex flex-col gap-3"
        >
          <Skeleton className="h-11 w-72 rounded-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </LoadingRegion>
      )}

      {canAct ? (
        <>
          <EmergencyFormDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            zones={data?.zones ?? []}
            supports={data?.supports ?? []}
            onCreated={(message) => {
              setData((prev) => ({
                messages: [message, ...(prev?.messages ?? [])],
                zones: prev?.zones ?? [],
                supports: prev?.supports ?? [],
              }));
              invalidate(resourceKeys.emergencies);
              setFilter("actifs");
              const sample = sampleSupportFor(message, data?.supports ?? []);
              const onAir = emergencyStateOf(message) === "EN_COURS";
              toast({
                title: "Message programmé",
                description: onAir
                  ? "Diffusé en priorité dès le prochain appel des lecteurs ciblés."
                  : "Diffusé en priorité à partir de son début.",
                variant: "success",
                ...(sample !== null
                  ? {
                      action: {
                        label: "Vérifier sur un écran",
                        href: routes.player(sample),
                        external: true,
                      },
                    }
                  : {}),
              });
            }}
          />
          <ConfirmDialog
            open={toDeactivate !== null}
            onOpenChange={(open) => {
              if (!open) setToDeactivate(null);
            }}
            title={toDeactivate ? `Arrêter « ${toDeactivate.title} » ?` : "Arrêter le message ?"}
            description="Le message est retiré de la diffusion dès le prochain appel des écrans (arrêt manuel journalisé). Il ne peut pas être réactivé : programmez un nouveau message si besoin."
            confirmLabel="Arrêter le message"
            tone="danger"
            onConfirm={async () => {
              if (!toDeactivate) return;
              const updated = await emergencyApi.deactivate(toDeactivate.id);
              setData((prev) => ({
                messages: (prev?.messages ?? []).map((x) => (x.id === updated.id ? updated : x)),
                zones: prev?.zones ?? [],
                supports: prev?.supports ?? [],
              }));
              invalidate(resourceKeys.emergencies);
              toast({ title: "Message arrêté", variant: "success" });
            }}
          />
        </>
      ) : null}
    </>
  );
}
