"use client";

import { ArrowRight, CalendarCheck2, CalendarSearch, CircleAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { AvailabilityStrip } from "@/components/network/availability-strip";
import { BATCH_BOOKING_DEPS } from "@/components/network/booking-deps";
import {
  availabilityWindow,
  AVAILABILITY_STRIP_DAYS,
  BOOKING_CONSEQUENCE,
  BOOKING_EXPLAINER,
  CAMPAIGN_PERIOD_LOCK_REASON,
  campaignPeriodState,
  checkDraftCampaign,
  DEFAULT_SLOT_DAYS,
  isDraftCampaign,
  nextAvailabilityLabel,
  nextFreeWindow,
  OFF_PERIOD_LABEL,
  OFF_PERIOD_WARNING,
  outcomeFromError,
  pickDay,
  proposeDefaultSchedule,
  reserveBlocker,
  reserveButtonLabel,
  runBatchBooking,
  sameSchedule,
  scheduleFromCampaign,
  scheduleLengthDays,
  scheduleTimes,
  scheduleWithDates,
  toReservationRequest,
  validateSchedule,
  type BookingOutcome,
  type ScheduleDraft,
} from "@/components/network/booking-plan";
import { CampaignPicker } from "@/components/network/campaign-picker";
import { ConfiguratorIdentity } from "@/components/network/configurator-identity";
import {
  CreativePreviewImport,
  type StudioCreativeState,
} from "@/components/network/creative-preview-import";
import { ConfigSection } from "@/components/network/network-ui";
import { ScheduleFields, scheduleFieldIds } from "@/components/network/schedule-fields";
import {
  StudioControls,
  type CameraPresetId,
  type StudioFace,
  type TimeOfDay,
} from "@/components/porteur3d";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useStickyBarOffset } from "@/components/ui/use-sticky-bar-offset";
import { campaignsApi, supportsApi } from "@/lib/api/endpoints";
import type { CampaignResponse, ReservationResponse, SupportResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { formatDateRange } from "@/lib/format";
import { blockedDays, buildCalendarStrip } from "@/lib/network/availability";
import { bookingBlockReason, resolvePorteurType } from "@/lib/network/porteur";
import { routes } from "@/lib/routes";
import { useResource, type ResourceState } from "@/lib/use-resource";

/** Créneau + campaign shared by every Porteur opened in the explorer (configure once). */
export interface BookingState {
  schedule: ScheduleDraft;
  campaignId: number | null;
  /** « Réserver hors période » acknowledged for the chosen campaign (dates unlocked). */
  offPeriod?: boolean;
  /**
   * Who set the dates: « default » (the explorer proposal, re-fitted to each Porteur's first free
   * week), « user » or « campaign ». Missing = default.
   */
  scheduleSource?: "default" | "user" | "campaign";
}

export interface StudioPreviewState {
  view: CameraPresetId;
  onViewChange: (view: CameraPresetId) => void;
  timeOfDay: TimeOfDay;
  onTimeOfDayChange: (value: TimeOfDay) => void;
  face: StudioFace;
  onFaceChange: (face: StudioFace) => void;
  onResetView: () => void;
}

export interface PorteurConfiguratorProps {
  support: SupportResponse;
  today: string;
  booking: BookingState;
  onBookingChange: (patch: Partial<BookingState>) => void;
  campaigns: ResourceState<CampaignResponse[]>;
  preview: StudioPreviewState;
  creative: StudioCreativeState;
  onReserved?: (reservation: ReservationResponse, campaign: CampaignResponse) => void;
  idPrefix?: string;
}

interface Success {
  reservation: ReservationResponse;
  campaign: CampaignResponse;
}

export const CHOOSE_CAMPAIGN_MESSAGE =
  "Choisissez une campagne brouillon ou créez un brouillon rapide.";

/**
 * Configurator of the Studio sheet, campaign first (FLOW-03): 01 Campagne · 02 Créneau ·
 * 03 Aperçu · 04 Identité, then « Réserver ce Porteur · dates » → POST /reservations/batch (campaign zones extended first) for the
 * Porteur's own zoneId. A chosen draft applies and locks its period; « Réserver hors période »
 * needs an explicit acknowledgement.
 */
export function PorteurConfigurator({
  support,
  today,
  booking,
  onBookingChange,
  campaigns,
  preview,
  creative,
  onReserved,
  idPrefix = "studio",
}: PorteurConfiguratorProps) {
  const { type } = resolvePorteurType(support);
  const block = bookingBlockReason(support);
  const { schedule } = booking;
  const source = booking.scheduleSource ?? "default";
  const ids = scheduleFieldIds(idPrefix);
  const campaignSectionId = `${idPrefix}-section-campagne`;
  const scheduleSectionId = `${idPrefix}-section-creneau`;
  const conflictId = `${idPrefix}-conflit`;

  const range = availabilityWindow(today, schedule.endDate);
  const availability = useResource(
    block ? null : `network:availability:${support.id}:${range.from}:${range.to}`,
    (signal) => supportsApi.availability(support.id, range, { signal }),
  );
  const slots = availability.data;
  const days = useMemo(
    () => (slots ? buildCalendarStrip(slots, today, AVAILABILITY_STRIP_DAYS) : []),
    [slots, today],
  );
  const booked = useMemo(
    () => (slots ? blockedDays(slots, { from: range.from, to: range.to }) : null),
    [slots, range.from, range.to],
  );

  const [awaitingEnd, setAwaitingEnd] = useState(false);
  const [attempted, setAttempted] = useState(false);
  /** The dates were changed by the user on this Porteur: a conflict becomes an alert. */
  const [userChanged, setUserChanged] = useState(false);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<BookingOutcome | null>(null);
  const [success, setSuccess] = useState<Success | null>(null);
  const footerRef = useRef<HTMLElement>(null);
  useStickyBarOffset(footerRef);

  const drafts = useMemo(() => (campaigns.data ?? []).filter(isDraftCampaign), [campaigns.data]);
  const campaign = drafts.find((c) => c.id === booking.campaignId) ?? null;
  const period = campaignPeriodState(campaign, today, booking.offPeriod ?? false);
  const validation = validateSchedule(schedule, { today, slots });
  const times = scheduleTimes(schedule);

  // A locked campaign period always wins (chosen here, on another Porteur, or just created).
  const lockedSchedule = period.locked ? period.campaignSchedule : null;
  useEffect(() => {
    if (lockedSchedule && !sameSchedule(schedule, lockedSchedule)) {
      onBookingChange({ schedule: lockedSchedule, scheduleSource: "campaign" });
    }
  }, [lockedSchedule, schedule, onBookingChange]);

  // No campaign and the explorer default: propose this Porteur's first free week (FFA-08).
  useEffect(() => {
    if (block || campaign || source !== "default" || !slots) return;
    const proposal = proposeDefaultSchedule(schedule, slots, { today, to: range.to });
    if (proposal) onBookingChange({ schedule: proposal });
  }, [block, campaign, source, slots, schedule, today, range.to, onBookingChange]);

  const lengthDays = scheduleLengthDays(schedule) ?? DEFAULT_SLOT_DAYS;
  const freeWindow = slots ? nextFreeWindow(slots, { today, to: range.to, lengthDays }) : null;
  const conflict = validation.availability;

  const clearResult = () => {
    setOutcome(null);
    setSuccess(null);
  };

  const setSchedule = (next: ScheduleDraft) => {
    onBookingChange({ schedule: next, scheduleSource: "user" });
    setUserChanged(true);
    clearResult();
  };

  const chooseCampaign = (id: number | null, chosen: CampaignResponse | null) => {
    const target = chosen ?? drafts.find((c) => c.id === id) ?? null;
    const campaignSchedule = target ? scheduleFromCampaign(target, today) : null;
    onBookingChange({
      campaignId: id,
      offPeriod: false,
      ...(campaignSchedule ? { schedule: campaignSchedule, scheduleSource: "campaign" } : {}),
    });
    setUserChanged(false);
    setCampaignError(null);
    clearResult();
  };

  const toggleOffPeriod = (checked: boolean) => {
    if (checked) {
      onBookingChange({ offPeriod: true });
    } else if (period.campaignSchedule) {
      onBookingChange({
        offPeriod: false,
        schedule: period.campaignSchedule,
        scheduleSource: "campaign",
      });
      setUserChanged(false);
    }
    clearResult();
  };

  const applyFreeWindow = () => {
    if (!freeWindow) return;
    onBookingChange({ schedule: scheduleWithDates(schedule, freeWindow), scheduleSource: "user" });
    setUserChanged(false);
    clearResult();
  };

  const blocker = reserveBlocker({
    porteurBlock: block,
    hasCampaign: campaign !== null,
    validation,
  });
  const checking = !block && availability.loading && !slots;
  const gateReason = blocker?.reason ?? (checking ? "Vérification des disponibilités…" : null);

  const focusElement = (id: string) => {
    const el = document.getElementById(id);
    el?.scrollIntoView?.({ block: "center" });
    el?.focus({ preventScroll: true });
  };

  const explainBlocker = () => {
    if (!blocker) return;
    if (blocker.kind === "campaign") {
      setCampaignError(CHOOSE_CAMPAIGN_MESSAGE);
      focusElement(campaignSectionId);
    } else if (blocker.kind === "schedule") {
      setAttempted(true);
      const target = validation.errors.startDate
        ? ids.start
        : validation.errors.endDate
          ? ids.end
          : validation.errors.times
            ? ids.timeStart
            : scheduleSectionId;
      focusElement(document.getElementById(target) ? target : scheduleSectionId);
    } else if (blocker.kind === "conflict") {
      setUserChanged(true);
      focusElement(conflictId);
    }
  };

  const reserve = async () => {
    if (blocker || !campaign || !validation.period) {
      explainBlocker();
      return;
    }
    setOutcome(null);
    setSubmitting(true);
    try {
      const check = await checkDraftCampaign(campaign.id, (id) => campaignsApi.get(id));
      if (!check.ok) {
        setOutcome(check.outcome);
        const fresh = check.campaign;
        if (fresh && !isDraftCampaign(fresh)) {
          // Stale list: the campaign leaves the drafts and the choice is reset.
          campaigns.setData((prev) => (prev ?? []).map((c) => (c.id === fresh.id ? fresh : c)));
          onBookingChange({ campaignId: null, offPeriod: false });
        }
        return;
      }
      // The Porteur must lie inside a campaign circle: zones are extended first if needed.
      const outcomes = await runBatchBooking(
        [toReservationRequest(support, campaign.id, validation.period)],
        [support],
        BATCH_BOOKING_DEPS,
      );
      const result = outcomes.get(support.id);
      if (!result || result.status !== "reserved") {
        const failed = result ?? outcomeFromError(new Error("Réservation non effectuée."));
        setOutcome(failed);
        if (failed.status === "conflict") availability.reload();
        return;
      }
      const reservation = result.reservation;
      availability.setData((prev) => [
        ...(prev ?? []),
        {
          startDate: reservation.startDate,
          endDate: reservation.endDate,
          startTime: reservation.startTime,
          endTime: reservation.endTime,
          reservationStatus: "TEMPORAIRE",
        },
      ]);

      // Inline confirmation in the footer (FFA-11): no toast over the sheet.
      setSuccess({ reservation, campaign });
      setAttempted(false);
      setUserChanged(false);
      onReserved?.(reservation, campaign);
    } catch (e) {
      const next = outcomeFromError(e);
      setOutcome(next);
      if (next.status === "conflict") availability.reload();
    } finally {
      setSubmitting(false);
    }
  };

  const summary = campaign
    ? `${campaign.name} · ${formatDateRange(schedule.startDate || null, schedule.endDate || null)}${
        times.start && times.end ? ` · ${times.start}–${times.end}` : ""
      }`
    : "Choisissez une campagne, puis vérifiez le créneau.";

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-1 flex-col gap-7 px-4 pt-5 pb-8 sm:px-6">
        <ConfigSection
          id={campaignSectionId}
          focusable
          index={1}
          title="Campagne"
          description="La réservation est rattachée à l'une de vos campagnes en brouillon ; sa période s'applique au créneau."
        >
          {block ? (
            <p className="text-[0.8125rem] text-muted">
              Choisissez un autre Porteur pour le rattacher à une campagne.
            </p>
          ) : (
            <CampaignPicker
              campaigns={campaigns}
              value={campaign?.id ?? null}
              onChange={chooseCampaign}
              schedule={schedule}
              today={today}
              idPrefix={`${idPrefix}-picker`}
              error={campaignError}
            />
          )}
        </ConfigSection>

        <ConfigSection
          id={scheduleSectionId}
          focusable
          index={2}
          title="Créneau"
          description={
            period.locked
              ? "La période de la campagne est appliquée à ce Porteur."
              : "Période de diffusion et tranche horaire quotidienne."
          }
        >
          {block ? (
            <p className="text-[0.8125rem] text-muted">{block}</p>
          ) : (
            <>
              {period.campaignSchedule ? (
                <div
                  className={cx(
                    "rounded-card border px-3.5",
                    booking.offPeriod
                      ? "border-warning/35 bg-warning/8"
                      : "border-line bg-overlay-subtle",
                  )}
                >
                  <Checkbox
                    id={`${idPrefix}-hors-periode`}
                    label={OFF_PERIOD_LABEL}
                    description={OFF_PERIOD_WARNING}
                    checked={booking.offPeriod ?? false}
                    onChange={(e) => toggleOffPeriod(e.target.checked)}
                  />
                </div>
              ) : campaign ? (
                <p className="text-[0.8125rem] leading-snug text-muted">
                  La période de cette campagne est incomplète ou déjà passée : choisissez le créneau
                  ci-dessous.
                </p>
              ) : null}

              <ScheduleFields
                draft={schedule}
                onChange={(next) => {
                  setSchedule(next);
                  setAwaitingEnd(false);
                }}
                errors={validation.errors}
                today={today}
                idPrefix={idPrefix}
                showErrors={attempted}
                lockedReason={period.locked ? CAMPAIGN_PERIOD_LOCK_REASON : null}
                unavailable={booked ? (iso) => booked.has(iso) : undefined}
              />
              <AvailabilityStrip
                days={days}
                draft={schedule}
                awaitingEnd={awaitingEnd}
                disabled={period.locked}
                nextFreeDate={freeWindow?.startDate ?? null}
                onPick={(day) => {
                  const next = pickDay(schedule, day, awaitingEnd);
                  setSchedule(next.draft);
                  setAwaitingEnd(next.awaitingEnd);
                }}
                loading={availability.loading}
                error={availability.error}
                onRetry={availability.reload}
              />
              {conflict ? (
                <div
                  id={conflictId}
                  tabIndex={-1}
                  role={userChanged ? "alert" : "note"}
                  data-conflict={userChanged ? "alert" : "note"}
                  className={cx(
                    "flex flex-col gap-2.5 rounded-card border px-3.5 py-3 text-[0.8125rem] leading-snug text-ink-soft focus:outline-none focus-visible:outline-2 focus-visible:outline-brand-blue-text",
                    userChanged ? "border-danger/35 bg-danger/8" : "border-line bg-overlay-subtle",
                  )}
                >
                  <div className="flex items-start gap-2">
                    {userChanged ? (
                      <CircleAlert
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-danger"
                      />
                    ) : (
                      <CalendarSearch
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-brand-blue-text"
                      />
                    )}
                    <p className="min-w-0">
                      {userChanged
                        ? conflict
                        : period.locked
                          ? "Ce Porteur est déjà réservé sur une partie de la période de la campagne."
                          : "Ce Porteur est déjà réservé sur ces dates."}
                      <span className="mt-1 block font-semibold text-ink-strong tabular">
                        {freeWindow
                          ? nextAvailabilityLabel(freeWindow)
                          : "Aucune disponibilité de cette durée dans la période consultée."}
                      </span>
                      {period.locked ? (
                        <span className="mt-1 block text-muted">
                          Cochez « {OFF_PERIOD_LABEL} » pour choisir d&apos;autres dates, ou
                          choisissez un autre Porteur.
                        </span>
                      ) : null}
                    </p>
                  </div>
                  {freeWindow && !period.locked ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="self-start"
                      onClick={applyFreeWindow}
                    >
                      Utiliser ces dates
                    </Button>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-start gap-2.5 rounded-card border border-line bg-overlay-subtle px-3.5 py-3">
                <CalendarCheck2
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-brand-blue-text"
                />
                <div className="min-w-0 text-[0.8125rem] leading-snug">
                  <p className="text-ink-soft">{summary}</p>
                  <p className="mt-1 text-[0.75rem] leading-relaxed text-muted">
                    {BOOKING_EXPLAINER}
                  </p>
                </div>
              </div>
            </>
          )}
        </ConfigSection>

        <ConfigSection
          index={3}
          title="Aperçu"
          description={
            type === "D"
              ? "Porteur sans écran : explorez la structure, sans visuel à prévisualiser."
              : "Votre visuel sur l'écran du Porteur, de jour comme de nuit, depuis la rue."
          }
        >
          {type !== "D" ? (
            <CreativePreviewImport
              creative={creative.creative}
              source={creative.source}
              campaignId={creative.campaignId}
            />
          ) : null}
          <StudioControls
            type={type}
            view={preview.view}
            onViewChange={preview.onViewChange}
            timeOfDay={preview.timeOfDay}
            onTimeOfDayChange={preview.onTimeOfDayChange}
            face={preview.face}
            onFaceChange={preview.onFaceChange}
            onResetView={preview.onResetView}
          />
        </ConfigSection>

        <ConfigSection index={4} title="Identité">
          <ConfiguratorIdentity support={support} />
        </ConfigSection>
      </div>

      {/* Sticky footer = CTA + consequence line only (FFA-09); summary and explainer live in 02. */}
      <footer
        ref={footerRef}
        data-studio-footer=""
        className="sticky bottom-0 z-10 mt-auto border-t border-line-strong bg-surface px-4 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-6"
      >
        {success ? (
          <Alert
            tone="success"
            title={`Porteur réservé pour « ${success.campaign.name} »`}
            action={
              <>
                <Button asChild variant="primary" size="sm">
                  <Link href={routes.espace.campaign(success.campaign.id)}>Voir la campagne</Link>
                </Button>
                <Button asChild variant="secondary" size="sm">
                  <Link href={routes.espace.wizard(success.campaign.id, "verification")}>
                    Continuer dans l&apos;assistant
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSuccess(null)}>
                  Réserver une autre période
                </Button>
              </>
            }
          >
            {formatDateRange(success.reservation.startDate, success.reservation.endDate)} · bloqué
            en attente de décision TPUB. {BOOKING_CONSEQUENCE}
          </Alert>
        ) : (
          <>
            {outcome && outcome.status !== "reserved" ? (
              <p
                role="alert"
                className="mb-2.5 flex items-start gap-2 text-[0.8125rem] leading-snug text-danger"
              >
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {outcome.message}
              </p>
            ) : null}
            <Button
              variant="primary"
              size="lg"
              fullWidth
              wrap
              loading={submitting}
              loadingLabel="Réservation en cours…"
              disabledReason={gateReason}
              onDisabledClick={explainBlocker}
              iconLeft={<Sparkles aria-hidden="true" />}
              onClick={() => void reserve()}
            >
              {reserveButtonLabel(schedule)}
            </Button>
            <p className="mt-2 text-center text-[0.75rem] leading-snug text-muted">
              {gateReason ? (
                <span aria-hidden="true" className="text-ink-soft">
                  {gateReason} ·{" "}
                </span>
              ) : campaign ? (
                <span className="text-ink-soft">Rattaché à « {campaign.name} » · </span>
              ) : null}
              {BOOKING_CONSEQUENCE}
            </p>
          </>
        )}
      </footer>
    </div>
  );
}
