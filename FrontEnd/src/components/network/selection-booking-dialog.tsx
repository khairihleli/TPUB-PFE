"use client";

import {
  ArrowRight,
  Ban,
  CalendarX2,
  CircleAlert,
  CircleCheck,
  Clock3,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { BATCH_BOOKING_DEPS } from "@/components/network/booking-deps";
import {
  availabilityWindow,
  BOOKING_EXPLAINER,
  buildBookingPlan,
  CAMPAIGN_PERIOD_LOCK_REASON,
  campaignPeriodState,
  checkDraftCampaign,
  isDraftCampaign,
  OFF_PERIOD_LABEL,
  OFF_PERIOD_WARNING,
  runBatchBooking,
  sameSchedule,
  scheduleFromCampaign,
  summarizeOutcomes,
  validateSchedule,
  type BookingOutcome,
  type PlanItem,
  type PlanStatus,
} from "@/components/network/booking-plan";
import { CampaignPicker } from "@/components/network/campaign-picker";
import { PorteurTypeBadges } from "@/components/network/network-ui";
import type { BookingState } from "@/components/network/porteur-configurator";
import { ScheduleFields } from "@/components/network/schedule-fields";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { campaignsApi, reservationsApi, supportsApi } from "@/lib/api/endpoints";
import { isAbortError } from "@/lib/api/errors";
import type { CampaignResponse, SupportAvailabilitySlot, SupportResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { formatCount } from "@/lib/format";
import { isBookable } from "@/lib/network/porteur";
import { routes } from "@/lib/routes";
import { useResource, type ResourceState } from "@/lib/use-resource";

export interface SelectionBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Selected Porteurs (resolved). */
  supports: readonly SupportResponse[];
  today: string;
  booking: BookingState;
  onBookingChange: (patch: Partial<BookingState>) => void;
  campaigns: ResourceState<CampaignResponse[]>;
  onReserved?: (supportIds: number[], campaign: CampaignResponse) => void;
}

type ResultState = BookingOutcome | { status: "pending" };

const PLAN_META: Record<PlanStatus, { label: string; tone: string; Icon: typeof CircleCheck }> = {
  ready: { label: "Prêt à réserver", tone: "text-success", Icon: CircleCheck },
  unavailable: { label: "Indisponible", tone: "text-danger", Icon: CalendarX2 },
  "not-bookable": { label: "Non réservable", tone: "text-muted", Icon: Ban },
  "already-booked": { label: "Déjà réservé", tone: "text-brand-blue-text", Icon: CircleCheck },
};

async function loadSelectionAvailability(
  supports: readonly SupportResponse[],
  range: { from: string; to: string },
  signal: AbortSignal,
): Promise<Map<number, SupportAvailabilitySlot[]>> {
  const settled = await Promise.allSettled(
    supports.map((s) => supportsApi.availability(s.id, range, { signal })),
  );
  const map = new Map<number, SupportAvailabilitySlot[]>();
  settled.forEach((r, i) => {
    const s = supports[i];
    if (!s) return;
    if (r.status === "fulfilled") map.set(s.id, r.value);
    else if (isAbortError(r.reason)) throw r.reason;
  });
  return map;
}

/** « Réserver la sélection » : one campaign + one créneau → one reservation per Porteur. */
export function SelectionBookingDialog(props: SelectionBookingDialogProps) {
  const { open, onOpenChange } = props;
  const [running, setRunning] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!running) onOpenChange(next);
      }}
    >
      {open ? (
        <SelectionBookingContent {...props} running={running} setRunning={setRunning} />
      ) : null}
    </Dialog>
  );
}

function SelectionBookingContent({
  supports,
  today,
  booking,
  onBookingChange,
  campaigns,
  onReserved,
  onOpenChange,
  running,
  setRunning,
}: SelectionBookingDialogProps & { running: boolean; setRunning: (v: boolean) => void }) {
  const { schedule } = booking;
  const [attempted, setAttempted] = useState(false);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [results, setResults] = useState<Map<number, ResultState> | null>(null);

  const bookable = useMemo(() => supports.filter((s) => isBookable(s)), [supports]);
  const range = availabilityWindow(today, schedule.endDate);
  const idsKey = bookable.map((s) => s.id).join(",");
  const availability = useResource(
    bookable.length > 0
      ? `network:selection-availability:${idsKey}:${range.from}:${range.to}`
      : null,
    (signal) => loadSelectionAvailability(bookable, range, signal),
  );

  const drafts = (campaigns.data ?? []).filter(isDraftCampaign);
  const campaign = drafts.find((c) => c.id === booking.campaignId) ?? null;
  const period = campaignPeriodState(campaign, today, booking.offPeriod ?? false);
  const lockedSchedule = period.locked ? period.campaignSchedule : null;
  useEffect(() => {
    if (lockedSchedule && !sameSchedule(schedule, lockedSchedule)) {
      onBookingChange({ schedule: lockedSchedule, scheduleSource: "campaign" });
    }
  }, [lockedSchedule, schedule, onBookingChange]);
  const campaignReservations = useResource(
    campaign ? `network:campaign-reservations:${campaign.id}` : null,
    (signal) => reservationsApi.byCampaign(campaign?.id ?? 0, { signal }),
  );

  const validation = validateSchedule(schedule, { today });
  const plan = buildBookingPlan({
    supports,
    campaignId: campaign?.id ?? null,
    period: validation.period,
    availability: availability.data,
    campaignReservations: campaignReservations.data,
  });

  const run = async (items: PlanItem[]) => {
    const requests = items.flatMap((i) => (i.request ? [i.request] : []));
    if (requests.length === 0 || !campaign) return;
    setRunning(true);
    try {
      const check = await checkDraftCampaign(campaign.id, (id) => campaignsApi.get(id));
      if (!check.ok) {
        const fresh = check.campaign;
        if (fresh && !isDraftCampaign(fresh)) {
          campaigns.setData((prev) => (prev ?? []).map((c) => (c.id === fresh.id ? fresh : c)));
          onBookingChange({ campaignId: null });
        }
        setCampaignError(check.outcome.message);
        setResults(null);
        return;
      }
      setResults((prev) => {
        const next = new Map(prev ?? []);
        for (const r of requests) next.set(r.supportId, { status: "pending" });
        return next;
      });
      // Zones first (the Porteurs must lie inside a campaign circle), then one batch.
      const outcomes = await runBatchBooking(requests, supports, BATCH_BOOKING_DEPS);
      setResults((prev) => {
        const next = new Map(prev ?? []);
        for (const [supportId, outcome] of outcomes) next.set(supportId, outcome);
        return next;
      });
      // Per-Porteur results stay inline in the dialog (no toast on top of it).
      const reservedIds = [...outcomes.entries()]
        .filter(([, o]) => o.status === "reserved")
        .map(([id]) => id);
      if (reservedIds.length > 0) {
        onReserved?.(reservedIds, campaign);
        campaignReservations.reload();
        availability.reload();
      }
    } finally {
      setRunning(false);
    }
  };

  const submit = () => {
    setAttempted(true);
    if (!campaign) {
      setCampaignError("Choisissez une campagne brouillon ou créez un brouillon rapide.");
      return;
    }
    if (!validation.period) return;
    void run(plan.items.filter((i) => i.status === "ready"));
  };

  const resultEntries = results ? [...results.values()] : [];
  const settled = resultEntries.filter((r): r is BookingOutcome => r.status !== "pending");
  const summary = summarizeOutcomes(settled);
  const failedItems = results
    ? supports
        .map((s) => ({ support: s, result: results.get(s.id) }))
        .filter((x) => x.result && (x.result.status === "error" || x.result.status === "conflict"))
    : [];

  const showResults = results !== null;

  const footer = showResults ? (
    <>
      {failedItems.length > 0 && !running ? (
        <Button
          variant="secondary"
          iconLeft={<RotateCcw aria-hidden="true" />}
          onClick={() => {
            setResults(null);
          }}
        >
          Modifier le créneau
        </Button>
      ) : null}
      {summary.reserved > 0 && campaign && !running ? (
        <Button asChild variant="secondary">
          <Link href={routes.espace.wizard(campaign.id, "verification")}>
            Continuer dans l&apos;assistant
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      ) : null}
      <Button variant="primary" onClick={() => onOpenChange(false)} disabled={running}>
        Terminer
      </Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={() => onOpenChange(false)}>
        Annuler
      </Button>
      <Button
        variant="primary"
        onClick={submit}
        disabled={
          plan.readyCount === 0 ||
          (campaign !== null && validation.period !== null && !plan.canSubmit)
        }
      >
        {plan.readyCount > 0
          ? `Réserver ${formatCount(plan.readyCount, "Porteur", "Porteurs")}`
          : "Réserver la sélection"}
      </Button>
    </>
  );

  return (
    <DialogContent
      size="lg"
      title="Réserver la sélection"
      description={`${formatCount(supports.length, "Porteur sélectionné", "Porteurs sélectionnés")} · ${formatCount(bookable.length, "réservable", "réservables")}`}
      preventOutsideClose={running}
      hideCloseButton={running}
      footer={footer}
    >
      {showResults ? (
        <div className="flex flex-col gap-4">
          <p
            className="text-[0.875rem] font-semibold text-ink-strong"
            role="status"
            aria-live="polite"
          >
            {running ? `Réservation en cours… ${summary.label}` : summary.label}
          </p>
          <ul className="flex flex-col gap-1.5" aria-label="Résultat par Porteur">
            {supports.map((s) => {
              const result = results?.get(s.id);
              const planItem = plan.items.find((i) => i.support.id === s.id);
              return (
                <ResultRow
                  key={s.id}
                  support={s}
                  result={result}
                  skippedReason={result ? null : (planItem?.reason ?? "Non traité.")}
                  onRetry={
                    result && result.status === "error" && result.retryable && planItem && !running
                      ? () => {
                          const fresh = buildBookingPlan({
                            supports: [s],
                            campaignId: campaign?.id ?? null,
                            period: validation.period,
                          }).items;
                          void run(fresh);
                        }
                      : undefined
                  }
                />
              );
            })}
          </ul>
          {summary.reserved > 0 && campaign ? (
            <Alert tone="success" live="none" title={`Rattachées à « ${campaign.name} »`}>
              {BOOKING_EXPLAINER}{" "}
              <Link
                href={routes.espace.campaign(campaign.id)}
                className="font-semibold text-brand-blue-text underline-offset-2 hover:underline"
              >
                Voir la campagne
              </Link>
            </Alert>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <section aria-labelledby="selection-campagne" className="flex flex-col gap-3">
            <h3
              id="selection-campagne"
              className="font-display text-base font-semibold text-ink-strong"
            >
              Campagne
            </h3>
            <CampaignPicker
              campaigns={campaigns}
              value={campaign?.id ?? null}
              onChange={(id, chosen) => {
                const campaignSchedule = chosen ? scheduleFromCampaign(chosen, today) : null;
                onBookingChange({
                  campaignId: id,
                  offPeriod: false,
                  ...(campaignSchedule
                    ? { schedule: campaignSchedule, scheduleSource: "campaign" }
                    : {}),
                });
                setCampaignError(null);
              }}
              schedule={schedule}
              today={today}
              idPrefix="selection-picker"
              error={campaignError}
            />
          </section>

          <section aria-labelledby="selection-creneau" className="flex flex-col gap-3">
            <h3
              id="selection-creneau"
              className="font-display text-base font-semibold text-ink-strong"
            >
              Créneau
            </h3>
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
                  id="selection-hors-periode"
                  label={OFF_PERIOD_LABEL}
                  description={OFF_PERIOD_WARNING}
                  checked={booking.offPeriod ?? false}
                  onChange={(e) =>
                    onBookingChange(
                      e.target.checked
                        ? { offPeriod: true }
                        : {
                            offPeriod: false,
                            schedule: period.campaignSchedule ?? schedule,
                            scheduleSource: "campaign",
                          },
                    )
                  }
                />
              </div>
            ) : null}
            <ScheduleFields
              draft={schedule}
              onChange={(next) => onBookingChange({ schedule: next, scheduleSource: "user" })}
              errors={validation.errors}
              today={today}
              idPrefix="selection"
              showErrors={attempted}
              lockedReason={period.locked ? CAMPAIGN_PERIOD_LOCK_REASON : null}
            />
          </section>

          <section aria-labelledby="selection-plan" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3
                id="selection-plan"
                className="font-display text-base font-semibold text-ink-strong"
              >
                Vérification par Porteur
              </h3>
              <p className="text-[0.75rem] text-muted" aria-live="polite">
                {availability.loading
                  ? "Vérification des disponibilités…"
                  : `${plan.readyCount} prêt${plan.readyCount > 1 ? "s" : ""} · ${plan.blockedCount} écarté${plan.blockedCount > 1 ? "s" : ""}`}
              </p>
            </div>
            {availability.error ? (
              <Alert tone="warning" title="Disponibilités non vérifiées">
                La vérification préalable a échoué : les conflits éventuels seront signalés à la
                réservation.
              </Alert>
            ) : null}
            <ul className="flex flex-col gap-1.5" aria-label="Vérification par Porteur">
              {plan.items.map((item) => (
                <PlanRow key={item.support.id} item={item} checking={availability.loading} />
              ))}
            </ul>
            <p className="text-[0.75rem] leading-relaxed text-muted">{BOOKING_EXPLAINER}</p>
          </section>
        </div>
      )}
    </DialogContent>
  );
}

function PlanRow({ item, checking }: { item: PlanItem; checking: boolean }) {
  const meta = PLAN_META[item.status];
  const pendingCheck = checking && item.status === "ready" && !item.availabilityChecked;
  return (
    <li className="flex items-start gap-3 rounded-[14px] border border-line bg-overlay-inset px-3 py-2.5">
      <span
        aria-hidden="true"
        className={cx("mt-0.5 shrink-0", pendingCheck ? "text-muted" : meta.tone)}
      >
        {pendingCheck ? (
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <meta.Icon className="size-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.8125rem] font-semibold text-ink">{item.support.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <PorteurTypeBadges support={item.support} size="sm" />
          <span className="text-[0.75rem] text-muted">{item.support.zoneName}</span>
        </div>
        {item.reason ? (
          <p className="mt-1 text-[0.75rem] leading-snug text-muted">{item.reason}</p>
        ) : null}
      </div>
      <span
        className={cx(
          "shrink-0 font-label text-[0.75rem] font-semibold",
          pendingCheck ? "text-muted" : meta.tone,
        )}
      >
        {pendingCheck ? "Vérification…" : meta.label}
      </span>
    </li>
  );
}

function ResultRow({
  support,
  result,
  skippedReason,
  onRetry,
}: {
  support: SupportResponse;
  result: ResultState | undefined;
  skippedReason: string | null;
  onRetry?: () => void;
}) {
  const view = !result
    ? { Icon: Ban, tone: "text-muted", label: "Non réservé", detail: skippedReason }
    : result.status === "pending"
      ? { Icon: Clock3, tone: "text-brand-blue-text", label: "En cours…", detail: null }
      : result.status === "reserved"
        ? {
            Icon: CircleCheck,
            tone: "text-success",
            label: "Réservé",
            detail: "Réservation temporaire.",
          }
        : result.status === "conflict"
          ? { Icon: CalendarX2, tone: "text-danger", label: "Indisponible", detail: result.message }
          : { Icon: CircleAlert, tone: "text-danger", label: "Erreur", detail: result.message };
  return (
    <li className="flex items-start gap-3 rounded-[14px] border border-line bg-overlay-inset px-3 py-2.5">
      <view.Icon aria-hidden="true" className={cx("mt-0.5 size-4 shrink-0", view.tone)} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.8125rem] font-semibold text-ink">{support.name}</p>
        {view.detail ? (
          <p className="mt-0.5 text-[0.75rem] leading-snug text-muted">{view.detail}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={cx("font-label text-[0.75rem] font-semibold", view.tone)}>
          {view.label}
        </span>
        {onRetry ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            iconLeft={<RotateCcw aria-hidden="true" />}
          >
            Réessayer<span className="sr-only"> : {support.name}</span>
          </Button>
        ) : null}
      </div>
    </li>
  );
}
