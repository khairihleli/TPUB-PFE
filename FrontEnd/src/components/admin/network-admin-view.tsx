"use client";

import {
  Map as MapIcon,
  MapPinned,
  MonitorPlay,
  MonitorSmartphone,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Table2,
  Trash2,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { IdChip, ReadOnlyNotice } from "@/components/admin/admin-ui";
import { NetworkAdminMap } from "@/components/admin/network-admin-map";
import {
  networkSummaryItems,
  type NetworkView,
  type SummaryTone,
} from "@/components/admin/network-map-model";
import { normalizeText } from "@/components/admin/moderation-model";
import {
  countSupportsByZone,
  formatCoordinates,
  isZoneInUseError,
  type SupportFormValues,
  TECHNICAL_STATUSES,
  ZONE_IN_USE_MESSAGE,
  type ZoneFormValues,
} from "@/components/admin/network-schemas";
import { SupportFormDialog } from "@/components/admin/support-form-dialog";
import { ZoneFormDialog } from "@/components/admin/zone-form-dialog";
import { useSession } from "@/components/shell/session-provider";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { supportsApi, zonesApi } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/errors";
import type { SupportResponse, TechnicalStatus, ZoneResponse } from "@/lib/api/types";
import { SUPPORT_TYPE_LABEL, TECHNICAL_STATUS } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { formatCount, formatNumber } from "@/lib/format";
import { primeCache, resourceKeys } from "@/lib/resource-cache";
import { routes } from "@/lib/routes";
import { useResource } from "@/lib/use-resource";

export type NetworkTab = "zones" | "ecrans";

interface NetworkData {
  zones: ZoneResponse[];
  supports: SupportResponse[];
}

async function loadNetwork(signal: AbortSignal): Promise<NetworkData> {
  const [zones, supports] = await Promise.all([
    zonesApi.all({ signal }),
    supportsApi.all({ signal }),
  ]);
  return {
    zones: [...zones].sort((a, b) => a.name.localeCompare(b.name, "fr")),
    supports: [...supports].sort((a, b) => a.name.localeCompare(b.name, "fr")),
  };
}

function upsert<T extends { id: number }>(list: readonly T[], item: T): T[] {
  const exists = list.some((x) => x.id === item.id);
  return exists ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
}

/** Keeps `?vue=` / `?onglet=` shareable without a navigation (no refetch). */
function syncUrl(key: "vue" | "onglet", value: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set(key, value);
  window.history.replaceState(window.history.state, "", url);
}

export function NetworkAdminView({
  initialTab = "zones",
  initialView = "carte",
  initialSupportId = null,
  initialPanel = null,
}: {
  initialTab?: NetworkTab;
  initialView?: NetworkView;
  /** `?porteur=`: open the map inspector on this Porteur. */
  initialSupportId?: number | null;
  /** `?panneau=coherence`: open the « Cohérence » side panel. */
  initialPanel?: "coherence" | null;
}) {
  const { role, canAct } = useSession();
  const { toast } = useToast();
  const { data, error, loading, reload, setData } = useResource("admin:network", loadNetwork);
  useEffect(() => {
    if (!data) return;
    // Keep the shared cache (palette, badges, other admin screens) in sync with local edits.
    primeCache(resourceKeys.zonesAll, data.zones);
    primeCache(resourceKeys.supportsAll, data.supports);
  }, [data]);
  const [tab, setTab] = useState<NetworkTab>(initialTab);
  const [view, setView] = useState<NetworkView>(initialView);

  // Zone dialogs
  const [zoneDialog, setZoneDialog] = useState<{
    open: boolean;
    zone: ZoneResponse | null;
    initial?: ZoneFormValues | null;
  }>({
    open: false,
    zone: null,
  });
  const [zoneToDelete, setZoneToDelete] = useState<ZoneResponse | null>(null);
  // Support dialog
  const [supportDialog, setSupportDialog] = useState<{
    open: boolean;
    support: SupportResponse | null;
    initial?: SupportFormValues | null;
  }>({ open: false, support: null });

  const changeView = (next: NetworkView) => {
    setView(next);
    syncUrl("vue", next);
  };
  const changeTab = (next: NetworkTab) => {
    setTab(next);
    syncUrl("onglet", next);
  };

  const supportsByZone = useMemo(() => countSupportsByZone(data?.supports ?? []), [data]);

  const onZoneSaved = (zone: ZoneResponse, created: boolean) => {
    setData((prev) => {
      const base = prev ?? { zones: [], supports: [] };
      return {
        zones: upsert(base.zones, zone).sort((a, b) => a.name.localeCompare(b.name, "fr")),
        // Keep denormalised zone names in sync after a rename.
        supports: base.supports.map((s) =>
          s.zoneId === zone.id ? { ...s, zoneName: zone.name } : s,
        ),
      };
    });
    toast({ title: created ? "Zone créée" : "Zone mise à jour", variant: "success" });
  };

  const onSupportSaved = (support: SupportResponse, created: boolean) => {
    setData((prev) => {
      const base = prev ?? { zones: [], supports: [] };
      return {
        zones: base.zones,
        supports: upsert(base.supports, support).sort((a, b) => a.name.localeCompare(b.name, "fr")),
      };
    });
    toast({ title: created ? "Porteur créé" : "Porteur mis à jour", variant: "success" });
  };

  const onSupportMoved = (support: SupportResponse, message: string) => {
    setData((prev) => ({
      zones: prev?.zones ?? [],
      supports: upsert(prev?.supports ?? [], support),
    }));
    toast({ title: message, variant: "success" });
  };

  const onZoneMapUpdated = (zone: ZoneResponse, message: string) => {
    setData((prev) => ({
      zones: upsert(prev?.zones ?? [], zone),
      supports: prev?.supports ?? [],
    }));
    toast({ title: message, variant: "success" });
  };

  const deleteZone = async (zone: ZoneResponse) => {
    try {
      await zonesApi.remove(zone.id);
    } catch (e) {
      if (isZoneInUseError(e)) throw new ApiError(400, ZONE_IN_USE_MESSAGE);
      throw e;
    }
    setData((prev) => ({
      zones: (prev?.zones ?? []).filter((z) => z.id !== zone.id),
      supports: prev?.supports ?? [],
    }));
    toast({ title: "Zone supprimée", variant: "success" });
  };

  const deleteCount = zoneToDelete ? (supportsByZone.get(zoneToDelete.id) ?? 0) : 0;

  return (
    <>
      <PageHeader
        title="Réseau"
        description="Zones de diffusion et Porteurs rattachés. Les annonceurs ne voient que les zones actives et les Porteurs à l'état « Actif »."
        primaryAction={
          canAct ? (
            view === "tableau" && tab === "zones" ? (
              <Button
                variant="primary"
                iconLeft={<Plus aria-hidden="true" />}
                onClick={() => setZoneDialog({ open: true, zone: null })}
              >
                Nouvelle zone
              </Button>
            ) : (
              <Button
                variant="primary"
                iconLeft={<Plus aria-hidden="true" />}
                onClick={() => setSupportDialog({ open: true, support: null })}
                disabledReason={
                  !data
                    ? "Chargement du réseau en cours…"
                    : data.zones.length === 0
                      ? "Créez d'abord une zone : chaque Porteur y est rattaché."
                      : null
                }
              >
                Nouveau Porteur
              </Button>
            )
          ) : undefined
        }
        secondaryActions={
          <>
            {canAct && view === "carte" ? (
              <Button
                variant="secondary"
                iconLeft={<Plus aria-hidden="true" />}
                onClick={() => setZoneDialog({ open: true, zone: null })}
              >
                Nouvelle zone
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={reload}
              loading={loading && data !== undefined}
              loadingLabel="Actualisation…"
              iconLeft={<RefreshCw aria-hidden="true" />}
            >
              Actualiser
            </Button>
          </>
        }
      />

      {!canAct ? <ReadOnlyNotice role={role} className="mb-6" /> : null}

      {data ? (
        <>
          <NetworkSummary data={data} />
          <Tabs
            value={view}
            onValueChange={(v) => changeView(v === "tableau" ? "tableau" : "carte")}
            className="mt-8"
          >
            <TabsList aria-label="Affichage du réseau" className="w-fit">
              <TabsTrigger value="carte" icon={<MapIcon />}>
                Carte
              </TabsTrigger>
              <TabsTrigger value="tableau" icon={<Table2 />}>
                Tableau
              </TabsTrigger>
            </TabsList>
            <TabsContent value="carte" className="mt-5">
              <NetworkAdminMap
                zones={data.zones}
                supports={data.supports}
                canAct={canAct}
                initialSupportId={initialSupportId}
                initialSideTab={initialPanel === "coherence" ? "coherence" : "inspecteur"}
                onEditSupport={(support) => setSupportDialog({ open: true, support })}
                onEditZone={(zone) => setZoneDialog({ open: true, zone })}
                onCreateSupport={(initial) =>
                  setSupportDialog({ open: true, support: null, initial })
                }
                onCreateZone={(initial) => setZoneDialog({ open: true, zone: null, initial })}
                onSupportUpdated={onSupportMoved}
                onZoneUpdated={onZoneMapUpdated}
              />
            </TabsContent>
            <TabsContent value="tableau" className="mt-5">
              <Tabs
                value={tab}
                onValueChange={(v) => changeTab(v === "ecrans" ? "ecrans" : "zones")}
              >
                <TabsList aria-label="Zones ou Porteurs" className="w-fit">
                  <TabsTrigger value="zones" count={data.zones.length} icon={<MapPinned />}>
                    Zones
                  </TabsTrigger>
                  <TabsTrigger
                    value="ecrans"
                    count={data.supports.length}
                    icon={<MonitorSmartphone />}
                  >
                    Porteurs
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="zones">
                  <ZonesPanel
                    zones={data.zones}
                    supportsByZone={supportsByZone}
                    canAct={canAct}
                    onCreate={() => setZoneDialog({ open: true, zone: null })}
                    onEdit={(zone) => setZoneDialog({ open: true, zone })}
                    onDelete={setZoneToDelete}
                  />
                </TabsContent>
                <TabsContent value="ecrans">
                  <SupportsPanel
                    data={data}
                    canAct={canAct}
                    onCreate={() => setSupportDialog({ open: true, support: null })}
                    onEdit={(support) => setSupportDialog({ open: true, support })}
                    onGoToZones={() => changeTab("zones")}
                  />
                </TabsContent>
              </Tabs>
            </TabsContent>
          </Tabs>
        </>
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <LoadingRegion label="Chargement du réseau…" className="flex flex-col gap-4">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="mt-4 h-12 w-64 rounded-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </LoadingRegion>
      )}

      {canAct ? (
        <>
          <ZoneFormDialog
            open={zoneDialog.open}
            zone={zoneDialog.zone}
            initialValues={zoneDialog.initial ?? null}
            contextZones={data?.zones ?? []}
            contextSupports={data?.supports ?? []}
            onOpenChange={(open) => setZoneDialog((d) => ({ ...d, open }))}
            onSaved={onZoneSaved}
          />
          <SupportFormDialog
            open={supportDialog.open}
            support={supportDialog.support}
            initialValues={supportDialog.initial ?? null}
            zones={data?.zones ?? []}
            onOpenChange={(open) => setSupportDialog((d) => ({ ...d, open }))}
            onSaved={onSupportSaved}
          />
          <ConfirmDialog
            open={zoneToDelete !== null}
            onOpenChange={(open) => {
              if (!open) setZoneToDelete(null);
            }}
            title={
              zoneToDelete ? `Supprimer la zone « ${zoneToDelete.name} » ?` : "Supprimer la zone ?"
            }
            description="La suppression est définitive."
            confirmLabel="Supprimer"
            tone="danger"
            onConfirm={() => (zoneToDelete ? deleteZone(zoneToDelete) : undefined)}
          >
            {deleteCount > 0 ? (
              <Alert tone="warning" title="Suppression impossible en l'état" live="none">
                {formatCount(deleteCount, "Porteur est rattaché", "Porteurs sont rattachés")} à
                cette zone : la base de données refusera la suppression. Réaffectez-les à une autre
                zone, ou désactivez simplement la zone.
              </Alert>
            ) : (
              <p className="text-sm leading-relaxed text-muted">
                Aucun Porteur n&apos;est rattaché à cette zone. Si des réservations ou des messages
                prioritaires y font référence, la suppression sera refusée : désactivez-la plutôt.
              </p>
            )}
          </ConfirmDialog>
        </>
      ) : null}
    </>
  );
}

function NetworkSummary({ data }: { data: NetworkData }) {
  const activeZones = data.zones.filter((z) => z.isActive).length;
  const byStatus = (s: TechnicalStatus) =>
    data.supports.filter((x) => x.technicalStatus === s).length;
  const items = networkSummaryItems({
    activeZones,
    zones: data.zones.length,
    active: byStatus("ACTIF"),
    maintenance: byStatus("MAINTENANCE"),
    down: byStatus("INACTIF") + byStatus("HORS_LIGNE"),
  });
  return (
    <section aria-label="Synthèse du réseau">
      <dl className="grid gap-px overflow-hidden rounded-card border border-line bg-line grid-cols-2 xl:grid-cols-4">
        {items.map((it) => (
          <div key={it.label} className="flex min-w-0 flex-col gap-1 bg-surface px-4 py-4 sm:px-5">
            <dt className="text-[0.8125rem] text-muted">{it.label}</dt>
            <dd
              className={cx("font-display text-2xl font-semibold tabular", SUMMARY_TONE[it.tone])}
            >
              {it.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[0.75rem] text-muted-2">
        États techniques tels que saisis dans le back-office, sans supervision automatique des
        Porteurs.
      </p>
    </section>
  );
}

const SUMMARY_TONE: Record<SummaryTone, string> = {
  neutral: "text-ink-strong",
  muted: "text-muted",
  warning: "text-warning",
  danger: "text-danger",
};

function SearchBox({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
      />
      <Input
        type="search"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="pl-10"
      />
    </div>
  );
}

function IconAction({
  label,
  onClick,
  children,
  tone = "default",
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-11 items-center justify-center rounded-full border border-transparent text-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-text [&_svg]:size-4",
        tone === "danger"
          ? "hover:border-danger/30 hover:bg-danger/10 hover:text-danger"
          : "hover:border-line-strong hover:bg-overlay-hover hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function ZonesPanel({
  zones,
  supportsByZone,
  canAct,
  onCreate,
  onEdit,
  onDelete,
}: {
  zones: ZoneResponse[];
  supportsByZone: Map<number, number>;
  canAct: boolean;
  onCreate: () => void;
  onEdit: (zone: ZoneResponse) => void;
  onDelete: (zone: ZoneResponse) => void;
}) {
  const [query, setQuery] = useState("");
  const q = normalizeText(query);
  const rows = q ? zones.filter((z) => normalizeText(z.name).includes(q)) : zones;

  const columns: DataTableColumn<ZoneResponse>[] = [
    {
      key: "name",
      header: "Zone",
      primary: true,
      cell: (z) => (
        <span className="inline-flex items-center gap-2">
          <IdChip id={z.id} />
          <span className="font-label font-semibold text-ink-strong">{z.name}</span>
        </span>
      ),
    },
    {
      key: "coords",
      header: "Centre",
      cell: (z) => (
        <span className="whitespace-nowrap tabular">
          {formatCoordinates(z.latitude, z.longitude)}
        </span>
      ),
    },
    {
      key: "radius",
      header: "Rayon",
      align: "right",
      cell: (z) =>
        z.radiusKm != null ? (
          <span className="tabular">
            {new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 3 }).format(z.radiusKm)} km
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "supports",
      header: "Porteurs",
      align: "right",
      cell: (z) => <span className="tabular">{formatNumber(supportsByZone.get(z.id) ?? 0)}</span>,
    },
    {
      key: "status",
      header: "Statut",
      cell: (z) =>
        z.isActive ? (
          <Badge tone="success" dot size="sm">
            Active
          </Badge>
        ) : (
          <Badge tone="muted" dot size="sm">
            Inactive
          </Badge>
        ),
    },
    ...(canAct
      ? [
          {
            key: "actions",
            header: <span className="sr-only">Actions</span>,
            align: "right" as const,
            hideOnMobile: true,
            cell: (z: ZoneResponse) => (
              <span className="inline-flex gap-1">
                <IconAction label={`Modifier la zone ${z.name}`} onClick={() => onEdit(z)}>
                  <Pencil aria-hidden="true" />
                </IconAction>
                <IconAction
                  label={`Supprimer la zone ${z.name}`}
                  tone="danger"
                  onClick={() => onDelete(z)}
                >
                  <Trash2 aria-hidden="true" />
                </IconAction>
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      {zones.length > 0 ? (
        <SearchBox
          value={query}
          onChange={setQuery}
          label="Rechercher une zone"
          placeholder="Nom de la zone"
        />
      ) : null}
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(z) => z.id}
        caption="Zones de diffusion"
        mobileFooter={
          canAct
            ? (z) => (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onEdit(z)}
                    iconLeft={<Pencil aria-hidden="true" />}
                  >
                    Modifier
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    onClick={() => onDelete(z)}
                    iconLeft={<Trash2 aria-hidden="true" />}
                  >
                    Supprimer
                  </Button>
                </>
              )
            : undefined
        }
        empty={
          zones.length === 0 ? (
            <EmptyState
              icon={<MapPinned />}
              title="Aucune zone pour le moment"
              description="Une zone regroupe les Porteurs d'un quartier ou d'une ville autour d'un point central. Créez-en une pour rattacher des Porteurs."
              action={
                canAct ? (
                  <Button
                    variant="primary"
                    onClick={onCreate}
                    iconLeft={<Plus aria-hidden="true" />}
                  >
                    Créer une zone
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <EmptyState
              compact
              icon={<Search />}
              title="Aucun résultat"
              description="Aucune zone ne correspond à cette recherche."
              action={
                <Button variant="secondary" onClick={() => setQuery("")}>
                  Effacer la recherche
                </Button>
              }
            />
          )
        }
      />
    </div>
  );
}

function SupportsPanel({
  data,
  canAct,
  onCreate,
  onEdit,
  onGoToZones,
}: {
  data: NetworkData;
  canAct: boolean;
  onCreate: () => void;
  onEdit: (support: SupportResponse) => void;
  onGoToZones: () => void;
}) {
  const [query, setQuery] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const q = normalizeText(query);

  const rows = data.supports.filter(
    (s) =>
      (!q ||
        normalizeText(`${s.name} ${s.zoneName}`).includes(q) ||
        String(s.id) === q.replace(/^#/, "")) &&
      (!zoneFilter || String(s.zoneId) === zoneFilter) &&
      (!statusFilter || s.technicalStatus === statusFilter),
  );
  const filtered = Boolean(q || zoneFilter || statusFilter);

  const columns: DataTableColumn<SupportResponse>[] = [
    {
      key: "name",
      header: "Porteur",
      primary: true,
      cell: (s) => (
        <span className="inline-flex items-center gap-2">
          <IdChip id={s.id} />
          <span className="font-label font-semibold text-ink-strong">{s.name}</span>
        </span>
      ),
    },
    { key: "type", header: "Type", cell: (s) => SUPPORT_TYPE_LABEL[s.supportType] },
    { key: "zone", header: "Zone", cell: (s) => s.zoneName },
    {
      key: "status",
      header: "État",
      cell: (s) => <StatusPill type="support" status={s.technicalStatus} size="sm" />,
    },
    {
      key: "capacity",
      header: "Capacité",
      align: "right",
      cell: (s) => <span className="tabular">{formatNumber(s.diffusionCapacity)}</span>,
    },
    {
      key: "coords",
      header: "Position",
      hideOnMobile: true,
      cell: (s) => (
        <span className="whitespace-nowrap text-[0.8125rem] tabular">
          {formatCoordinates(s.latitude, s.longitude)}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      hideOnMobile: true,
      cell: (s) => (
        <span className="inline-flex items-center gap-1">
          <a
            href={routes.player(s.id)}
            target="_blank"
            rel="noopener"
            title="Ouvrir le lecteur de démonstration"
            className="inline-flex size-11 items-center justify-center rounded-full border border-transparent text-muted transition-colors hover:border-line-strong hover:bg-overlay-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-text"
          >
            <MonitorPlay aria-hidden="true" className="size-4" />
            <span className="sr-only">
              Ouvrir le lecteur du Porteur {s.name} (nouvel onglet, chaque appel est journalisé)
            </span>
          </a>
          {canAct ? (
            <IconAction label={`Modifier le Porteur ${s.name}`} onClick={() => onEdit(s)}>
              <Pencil aria-hidden="true" />
            </IconAction>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="info" live="none" icon={<MonitorPlay />}>
        Le bouton « lecteur » ouvre, dans un nouvel onglet, ce que l&apos;écran diffuserait. Il
        interroge le service à chaque fin de contenu, et chaque appel ajoute une ligne au journal de
        diffusion : fermez-le après la démonstration.
      </Alert>

      {data.supports.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchBox
            value={query}
            onChange={setQuery}
            label="Rechercher un Porteur"
            placeholder="Nom, zone ou n° de Porteur"
          />
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <Select
              aria-label="Filtrer par zone"
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="sm:w-48"
            >
              <option value="">Toutes les zones</option>
              {data.zones.map((z) => (
                <option key={z.id} value={String(z.id)}>
                  {z.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filtrer par état"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="sm:w-44"
            >
              <option value="">Tous les états</option>
              {TECHNICAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TECHNICAL_STATUS[s].label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(s) => s.id}
        caption="Porteurs du réseau"
        mobileFooter={(s) => (
          <>
            <Button asChild size="sm" variant="secondary">
              <a href={routes.player(s.id)} target="_blank" rel="noopener">
                <MonitorPlay aria-hidden="true" />
                Lecteur
                <span className="sr-only"> (nouvel onglet, chaque appel est journalisé)</span>
              </a>
            </Button>
            {canAct ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onEdit(s)}
                iconLeft={<Pencil aria-hidden="true" />}
              >
                Modifier
              </Button>
            ) : null}
          </>
        )}
        empty={
          filtered ? (
            <EmptyState
              compact
              icon={<Search />}
              title="Aucun résultat"
              description="Aucun Porteur ne correspond à ces filtres. Essayez de les élargir."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    setZoneFilter("");
                    setStatusFilter("");
                  }}
                >
                  Réinitialiser les filtres
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<MonitorSmartphone />}
              title="Aucun Porteur enregistré"
              description={
                data.zones.length === 0
                  ? "Créez d'abord une zone : chaque Porteur y est rattaché."
                  : "Ajoutez les Porteurs de chaque zone pour les rendre réservables."
              }
              action={
                canAct ? (
                  data.zones.length === 0 ? (
                    <Button variant="secondary" onClick={onGoToZones}>
                      Aller aux zones
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={onCreate}
                      iconLeft={<Plus aria-hidden="true" />}
                    >
                      Créer un Porteur
                    </Button>
                  )
                ) : undefined
              }
            />
          )
        }
      />
    </div>
  );
}
