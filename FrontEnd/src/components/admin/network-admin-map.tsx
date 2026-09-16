"use client";

import {
  Box,
  CircleDashed,
  ListChecks,
  LocateFixed,
  MapPinPlus,
  Move,
  Pencil,
  ScanSearch,
  TriangleAlert,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  checkNetworkCoherence,
  issuesFor,
  type CoherenceIssue,
} from "@/components/admin/network-coherence";
import { NetworkCoherencePanel } from "@/components/admin/network-coherence-panel";
import {
  buildMoveProposal,
  buildRadiusProposal,
  type MoveProposal,
  type RadiusProposal,
} from "@/components/admin/network-map-model";
import {
  formatCoordinates,
  supportFormAt,
  supportRequestFrom,
  zoneFormAt,
  zoneRequestFrom,
  type SupportFormValues,
  type ZoneFormValues,
} from "@/components/admin/network-schemas";
import { Porteur3dDialog } from "@/components/admin/porteur-3d-dialog";
import { NetworkMap, PorteurList } from "@/components/map";
import { PorteurCoordinates } from "@/components/map/porteur-coordinates";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supportsApi, zonesApi } from "@/lib/api/endpoints";
import type { SupportResponse, ZoneResponse } from "@/lib/api/types";
import { SUPPORT_TYPE_LABEL } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { formatCount } from "@/lib/format";
import { formatRadiusKm, suggestZoneForPoint, type LngLat } from "@/lib/network/geo";
import {
  DESIGN_INTENTION_NOTICE,
  formatMastHeight,
  INFERRED_TYPE_HINT,
  orientationLabel,
  PORTEUR_TYPES,
  resolvePorteurType,
} from "@/lib/network/porteur";

type Target = { kind: "support" | "zone"; id: number } | null;

export interface NetworkAdminMapProps {
  zones: ZoneResponse[];
  supports: SupportResponse[];
  canAct: boolean;
  /** Open the support form (edit). */
  onEditSupport: (support: SupportResponse) => void;
  /** Open the zone form (edit). */
  onEditZone: (zone: ZoneResponse) => void;
  /** « Placer un Porteur »: open the create form prefilled. */
  onCreateSupport: (values: SupportFormValues) => void;
  /** « Créer une zone »: open the create form prefilled. */
  onCreateZone: (values: ZoneFormValues) => void;
  /** After a successful PUT from the map (move / radius). */
  onSupportUpdated: (support: SupportResponse, message: string) => void;
  onZoneUpdated: (zone: ZoneResponse, message: string) => void;
  /** Deep link `?porteur=`: inspect and focus this Porteur on first render. */
  initialSupportId?: number | null;
  /** Deep link `?panneau=coherence`. */
  initialSideTab?: "inspecteur" | "coherence";
}

/**
 * Map-first view of /admin/reseau: NetworkMap (admin) + inspector and « Contrôle de cohérence ».
 * Place / create-zone tools open the forms prefilled; drag and radius handle go through a
 * confirmation dialog, then PUT. Everything is read-only unless `canAct` (ADMINISTRATEUR).
 */
export function NetworkAdminMap({
  zones,
  supports,
  canAct,
  onEditSupport,
  onEditZone,
  onCreateSupport,
  onCreateZone,
  onSupportUpdated,
  onZoneUpdated,
  initialSupportId = null,
  initialSideTab = "inspecteur",
}: NetworkAdminMapProps) {
  const deepLinked =
    initialSupportId !== null && supports.some((s) => s.id === initialSupportId)
      ? initialSupportId
      : null;
  const [target, setTarget] = useState<Target>(() =>
    deepLinked !== null ? { kind: "support", id: deepLinked } : null,
  );
  const [sideTab, setSideTab] = useState<"inspecteur" | "coherence">(initialSideTab);
  const [focusSupportId, setFocusSupportId] = useState<number | null>(deepLinked);
  const [focusZoneId, setFocusZoneId] = useState<number | null>(null);
  const [studioSupport, setStudioSupport] = useState<SupportResponse | null>(null);

  const [move, setMove] = useState<MoveProposal | null>(null);
  const [radius, setRadius] = useState<RadiusProposal | null>(null);
  const settleMove = useRef<(() => void) | null>(null);
  const settleRadius = useRef<(() => void) | null>(null);

  const report = useMemo(() => checkNetworkCoherence(zones, supports), [zones, supports]);

  const support =
    target?.kind === "support" ? (supports.find((s) => s.id === target.id) ?? null) : null;
  const zone = target?.kind === "zone" ? (zones.find((z) => z.id === target.id) ?? null) : null;

  /** Re-triggers the map focus even when the same id is requested twice. */
  const refocus = useCallback((kind: "support" | "zone", id: number) => {
    const set = kind === "support" ? setFocusSupportId : setFocusZoneId;
    set(null);
    window.requestAnimationFrame(() => set(id));
  }, []);

  const inspect = (kind: "support" | "zone", id: number) => {
    setTarget({ kind, id });
    setSideTab("inspecteur");
  };

  // ---- map callbacks --------------------------------------------------------------------
  const onPlacePoint = (p: LngLat) => {
    const suggested = suggestZoneForPoint(p, zones);
    onCreateSupport(supportFormAt(p, suggested?.id ?? null));
  };

  const onCreateZoneAt = (p: LngLat) => onCreateZone(zoneFormAt(p));

  const onMoveSupport = (id: number, p: LngLat) => {
    const s = supports.find((x) => x.id === id);
    if (!s) return;
    setTarget({ kind: "support", id });
    return new Promise<void>((resolve) => {
      settleMove.current = resolve;
      setMove(buildMoveProposal(s, p, zones));
    });
  };

  const onZoneRadiusChange = (zoneId: number, km: number) => {
    const z = zones.find((x) => x.id === zoneId);
    if (!z) return;
    const proposal = buildRadiusProposal(z, km, supports);
    if (proposal.fromKm !== null && Math.abs(proposal.fromKm - proposal.toKm) < 0.001) return;
    return new Promise<void>((resolve) => {
      settleRadius.current = resolve;
      setRadius(proposal);
    });
  };

  const closeMove = () => {
    setMove(null);
    settleMove.current?.();
    settleMove.current = null;
  };
  const closeRadius = () => {
    setRadius(null);
    settleRadius.current?.();
    settleRadius.current = null;
  };

  const confirmMove = async () => {
    if (!move) return;
    const saved = await supportsApi.update(
      move.support.id,
      supportRequestFrom(move.support, { latitude: move.to.lat, longitude: move.to.lng }),
    );
    onSupportUpdated(saved, `Porteur déplacé de ${move.distanceLabel}`);
  };

  const confirmRadius = async () => {
    if (!radius) return;
    const saved = await zonesApi.update(
      radius.zone.id,
      zoneRequestFrom(radius.zone, { radiusKm: radius.toKm }),
    );
    onZoneUpdated(saved, `Rayon de « ${saved.name} » : ${radius.toLabel}`);
  };

  // ---- coherence actions ------------------------------------------------------------------
  const locateIssue = (issue: CoherenceIssue) => {
    setTarget(issue.target);
    refocus(issue.target.kind, issue.target.id);
  };
  const fixIssue = (issue: CoherenceIssue) => {
    setTarget(issue.target);
    if (issue.target.kind === "support") {
      const s = supports.find((x) => x.id === issue.target.id);
      if (s) onEditSupport(s);
    } else {
      const z = zones.find((x) => x.id === issue.target.id);
      if (z) onEditZone(z);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-card border border-line bg-overlay-inset px-4 py-2.5 text-[0.8125rem] text-muted">
        {canAct ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <MapPinPlus aria-hidden="true" className="size-4 text-brand-orange-text" />« Placer un
              Porteur » ou « Créer une zone » dans la barre d&apos;outils, puis cliquez sur la carte
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Move aria-hidden="true" className="size-4 text-brand-orange-text" />
              Glissez un Porteur pour le déplacer (zoom rapproché)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CircleDashed aria-hidden="true" className="size-4 text-brand-orange-text" />
              Choisissez une zone pour ajuster son rayon
            </span>
          </>
        ) : (
          <span>
            Carte en lecture seule : les modifications sont réservées aux administrateurs.
          </span>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <NetworkMap
          mode="admin"
          zones={zones}
          supports={supports}
          height="clamp(30rem, 74vh, 54rem)"
          ariaLabel="Carte du réseau TPUB (administration)"
          focusSupportId={focusSupportId}
          focusZoneId={focusZoneId}
          activeZoneId={zone?.id ?? null}
          highlightSupportId={support?.id ?? null}
          onOpenPorteur={(id) => inspect("support", id)}
          onZoneClick={(id) => inspect("zone", id)}
          onPlacePoint={canAct ? onPlacePoint : undefined}
          onCreateZoneAt={canAct ? onCreateZoneAt : undefined}
          onMoveSupport={canAct ? onMoveSupport : undefined}
          onZoneRadiusChange={canAct ? onZoneRadiusChange : undefined}
        />

        <aside
          aria-label="Détails et contrôle du réseau"
          className="flex min-h-0 flex-col rounded-panel border border-line-strong bg-surface-2 p-4 lg:max-h-[clamp(30rem,74vh,54rem)]"
        >
          <Tabs
            value={sideTab}
            onValueChange={(v) => setSideTab(v === "coherence" ? "coherence" : "inspecteur")}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList aria-label="Panneau latéral" className="mx-0 w-full">
              <TabsTrigger
                value="inspecteur"
                icon={<ScanSearch />}
                className="flex-1 justify-center"
              >
                Inspecteur
              </TabsTrigger>
              <TabsTrigger
                value="coherence"
                icon={<ListChecks />}
                count={report.total}
                className="flex-1 justify-center"
              >
                Cohérence
              </TabsTrigger>
            </TabsList>
            <TabsContent value="inspecteur" className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              {support ? (
                <SupportInspector
                  support={support}
                  canAct={canAct}
                  issues={issuesFor(report, "support", support.id)}
                  onLocate={() => refocus("support", support.id)}
                  onEdit={() => onEditSupport(support)}
                  onStudio={() => setStudioSupport(support)}
                  onZone={() => inspect("zone", support.zoneId)}
                />
              ) : zone ? (
                <ZoneInspector
                  zone={zone}
                  supports={supports.filter((s) => s.zoneId === zone.id)}
                  canAct={canAct}
                  issues={issuesFor(report, "zone", zone.id)}
                  onLocate={() => refocus("zone", zone.id)}
                  onEdit={() => onEditZone(zone)}
                  onOpenSupport={(id) => inspect("support", id)}
                  onLocateSupport={(id) => refocus("support", id)}
                />
              ) : (
                <EmptyInspector
                  total={supports.length}
                  zones={zones.length}
                  issues={report.total}
                  onCoherence={() => setSideTab("coherence")}
                />
              )}
            </TabsContent>
            <TabsContent value="coherence" className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              <NetworkCoherencePanel
                report={report}
                canAct={canAct}
                activeKey={target ? `${target.kind}:${target.id}` : null}
                onLocate={locateIssue}
                onFix={fixIssue}
              />
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      <Porteur3dDialog
        support={studioSupport}
        onOpenChange={(open) => {
          if (!open) setStudioSupport(null);
        }}
        onEdit={
          canAct
            ? (s) => {
                setStudioSupport(null);
                onEditSupport(s);
              }
            : undefined
        }
      />

      {canAct ? (
        <>
          <ConfirmDialog
            open={move !== null}
            onOpenChange={(open) => {
              if (!open) closeMove();
            }}
            tone="primary"
            title={move ? `Déplacer « ${move.support.name} » ?` : "Déplacer le Porteur ?"}
            description="La nouvelle position est enregistrée immédiatement (PUT). Elle reste modifiable ensuite."
            confirmLabel="Déplacer"
            onConfirm={confirmMove}
          >
            {move ? (
              <div className="flex flex-col gap-3">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-card border border-line bg-overlay-inset px-4 py-3 text-[0.8125rem]">
                  <dt className="text-muted-2">Ancienne position</dt>
                  <dd className="text-ink-soft tabular">{move.fromLabel}</dd>
                  <dt className="text-muted-2">Nouvelle position</dt>
                  <dd className="text-ink-strong tabular">{move.toLabel}</dd>
                  <dt className="text-muted-2">Distance</dt>
                  <dd className="font-display font-semibold text-brand-orange-text tabular">
                    {move.distanceLabel}
                  </dd>
                </dl>
                {move.leavesZone ? (
                  <Alert tone="warning" live="none" title="Hors du rayon de la zone">
                    La nouvelle position sort du cercle de « {move.zone?.name} ».
                    {move.suggestedZone
                      ? ` Elle est dans « ${move.suggestedZone.name} » : pensez à réaffecter le Porteur via « Modifier ».`
                      : " Aucune zone ne contient ce point."}
                  </Alert>
                ) : null}
              </div>
            ) : null}
          </ConfirmDialog>

          <ConfirmDialog
            open={radius !== null}
            onOpenChange={(open) => {
              if (!open) closeRadius();
            }}
            tone="primary"
            title={
              radius ? `Modifier le rayon de « ${radius.zone.name} » ?` : "Modifier le rayon ?"
            }
            confirmLabel="Enregistrer le rayon"
            onConfirm={confirmRadius}
          >
            {radius ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-ink-soft">
                  Rayon actuel : <span className="tabular">{radius.fromLabel}</span> → nouveau rayon
                  :{" "}
                  <strong className="font-display text-brand-orange-text tabular">
                    {radius.toLabel}
                  </strong>
                </p>
                {radius.outside.length > 0 ? (
                  <Alert tone="warning" live="none" title="Porteurs hors du nouveau rayon">
                    {formatCount(
                      radius.outside.length,
                      "Porteur rattaché sortirait",
                      "Porteurs rattachés sortiraient",
                    )}{" "}
                    du cercle : {radius.outside.map((s) => s.name).join(", ")}.
                  </Alert>
                ) : null}
              </div>
            ) : null}
          </ConfirmDialog>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------
const smallAction =
  "inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap";

function IssueList({ issues }: { issues: CoherenceIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul aria-label="Points de cohérence" className="flex flex-col gap-1.5">
      {issues.map((i) => (
        <li
          key={i.key}
          className={cx(
            "flex gap-2 rounded-[12px] border px-3 py-2 text-[0.75rem] leading-snug",
            i.severity === "danger"
              ? "border-danger/30 bg-danger/8 text-danger"
              : i.severity === "warning"
                ? "border-warning/30 bg-warning/8 text-warning"
                : "border-info/30 bg-info/8 text-info",
          )}
        >
          <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span>
            {i.detail}
            {i.hint ? <span className="block text-muted">{i.hint}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SupportInspector({
  support,
  canAct,
  issues,
  onLocate,
  onEdit,
  onStudio,
  onZone,
}: {
  support: SupportResponse;
  canAct: boolean;
  issues: CoherenceIssue[];
  onLocate: () => void;
  onEdit: () => void;
  onStudio: () => void;
  onZone: () => void;
}) {
  const { type, inferred } = resolvePorteurType(support);
  const meta = PORTEUR_TYPES[type];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <span className="relative block h-24 w-16 shrink-0 overflow-hidden rounded-[12px] border border-line bg-[radial-gradient(circle_at_50%_30%,var(--color-surface-3),var(--color-bg))]">
          <Image src={meta.image} alt="" fill sizes="64px" className="object-contain p-1" />
        </span>
        <div className="min-w-0">
          <p className="font-label text-xs font-medium text-muted">Porteur n° {support.id}</p>
          <h3 className="mt-0.5 font-display text-base leading-snug font-semibold break-words text-ink-strong">
            {support.name}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={meta.tone} size="sm">
              Type {type} · {meta.name}
            </Badge>
            {inferred ? (
              <Badge tone="neutral" size="sm" title={INFERRED_TYPE_HINT}>
                Typologie estimée
              </Badge>
            ) : null}
            <StatusPill type="support" status={support.technicalStatus} size="sm" />
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[0.8125rem]">
        <dt className="text-muted-2">Zone</dt>
        <dd>
          <button
            type="button"
            onClick={onZone}
            className="text-left text-brand-blue-text hover:underline focus-visible:outline-2 focus-visible:outline-brand-blue-text"
          >
            {support.zoneName}
          </button>
        </dd>
        <dt className="text-muted-2">Support</dt>
        <dd className="text-ink-soft">{SUPPORT_TYPE_LABEL[support.supportType]}</dd>
        <dt className="text-muted-2">Hauteur</dt>
        <dd className="text-ink-soft">{formatMastHeight(support.mastHeightM) ?? "Non déclarée"}</dd>
        <dt className="text-muted-2">Orientation</dt>
        <dd className="text-ink-soft">
          {type === "D"
            ? "Sans écran"
            : (orientationLabel(support.headingDeg, type) ?? "Non déclarée")}
          {support.headingDeg != null && type !== "D" ? (
            <span className="text-muted-2 tabular"> ({support.headingDeg}°)</span>
          ) : null}
        </dd>
        <dt className="text-muted-2">Adresse</dt>
        <dd className="break-words text-ink-soft">{support.address || "Non renseignée"}</dd>
      </dl>

      <div className="rounded-card border border-line bg-overlay-inset px-3 py-2.5">
        <p className="mb-1.5 font-label text-xs font-medium text-muted">Position exacte</p>
        <PorteurCoordinates
          latitude={support.latitude}
          longitude={support.longitude}
          name={support.name}
        />
      </div>

      <IssueList issues={issues} />

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          className={smallAction}
          onClick={onLocate}
          iconLeft={<LocateFixed aria-hidden="true" />}
        >
          Localiser
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className={smallAction}
          onClick={onStudio}
          iconLeft={<Box aria-hidden="true" />}
        >
          Voir en 3D
        </Button>
        {canAct ? (
          <Button
            size="sm"
            variant="primary"
            className={smallAction}
            onClick={onEdit}
            iconLeft={<Pencil aria-hidden="true" />}
          >
            Modifier
          </Button>
        ) : null}
      </div>
      <p className="text-xs leading-relaxed text-muted-2">{DESIGN_INTENTION_NOTICE}</p>
    </div>
  );
}

function ZoneInspector({
  zone,
  supports,
  canAct,
  issues,
  onLocate,
  onEdit,
  onOpenSupport,
  onLocateSupport,
}: {
  zone: ZoneResponse;
  supports: SupportResponse[];
  canAct: boolean;
  issues: CoherenceIssue[];
  onLocate: () => void;
  onEdit: () => void;
  onOpenSupport: (id: number) => void;
  onLocateSupport: (id: number) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-label text-xs font-medium text-muted">Zone n° {zone.id}</p>
        <h3 className="mt-0.5 font-display text-base font-semibold break-words text-ink-strong">
          {zone.name}
        </h3>
        <div className="mt-2">
          {zone.isActive ? (
            <Badge tone="success" dot size="sm">
              Active
            </Badge>
          ) : (
            <Badge tone="muted" dot size="sm">
              Inactive
            </Badge>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[0.8125rem]">
        <dt className="text-muted-2">Centre</dt>
        <dd className="text-ink-soft tabular">
          {formatCoordinates(zone.latitude, zone.longitude)}
        </dd>
        <dt className="text-muted-2">Rayon</dt>
        <dd className="text-ink-soft tabular">
          {zone.radiusKm !== null ? formatRadiusKm(zone.radiusKm) : "Non défini"}
        </dd>
        <dt className="text-muted-2">Porteurs</dt>
        <dd className="text-ink-soft tabular">{supports.length}</dd>
      </dl>
      {canAct && zone.radiusKm !== null ? (
        <p className="flex gap-1.5 text-[0.75rem] leading-snug text-muted">
          <CircleDashed
            aria-hidden="true"
            className="mt-px size-3.5 shrink-0 text-brand-blue-text"
          />
          Glissez la poignée bleue du cercle, ou placez-y le focus et utilisez les flèches puis
          Entrée, pour ajuster le rayon. Une confirmation est demandée avant l&apos;enregistrement.
        </p>
      ) : null}
      <IssueList issues={issues} />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          className={smallAction}
          onClick={onLocate}
          iconLeft={<LocateFixed aria-hidden="true" />}
        >
          Localiser
        </Button>
        {canAct ? (
          <Button
            size="sm"
            variant="primary"
            className={smallAction}
            onClick={onEdit}
            iconLeft={<Pencil aria-hidden="true" />}
          >
            Modifier
          </Button>
        ) : null}
      </div>
      <div>
        <p className="mb-2 font-label text-[0.75rem] font-semibold text-ink-strong">
          Porteurs rattachés
        </p>
        <PorteurList
          dense
          label={`Porteurs de la zone ${zone.name}`}
          items={supports.map((s) => ({ support: s }))}
          onLocate={onLocateSupport}
          onOpen={onOpenSupport}
          emptyText="Aucun Porteur rattaché à cette zone."
        />
      </div>
    </div>
  );
}

function EmptyInspector({
  total,
  zones,
  issues,
  onCoherence,
}: {
  total: number;
  zones: number;
  issues: number;
  onCoherence: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 py-2">
      <p className="text-sm leading-relaxed text-ink-soft">
        Choisissez un Porteur ou une zone sur la carte pour afficher sa fiche, le voir en 3D ou le
        modifier.
      </p>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line text-center">
        <div className="bg-surface px-3 py-3">
          <dt className="text-[0.75rem] text-muted">Porteurs</dt>
          <dd className="font-display text-xl font-semibold text-ink-strong tabular">{total}</dd>
        </div>
        <div className="bg-surface px-3 py-3">
          <dt className="text-[0.75rem] text-muted">Zones</dt>
          <dd className="font-display text-xl font-semibold text-ink-strong tabular">{zones}</dd>
        </div>
      </dl>
      {issues > 0 ? (
        <Button
          variant="secondary"
          onClick={onCoherence}
          iconLeft={<ListChecks aria-hidden="true" />}
        >
          {formatCount(issues, "point de cohérence à traiter", "points de cohérence à traiter")}
        </Button>
      ) : (
        <p className="text-[0.8125rem] text-success">Aucune incohérence détectée.</p>
      )}
    </div>
  );
}
