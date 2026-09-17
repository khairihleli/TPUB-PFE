"use client";

import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  CircleCheck,
  Crosshair,
  MapPinPlus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { type Ref, useEffect, useMemo, useRef, useState } from "react";

import {
  availabilityMap,
  batchConflictMessages,
  campaignWindow,
  circleFromRecommendation,
  circleIndexOfMapId,
  circleMapId,
  circleName,
  circlesAsMapZones,
  circlesFromZones,
  DEFAULT_RADIUS_KM,
  type DraftCircle,
  filterByAvailability,
  filterByType,
  isSelectable,
  MAX_CIRCLES,
  newCircleKey,
  RADIUS_MAX_KM,
  RADIUS_MIN_KM,
  RADIUS_STEP_KM,
  roundCoordinate,
  sameCircles,
  selectionTotals,
  snapRadius,
  sortAvailability,
  statusCounts,
  summaryParts,
  toZoneRequests,
  windowKey,
  alternativeLabel,
  presentTypes,
} from "@/components/campaign/zone-model";
import { loadScreenCatalogue } from "@/components/campaign/campaign-data";
import { SUPPORT_TYPE_ICON } from "@/components/campaign/campaign-ui";
import { WizardStepHeading } from "@/components/campaign/wizard-chrome";
import { AvailabilityLegend, NetworkMap } from "@/components/map";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { EstimateTag } from "@/components/ui/estimate-tag";
import { Field, Input } from "@/components/ui/field";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { ESTIMATE_COST_RULE } from "@/content/glossary";
import { availabilityApi, campaignsApi, reservationsApi, zonesApi } from "@/lib/api/endpoints";
import { batchConflicts, presentError } from "@/lib/api/errors";
import type {
  AlternativeSlot,
  CampaignResponse,
  SupportAvailabilityItem,
  SupportType,
} from "@/lib/api/types";
import { AVAILABILITY_STATUS, SUPPORT_TYPE_LABEL } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { useUnsavedChangesGuard } from "@/lib/forms/unsaved-guard";
import { formatCount, formatDateRange, formatNumber, formatTND } from "@/lib/format";
import { invalidate, resourceKeys } from "@/lib/resource-cache";
import { formatSlot } from "@/lib/time-slots";
import { useResource } from "@/lib/use-resource";

export interface StepZonesProps {
  campaign: CampaignResponse;
  /** Campaign updated here (zones saved, alternative window applied). */
  onCampaignChange: (campaign: CampaignResponse) => void;
  /** Reservations created or cancelled: the wizard reloads them. */
  onReservationsChange: () => void;
  onBack: () => void;
  onNext: () => void;
  /** Opens « Détails » (period and créneau). */
  onEditDetails: () => void;
  /** Unsaved circles or unbooked selection (the wizard blocks leaving the step). */
  onPendingChange?: (pending: number) => void;
  headingRef?: Ref<HTMLHeadingElement>;
}

function zonesSignature(campaign: CampaignResponse): string {
  return (campaign.zones ?? [])
    .map((z) => `${z.id}:${z.latitude}:${z.longitude}:${z.radiusKm}`)
    .join("|");
}

/**
 * Wizard step 3 « Zone & Porteurs » (contract §5 F2): circles placed on the map (≤ 5, radius
 * slider), availability of the Porteurs inside them for the campaign window, batch booking,
 * cancellation, alternative slots when saturated and recommended zones.
 */
export function StepZones({
  campaign,
  onCampaignChange,
  onReservationsChange,
  onBack,
  onNext,
  onEditDetails,
  onPendingChange,
  headingRef,
}: StepZonesProps) {
  const { toast } = useToast();
  const win = useMemo(() => campaignWindow(campaign), [campaign]);
  const savedCircles = useMemo(() => circlesFromZones(campaign.zones), [campaign.zones]);

  // ---- circles -------------------------------------------------------------------------
  const [circles, setCircles] = useState<DraftCircle[]>(savedCircles);
  const [activeKey, setActiveKey] = useState<string | null>(savedCircles[0]?.key ?? null);
  const [placing, setPlacing] = useState(savedCircles.length === 0);
  const [focusZoneId, setFocusZoneId] = useState<number | null>(null);
  const [savingZones, setSavingZones] = useState(false);
  const [zonesError, setZonesError] = useState<string | null>(null);
  const [seenSaved, setSeenSaved] = useState(savedCircles);
  if (seenSaved !== savedCircles) {
    // The campaign's zones changed from outside (save, reload): adopt them.
    setSeenSaved(savedCircles);
    setCircles(savedCircles);
    setActiveKey((k) =>
      savedCircles.some((c) => c.key === k) ? k : (savedCircles[0]?.key ?? null),
    );
  }
  const zonesDirty = !sameCircles(circles, savedCircles);
  const activeIndex = circles.findIndex((c) => c.key === activeKey);
  const active = activeIndex >= 0 ? circles[activeIndex] : null;

  const updateCircle = (key: string, patch: Partial<DraftCircle>) =>
    setCircles((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const addCircle = (circle: DraftCircle) => {
    setCircles((list) => (list.length >= MAX_CIRCLES ? list : [...list, circle]));
    setActiveKey(circle.key);
    setPlacing(false);
  };

  const onMapClick = (point: { lat: number; lng: number }) => {
    if (placing || circles.length === 0) {
      if (circles.length >= MAX_CIRCLES) return;
      addCircle({
        key: newCircleKey(),
        latitude: roundCoordinate(point.lat),
        longitude: roundCoordinate(point.lng),
        radiusKm: active?.radiusKm ?? DEFAULT_RADIUS_KM,
        label: null,
      });
      return;
    }
    if (active) {
      updateCircle(active.key, {
        latitude: roundCoordinate(point.lat),
        longitude: roundCoordinate(point.lng),
      });
    }
  };

  const removeCircle = (key: string) => {
    setCircles((list) => {
      const next = list.filter((c) => c.key !== key);
      if (activeKey === key) setActiveKey(next[0]?.key ?? null);
      if (next.length === 0) setPlacing(true);
      return next;
    });
  };

  const saveZones = async () => {
    if (savingZones || circles.length === 0) return;
    setSavingZones(true);
    setZonesError(null);
    try {
      const res = await campaignsApi.setZones(campaign.id, toZoneRequests(circles));
      invalidate(resourceKeys.campaignsMine);
      invalidate(resourceKeys.reservationsByCampaign(campaign.id));
      onCampaignChange({ ...campaign, zones: res.zones });
      const cancelled = res.cancelledReservationIds.length;
      toast({
        title: "Zones enregistrées",
        description:
          cancelled > 0
            ? `${formatCount(cancelled, "réservation libérée", "réservations libérées")} : Porteur hors des nouvelles zones.`
            : undefined,
        variant: cancelled > 0 ? "warning" : "success",
      });
      if (cancelled > 0) onReservationsChange();
    } catch (e) {
      setZonesError(presentError(e).message);
    } finally {
      setSavingZones(false);
    }
  };

  // ---- data ----------------------------------------------------------------------------
  const catalogue = useResource("wizard-screen-catalogue", loadScreenCatalogue);
  const [types, setTypes] = useState<SupportType[]>([]);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const typesKey = types.join(",");
  const hasSavedZones = savedCircles.length > 0;
  const availability = useResource(
    win && hasSavedZones
      ? `availability:${campaign.id}:${windowKey(win)}:${zonesSignature(campaign)}:${typesKey}`
      : null,
    (signal) =>
      availabilityApi.search(
        {
          ...(win as NonNullable<typeof win>),
          campaignId: campaign.id,
          supportType: types,
        },
        { signal },
      ),
  );
  const recommendations = useResource(
    win ? `zones-reco:${windowKey(win)}:${typesKey}` : null,
    (signal) => zonesApi.recommendations({ ...(win ?? {}), supportType: types, limit: 3, signal }),
  );

  // ---- selection & booking -------------------------------------------------------------
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [outcomes, setOutcomes] = useState<Map<number, string>>(() => new Map());
  const [booking, setBooking] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [applyingAlt, setApplyingAlt] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  const items = useMemo(
    () =>
      sortAvailability(
        filterByAvailability(filterByType(availability.data?.supports ?? [], types), onlyAvailable),
      ),
    [availability.data, types, onlyAvailable],
  );
  // Drop selected ids that are no longer bookable after a refresh.
  const selectableIds = useMemo(
    () => new Set(items.filter(isSelectable).map((i) => i.support.id)),
    [items],
  );
  const effectiveSelection = useMemo(
    () => new Set([...selected].filter((id) => selectableIds.has(id))),
    [selected, selectableIds],
  );
  const totals = selectionTotals(items, effectiveSelection);
  const pending = effectiveSelection.size + (zonesDirty ? 1 : 0);

  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);
  useEffect(() => () => onPendingChange?.(0), [onPendingChange]);
  useUnsavedChangesGuard({
    dirty: pending > 0 || booking || savingZones,
    message: "Des zones ou des Porteurs sélectionnés ne sont pas enregistrés.",
  });

  const toggle = (id: number, on?: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const want = on ?? !next.has(id);
      if (want) next.add(id);
      else next.delete(id);
      return next;
    });

  const book = async () => {
    const supportIds = [...effectiveSelection];
    if (booking || supportIds.length === 0) return;
    setBooking(true);
    setBookError(null);
    setOutcomes(new Map());
    try {
      const created = await reservationsApi.createBatch({ campaignId: campaign.id, supportIds });
      setSelected(new Set());
      invalidate(resourceKeys.campaignsMine);
      invalidate(resourceKeys.reservationsByCampaign(campaign.id));
      setAnnounce(`${formatCount(created.length, "Porteur réservé", "Porteurs réservés")}.`);
      toast({
        title: formatCount(created.length, "Porteur réservé", "Porteurs réservés"),
        description: "Ils restent bloqués pour cette campagne jusqu'à la décision de TPUB.",
        variant: "success",
      });
      onReservationsChange();
      availability.reload();
    } catch (e) {
      const conflicts = batchConflictMessages(batchConflicts(e));
      if (conflicts.size > 0) {
        setOutcomes(conflicts);
        setBookError(
          `${formatCount(conflicts.size, "Porteur n'est plus disponible", "Porteurs ne sont plus disponibles")} : aucune réservation n'a été faite. Retirez-les puis réessayez.`,
        );
        availability.reload();
      } else {
        setBookError(presentError(e).message);
      }
    } finally {
      setBooking(false);
    }
  };

  const cancelReservation = async (item: SupportAvailabilityItem) => {
    if (item.campaignReservationId === null || cancellingId !== null) return;
    setCancellingId(item.support.id);
    try {
      await reservationsApi.cancel(item.campaignReservationId, "Annulée par l'annonceur");
      invalidate(resourceKeys.campaignsMine);
      invalidate(resourceKeys.reservationsByCampaign(campaign.id));
      toast({ title: `Réservation annulée : ${item.support.name}`, variant: "success" });
      onReservationsChange();
      availability.reload();
    } catch (e) {
      toast({
        title: "Annulation impossible",
        description: presentError(e).message,
        variant: "danger",
      });
    } finally {
      setCancellingId(null);
    }
  };

  const applyAlternative = async (alt: AlternativeSlot) => {
    const key = `${alt.startDate}-${alt.startTime}`;
    if (applyingAlt) return;
    setApplyingAlt(key);
    try {
      const updated = await campaignsApi.update(campaign.id, {
        name: campaign.name,
        objective: campaign.objective,
        budget: campaign.budget,
        startDate: alt.startDate,
        endDate: alt.endDate,
        startTime: alt.startTime,
        endTime: alt.endTime,
      });
      invalidate(resourceKeys.campaignsMine);
      onCampaignChange(updated);
      if ((updated.reservationsCount ?? 0) < (campaign.reservationsCount ?? 0)) {
        onReservationsChange();
      }
      toast({
        title: "Créneau mis à jour",
        description: `${formatSlot(alt.startTime, alt.endTime)} · ${formatDateRange(alt.startDate, alt.endDate, "medium")}`,
        variant: "success",
      });
    } catch (e) {
      toast({
        title: "Changement impossible",
        description: presentError(e).message,
        variant: "danger",
      });
    } finally {
      setApplyingAlt(null);
    }
  };

  // ---- render --------------------------------------------------------------------------
  const mapZones = useMemo(() => circlesAsMapZones(circles), [circles]);
  const mapSupports = useMemo(() => {
    const byId = new Map((catalogue.data?.network ?? []).map((s) => [s.id, s]));
    for (const i of availability.data?.supports ?? []) byId.set(i.support.id, i.support);
    return [...byId.values()];
  }, [catalogue.data, availability.data]);
  const markerStatus = useMemo(
    () => availabilityMap(availability.data?.supports ?? []),
    [availability.data],
  );
  const allTypes = useMemo(() => presentTypes(catalogue.data?.network ?? []), [catalogue.data]);
  const counts = statusCounts(availability.data?.supports ?? []);
  const summary = availability.data?.summary ?? null;
  const alternatives = availability.data?.alternatives ?? [];
  const rowRefs = useRef(new Map<number, HTMLLIElement>());
  const reservedCount = items.filter((i) => i.reservedByCampaign).length;

  const nextReason = zonesDirty
    ? "Enregistrez d'abord vos zones."
    : effectiveSelection.size > 0
      ? "Réservez ou désélectionnez les Porteurs choisis."
      : null;

  return (
    <div>
      <WizardStepHeading
        step={3}
        title="Zone & Porteurs"
        lede="Cliquez sur la carte pour placer votre zone, ajustez son rayon, puis réservez les Porteurs disponibles sur votre période et votre créneau."
        headingRef={headingRef}
      />
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-line bg-surface px-4 py-2.5 text-[0.875rem]">
        <span className="text-muted">Votre fenêtre</span>
        <span className="font-medium whitespace-nowrap text-ink-soft tabular">
          {formatDateRange(campaign.startDate, campaign.endDate, "medium")}
        </span>
        <span className="whitespace-nowrap text-ink-soft">
          {formatSlot(campaign.startTime, campaign.endTime)}
        </span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onEditDetails}>
          Modifier la période
        </Button>
      </div>

      {!win ? (
        <Alert tone="warning" live="none" className="mb-5" title="Période incomplète">
          Renseignez les dates et le créneau à l&apos;étape Détails pour voir les disponibilités.
        </Alert>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Map + circles */}
        <section aria-labelledby="zones-titre" className="flex min-w-0 flex-col gap-4">
          <h3 id="zones-titre" className="sr-only">
            Zones ciblées
          </h3>
          <NetworkMap
            mode="admin"
            chrome="compact"
            zones={mapZones}
            supports={mapSupports}
            availability={markerStatus}
            activeZoneId={active ? circleMapId(activeIndex) : null}
            focusZoneId={focusZoneId}
            height="clamp(22rem, 60vh, 36rem)"
            ariaLabel="Carte de ciblage : cliquez pour placer ou déplacer la zone"
            onMapClick={onMapClick}
            onZoneRadiusChange={(zoneId, km) => {
              const index = circleIndexOfMapId(zoneId);
              const target = index === null ? undefined : circles[index];
              if (target) updateCircle(target.key, { radiusKm: snapRadius(km) });
            }}
            onOpenPorteur={(supportId) => {
              if (selectableIds.has(supportId)) toggle(supportId);
              rowRefs.current.get(supportId)?.scrollIntoView?.({ block: "nearest" });
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-[0.8125rem] text-muted">
              <Crosshair aria-hidden="true" className="size-4 shrink-0 text-brand-orange-text" />
              {placing || circles.length === 0
                ? "Cliquez sur la carte pour placer une zone."
                : `Cliquez sur la carte pour déplacer « ${active ? circleName(active, activeIndex) : ""} ».`}
            </p>
            <AvailabilityLegend counts={availability.data ? counts : undefined} />
          </div>

          {circles.length > 0 ? (
            <ul aria-label="Zones de la campagne" className="flex flex-col gap-3">
              {circles.map((c, i) => {
                const isActive = c.key === activeKey;
                const sliderId = `rayon-${c.key}`;
                return (
                  <li
                    key={c.key}
                    className={cx(
                      "rounded-card border p-4",
                      isActive
                        ? "border-brand-blue-text/50 bg-blue-soft/40"
                        : "border-line bg-surface",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant={isActive ? "secondary" : "ghost"}
                        size="sm"
                        aria-pressed={isActive}
                        onClick={() => {
                          setActiveKey(c.key);
                          setPlacing(false);
                          setFocusZoneId(null);
                          requestAnimationFrame(() => setFocusZoneId(circleMapId(i)));
                        }}
                      >
                        {circleName(c, i)}
                      </Button>
                      <span className="text-[0.8125rem] text-muted tabular">
                        {c.latitude.toFixed(4)}, {c.longitude.toFixed(4)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        iconLeft={<Trash2 aria-hidden="true" />}
                        onClick={() => removeCircle(c.key)}
                      >
                        Retirer<span className="sr-only"> : {circleName(c, i)}</span>
                      </Button>
                    </div>
                    <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <label
                          htmlFor={sliderId}
                          className="flex items-baseline justify-between font-label text-[0.8125rem] font-medium text-ink-soft"
                        >
                          Rayon
                          <span className="text-ink-strong tabular">
                            {formatNumber(c.radiusKm)} km
                          </span>
                        </label>
                        <input
                          id={sliderId}
                          type="range"
                          min={RADIUS_MIN_KM}
                          max={RADIUS_MAX_KM}
                          step={RADIUS_STEP_KM}
                          value={c.radiusKm}
                          aria-valuetext={`${formatNumber(c.radiusKm)} kilomètres`}
                          onChange={(e) =>
                            updateCircle(c.key, { radiusKm: snapRadius(Number(e.target.value)) })
                          }
                          className="w-full accent-[var(--color-brand-blue)]"
                        />
                      </div>
                      <Field label="Nom (facultatif)" id={`nom-${c.key}`}>
                        <Input
                          value={c.label ?? ""}
                          maxLength={150}
                          placeholder={`Zone ${i + 1}`}
                          onChange={(e) => updateCircle(c.key, { label: e.target.value || null })}
                        />
                      </Field>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<MapPinPlus aria-hidden="true" />}
              aria-pressed={placing}
              disabledReason={
                circles.length >= MAX_CIRCLES ? `${MAX_CIRCLES} zones maximum.` : null
              }
              onClick={() => setPlacing((p) => !p)}
            >
              {placing ? "Cliquez sur la carte…" : "Ajouter une zone"}
            </Button>
            {zonesDirty ? (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  loading={savingZones}
                  loadingLabel="Enregistrement des zones"
                  iconLeft={<Save aria-hidden="true" />}
                  disabledReason={circles.length === 0 ? "Placez au moins une zone." : null}
                  onClick={() => void saveZones()}
                >
                  Enregistrer les zones
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft={<RotateCcw aria-hidden="true" />}
                  onClick={() => {
                    setCircles(savedCircles);
                    setActiveKey(savedCircles[0]?.key ?? null);
                    setPlacing(savedCircles.length === 0);
                  }}
                >
                  Annuler les modifications
                </Button>
              </>
            ) : null}
          </div>
          {zonesDirty && hasSavedZones ? (
            <p className="text-[0.8125rem] text-muted">
              Les réservations des Porteurs situés hors des nouvelles zones seront libérées à
              l&apos;enregistrement.
            </p>
          ) : null}
          {zonesError ? (
            <Alert tone="danger" title="Zones non enregistrées">
              {zonesError}
            </Alert>
          ) : null}
        </section>

        {/* Recommendations */}
        <aside aria-labelledby="reco-titre" className="flex min-w-0 flex-col gap-3">
          <h3
            id="reco-titre"
            className="flex items-center gap-2 font-display text-[1rem] font-semibold text-ink-strong"
          >
            <Sparkles aria-hidden="true" className="size-4 text-brand-orange-text" />
            Zones recommandées
          </h3>
          {!win ? (
            <p className="text-[0.8125rem] text-muted">
              Disponible une fois la période renseignée.
            </p>
          ) : recommendations.error && !recommendations.data ? (
            <ErrorState
              error={recommendations.error}
              onRetry={recommendations.reload}
              scope="section"
            />
          ) : !recommendations.data ? (
            <LoadingRegion label="Chargement des recommandations…" className="flex flex-col gap-2">
              <Skeleton className="h-24 rounded-card" />
              <Skeleton className="h-24 rounded-card" />
            </LoadingRegion>
          ) : recommendations.data.length === 0 ? (
            <p className="rounded-card border border-dashed border-line-strong px-4 py-5 text-[0.8125rem] text-muted">
              Aucune zone n&apos;a de Porteur disponible sur cette fenêtre.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {recommendations.data.map((rec) => (
                <li key={rec.zone.id} className="rounded-card border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-label text-[0.9375rem] font-semibold text-ink-strong">
                      {rec.zone.name}
                    </p>
                    <Badge tone="brand" size="sm">
                      Score {rec.score}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[0.8125rem] text-ink-soft tabular">
                    {rec.availableSupports}/{rec.totalSupports} Porteurs disponibles ·{" "}
                    {formatNumber(rec.estimatedViewsAvailable)} affichages ·{" "}
                    {formatTND(rec.estimatedCostAvailable)}
                  </p>
                  {rec.reasons.length > 0 ? (
                    <ul className="mt-2 flex flex-col gap-0.5 text-[0.75rem] text-muted">
                      {rec.reasons.map((r) => (
                        <li key={r}>• {r}</li>
                      ))}
                    </ul>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    disabledReason={
                      circles.length >= MAX_CIRCLES ? `${MAX_CIRCLES} zones maximum.` : null
                    }
                    onClick={() => {
                      const circle = circleFromRecommendation(rec, catalogue.data?.network ?? []);
                      const index = circles.length;
                      addCircle(circle);
                      setFocusZoneId(null);
                      requestAnimationFrame(() => setFocusZoneId(circleMapId(index)));
                    }}
                  >
                    Cibler cette zone<span className="sr-only"> : {rec.zone.name}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {/* Porteurs */}
      <section aria-labelledby="porteurs-titre" className="mt-8 flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h3
              id="porteurs-titre"
              className="font-display text-[1.0625rem] font-semibold text-ink-strong"
            >
              Porteurs dans vos zones
            </h3>
            {summary ? (
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[0.875rem] text-ink-soft tabular">
                <span className="font-semibold text-ink-strong">
                  {summaryParts(summary).available}
                </span>
                <span aria-hidden="true">·</span>
                <span>{summaryParts(summary).views}</span>
                <span aria-hidden="true">·</span>
                <span>{formatTND(summary.estimatedCostAvailable)}</span>
                <EstimateTag rule={ESTIMATE_COST_RULE} />
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              aria-pressed={onlyAvailable}
              onClick={() => setOnlyAvailable((v) => !v)}
              className={cx(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text",
                onlyAvailable
                  ? "border-brand-blue-text bg-blue-soft text-ink-strong"
                  : "border-line-strong text-ink-soft hover:border-muted-2",
              )}
            >
              <CircleCheck aria-hidden="true" className="size-4" />
              Disponibles uniquement
            </button>
            {allTypes.length > 1 ? (
              <div
                role="group"
                aria-label="Filtrer par type de Porteur"
                className="flex flex-wrap gap-1.5"
              >
                {allTypes.map((t) => {
                  const on = types.includes(t);
                  const Icon = SUPPORT_TYPE_ICON[t];
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setTypes((list) => (on ? list.filter((x) => x !== t) : [...list, t]))
                      }
                      className={cx(
                        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text",
                        on
                          ? "border-brand-blue-text bg-blue-soft text-ink-strong"
                          : "border-line-strong text-ink-soft hover:border-muted-2",
                      )}
                    >
                      <Icon aria-hidden="true" className="size-4" />
                      {SUPPORT_TYPE_LABEL[t]}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        {!hasSavedZones ? (
          <EmptyState
            compact
            icon={<MapPinPlus />}
            title="Aucune zone enregistrée"
            description="Placez une zone sur la carte puis enregistrez-la pour voir les Porteurs disponibles."
          />
        ) : !win ? null : availability.error && !availability.data ? (
          <ErrorState error={availability.error} onRetry={availability.reload} scope="section" />
        ) : !availability.data ? (
          <LoadingRegion label="Chargement des disponibilités…" className="flex flex-col gap-2">
            <Skeleton className="h-16 rounded-card" />
            <Skeleton className="h-16 rounded-card" />
          </LoadingRegion>
        ) : (
          <>
            {summary && summary.availableSupports === 0 ? (
              <Alert
                tone="warning"
                live="none"
                title={
                  reservedCount > 0
                    ? "Plus aucun autre Porteur disponible"
                    : "Zone saturée sur ce créneau"
                }
              >
                {alternatives.length > 0 ? (
                  <>
                    <p>Ces créneaux alternatifs ont des Porteurs disponibles :</p>
                    <ul aria-label="Créneaux alternatifs" className="mt-2 flex flex-wrap gap-2">
                      {alternatives.map((alt) => {
                        const key = `${alt.startDate}-${alt.startTime}`;
                        return (
                          <li key={key}>
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={applyingAlt === key}
                              loadingLabel="Application du créneau"
                              disabled={applyingAlt !== null && applyingAlt !== key}
                              onClick={() => void applyAlternative(alt)}
                            >
                              {alternativeLabel(alt)}
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : (
                  "Élargissez le rayon, ajoutez une zone ou changez de période."
                )}
              </Alert>
            ) : null}

            {items.length === 0 ? (
              <p className="rounded-card border border-dashed border-line-strong px-5 py-6 text-center text-[0.875rem] text-muted">
                Aucun Porteur{onlyAvailable ? " disponible" : ""} dans vos zones
                {types.length > 0 ? " pour ces types" : ""}.
              </p>
            ) : (
              <ul
                aria-label="Porteurs dans les zones"
                className="divide-y divide-line overflow-hidden rounded-card border border-line"
              >
                {items.map((item) => {
                  const s = item.support;
                  const meta = AVAILABILITY_STATUS[item.status];
                  const selectable = isSelectable(item);
                  const checked = effectiveSelection.has(s.id);
                  const outcome = outcomes.get(s.id);
                  const Icon = SUPPORT_TYPE_ICON[s.supportType];
                  const statusId = `dispo-${s.id}`;
                  return (
                    <li
                      key={s.id}
                      ref={(el) => {
                        if (el) rowRefs.current.set(s.id, el);
                        else rowRefs.current.delete(s.id);
                      }}
                      className={cx(
                        "grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 bg-surface px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center",
                        checked && "bg-blue-soft/50",
                        outcome && "bg-danger/[0.04]",
                      )}
                    >
                      <span className="flex items-center pt-0.5">
                        {selectable ? (
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={booking}
                            onChange={(e) => toggle(s.id, e.target.checked)}
                            aria-label={`Sélectionner ${s.name}`}
                            aria-describedby={statusId}
                            className="size-5 accent-[var(--color-brand-blue)]"
                          />
                        ) : (
                          <Icon aria-hidden="true" className="size-5 text-muted" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="font-label text-[0.9375rem] font-semibold break-words text-ink-strong">
                          {s.name}
                        </p>
                        <p className="text-[0.8125rem] text-muted">
                          {SUPPORT_TYPE_LABEL[s.supportType]} · {s.zoneName}
                          {item.distanceKm !== null
                            ? ` · ${formatNumber(Math.round(item.distanceKm * 10) / 10)} km`
                            : ""}
                        </p>
                        <p
                          id={statusId}
                          className="mt-1 flex flex-wrap items-center gap-2 text-[0.8125rem]"
                        >
                          {item.reservedByCampaign ? (
                            <Badge tone="success" size="sm" dot>
                              Réservé pour cette campagne
                            </Badge>
                          ) : (
                            <Badge tone={meta.tone} size="sm" dot title={meta.description}>
                              {meta.label}
                            </Badge>
                          )}
                          <span className="text-muted tabular">
                            {formatNumber(item.estimatedViews)} affichages ·{" "}
                            {formatTND(item.estimatedCost)}
                          </span>
                          {!item.reservedByCampaign &&
                          item.status !== "DISPONIBLE" &&
                          item.conflicts.length > 0 ? (
                            <span className="text-muted">
                              {formatCount(item.conflicts.length, "occupation", "occupations")} sur
                              la fenêtre
                            </span>
                          ) : null}
                        </p>
                        {outcome ? (
                          <p className="mt-1 flex gap-1.5 text-[0.8125rem] text-danger">
                            <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                            {outcome}
                          </p>
                        ) : null}
                      </div>
                      {item.reservedByCampaign && item.campaignReservationId !== null ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="col-span-2 justify-self-start sm:col-span-1 sm:justify-self-end"
                          iconLeft={<X aria-hidden="true" />}
                          loading={cancellingId === s.id}
                          loadingLabel="Annulation"
                          disabled={cancellingId !== null && cancellingId !== s.id}
                          onClick={() => void cancelReservation(item)}
                        >
                          Annuler<span className="sr-only"> la réservation de {s.name}</span>
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {bookError ? (
          <Alert tone="danger" title="Réservation non effectuée">
            {bookError}
          </Alert>
        ) : null}

        {effectiveSelection.size > 0 ? (
          <div
            role="region"
            aria-label="Réservation des Porteurs"
            className="sticky bottom-[calc(var(--bottom-bar-h,0px)+0.75rem)] z-[6] flex flex-col gap-3 rounded-card border border-line-strong bg-surface-2 p-3 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-4"
          >
            <p className="flex flex-wrap items-center gap-x-2 text-[0.875rem] text-ink-soft tabular">
              <span className="font-semibold text-ink-strong">
                {formatCount(totals.count, "Porteur sélectionné", "Porteurs sélectionnés")}
              </span>
              <span>· {formatNumber(totals.views)} affichages</span>
              <span>· {formatTND(totals.cost)}</span>
              <EstimateTag rule={ESTIMATE_COST_RULE} />
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setSelected(new Set())} disabled={booking}>
                Tout désélectionner
              </Button>
              <Button
                variant="primary"
                loading={booking}
                loadingLabel="Réservation en cours"
                onClick={() => void book()}
              >
                Réserver {formatCount(totals.count, "Porteur", "Porteurs")}
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <div className="mt-8 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" iconLeft={<ArrowLeft aria-hidden="true" />} onClick={onBack}>
          Contenu
        </Button>
        <Button
          variant="primary"
          size="lg"
          iconRight={<ArrowRight aria-hidden="true" />}
          disabledReason={nextReason}
          onClick={onNext}
        >
          Continuer vers la vérification
        </Button>
      </div>
    </div>
  );
}
