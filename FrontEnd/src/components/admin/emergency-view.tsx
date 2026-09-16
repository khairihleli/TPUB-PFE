"use client";

import { Clock, ListOrdered, MonitorSmartphone, Plus, RefreshCw, Siren } from "lucide-react";
import { useMemo, useState } from "react";

import { IdChip, ReadOnlyNotice } from "@/components/admin/admin-ui";
import { EmergencyFormDialog } from "@/components/admin/emergency-form-dialog";
import {
  EMERGENCY_PHASE,
  emergencyPhase,
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
import { formatDateRange, formatTimeRange, todayISO } from "@/lib/format";
import { fetchCached, invalidate, resourceKeys } from "@/lib/resource-cache";
import { routes } from "@/lib/routes";
import { useResource } from "@/lib/use-resource";

interface EmergencyData {
  messages: EmergencyResponse[];
  zones: ZoneResponse[];
  /** Used for the impact line only: empty when the request failed. */
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

type Filter = "actifs" | "tous";

const PRINCIPLES = [
  {
    icon: <ListOrdered />,
    title: "Passe avant la publicité",
    text: "Pendant sa période, un message actif prend la main sur les écrans de sa zone. Entre plusieurs messages, « Passe en premier » est diffusé avant les autres.",
  },
  {
    icon: <Clock />,
    title: "Programmé par dates",
    text: "Les lecteurs appliquent les dates de début et de fin. Les heures sont enregistrées mais pas encore prises en compte.",
  },
  {
    icon: <MonitorSmartphone />,
    title: "Titre seul à l'écran",
    text: "Seuls le titre et la zone sont transmis aux écrans ; le contenu détaillé reste dans le back-office.",
  },
];

export function EmergencyView() {
  const { role, canAct } = useSession();
  const { toast } = useToast();
  const { data, error, loading, reload, setData } = useResource("admin:emergency", loadEmergencies);
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

  const today = todayISO();
  const zoneName = useMemo(() => {
    const m = new Map((data?.zones ?? []).map((z) => [z.id, z.name]));
    return (id: number) => m.get(id) ?? `Zone n° ${id}`;
  }, [data]);

  const sorted = useMemo(() => sortEmergencies(data?.messages ?? [], today), [data, today]);
  const activeRows = sorted.filter((m) => {
    const p = emergencyPhase(m, today);
    return p === "current" || p === "scheduled";
  });
  const rows = filter === "actifs" ? activeRows : sorted;
  const currentCount = sorted.filter((m) => emergencyPhase(m, today) === "current").length;

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
      key: "zone",
      header: "Zone",
      cell: (m) => <span className="md:whitespace-nowrap">{zoneName(m.zoneId)}</span>,
    },
    {
      key: "period",
      header: "Période",
      cell: (m) => (
        // Global `p { text-wrap: pretty }` resets the wrap mode: nowrap must sit on each <p>.
        <div>
          <p className="md:whitespace-nowrap">{formatDateRange(m.startDate, m.endDate)}</p>
          {m.startTime || m.endTime ? (
            <p className="text-[0.75rem] text-muted-2 md:whitespace-nowrap">
              {formatTimeRange(m.startTime, m.endTime)} (indicatif)
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "level",
      header: "Urgence",
      cell: (m) => <StatusPill type="urgency" level={m.urgencyLevel} size="sm" />,
    },
    {
      key: "priority",
      header: "Priorité",
      cell: (m) => <span className="md:whitespace-nowrap">{priorityLabel(m.priority)}</span>,
    },
    {
      key: "phase",
      header: "État",
      cell: (m) => {
        const p = EMERGENCY_PHASE[emergencyPhase(m, today)];
        return (
          <Badge
            tone={p.tone}
            dot
            pulse={emergencyPhase(m, today) === "current"}
            size="sm"
            title={p.description}
          >
            {p.label}
          </Badge>
        );
      },
    },
    ...(canAct
      ? [
          {
            key: "actions",
            header: <span className="sr-only">Actions</span>,
            align: "right" as const,
            hideOnMobile: true,
            cell: (m: EmergencyResponse) =>
              m.isActive ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setToDeactivate(m)}
                  aria-label={`Désactiver le message ${m.title}`}
                >
                  Désactiver
                </Button>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Messages prioritaires"
        description="Informations d'intérêt général programmées par zone : elles passent avant la publicité sur les écrans concernés."
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
          La création et la désactivation des messages sont réservées aux administrateurs.
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
          onValueChange={(v) => setFilter(v === "tous" ? "tous" : "actifs")}
          className="flex flex-col gap-5"
        >
          <TabsList aria-label="Filtrer les messages" className="self-start">
            <TabsTrigger value="actifs" count={activeRows.length}>
              En cours et programmés
            </TabsTrigger>
            <TabsTrigger value="tous" count={sorted.length}>
              Tous
            </TabsTrigger>
          </TabsList>

          <TabsContent value={filter} className="mt-0">
            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(m) => m.id}
              caption="Messages prioritaires"
              mobileFooter={
                canAct
                  ? (m) =>
                      m.isActive ? (
                        <Button size="sm" variant="secondary" onClick={() => setToDeactivate(m)}>
                          Désactiver
                        </Button>
                      ) : null
                  : undefined
              }
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
                      ? "Les messages passés ou désactivés restent consultables dans l'onglet « Tous »."
                      : "Les messages d'intérêt général (information de service, fermeture temporaire d'une voie, changement d'horaires) apparaîtront ici."
                  }
                  action={
                    filter === "actifs" && sorted.length > 0 ? (
                      <Button variant="secondary" onClick={() => setFilter("tous")}>
                        Voir tous les messages
                      </Button>
                    ) : canAct ? (
                      // Secondary: the header already holds the page's primary « Nouveau message prioritaire ».
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
            onCreated={({ messages, sampleSupportId }) => {
              setData((prev) => ({
                messages: [...(prev?.messages ?? []), ...messages],
                zones: prev?.zones ?? [],
                supports: prev?.supports ?? [],
              }));
              invalidate(resourceKeys.emergencies);
              const current = messages.some((m) => emergencyPhase(m, todayISO()) === "current");
              setFilter("actifs");
              toast({
                title:
                  messages.length > 1
                    ? `${messages.length} messages programmés`
                    : "Message programmé",
                description: current
                  ? "Diffusé en priorité dès le prochain appel des lecteurs des zones choisies."
                  : "Diffusé en priorité à partir de sa date de début.",
                variant: "success",
                ...(sampleSupportId !== null
                  ? {
                      action: {
                        label: "Vérifier sur un écran",
                        href: routes.player(sampleSupportId),
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
            title={
              toDeactivate ? `Désactiver « ${toDeactivate.title} » ?` : "Désactiver le message ?"
            }
            description="Le message est retiré de la diffusion dès le prochain appel des écrans. Il ne peut pas être réactivé : programmez un nouveau message si besoin."
            confirmLabel="Désactiver"
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
              toast({ title: "Message désactivé", variant: "success" });
            }}
          />
        </>
      ) : null}
    </>
  );
}
