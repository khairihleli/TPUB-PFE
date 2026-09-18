/**
 * Configurator logic of the network explorer (Studio sheet + « Réserver la sélection »). Pure:
 * créneau (dates + day-part), availability validation, quick draft validation (existing campaign
 * zod schema), reservation plan per Porteur and outcome mapping.
 *
 * Backend rules mirrored here (completion contract §2.4, §2.7): a conflict is a date AND time
 * overlap on the support; the Porteur must lie inside one of the campaign circles (zones are
 * extended before booking, see `runBatchBooking`); times are HH:mm:ss.
 */
import {
  type CampaignFormValues,
  validateCampaignForm,
} from "@/components/campaign/campaign-schema";
import { coveringCircle } from "@/components/campaign/zone-model";
import {
  ApiError,
  batchConflicts,
  isAbortError,
  isReservationConflictError,
  presentError,
} from "@/lib/api/errors";
import { translateFieldMessage } from "@/lib/api/messages";
import type {
  CampaignRequest,
  CampaignResponse,
  CampaignZoneRequest,
  CampaignZoneResponse,
  ReservationBatchRequest,
  ReservationRequest,
  ReservationResponse,
  SupportAvailabilitySlot,
  SupportResponse,
} from "@/lib/api/types";
import { CAMPAIGN_ZONE_LIMITS, insideAnyCircle } from "@/lib/geo";
import {
  addDaysISO,
  availabilityMessage,
  dayPartFromTimes,
  diffDaysISO,
  firstFreeWindow,
  getDayPart,
  isISODate,
  toHHmm,
  validateTimeRange,
  type DayPartId,
} from "@/lib/network/availability";
import { bookingBlockReason } from "@/lib/network/porteur";

// ---------------------------------------------------------------------------------------------
// Copy

export const BOOKING_EXPLAINER =
  "Réservation temporaire, confirmée à la validation ZELQANE. La réservation porte sur l'écran complet du Porteur.";

export const RESERVATION_CONFLICT_MESSAGE =
  "Période indisponible : ce Porteur est déjà réservé sur ces dates. Choisissez une autre période.";

export const ALREADY_BOOKED_MESSAGE = "Déjà réservé pour cette campagne sur cette période.";

// ---------------------------------------------------------------------------------------------
// Créneau

/** Days shown in the availability strip. */
export const AVAILABILITY_STRIP_DAYS = 60;
/** Minimum availability window fetched (the strip + margin). */
export const AVAILABILITY_FETCH_DAYS = 90;
/** Upper bound of the fetched window (≈ 2 years) whatever the chosen end date. */
export const AVAILABILITY_MAX_DAYS = 730;
export const DEFAULT_DAY_PART: DayPartId = "journee";

export interface ScheduleDraft {
  startDate: string;
  endDate: string;
  dayPart: DayPartId;
  /** "HH:mm", used when dayPart = « personnalise ». */
  customStart: string;
  customEnd: string;
}

/** Full reservation period, times as HH:mm:ss. */
export interface BookingPeriod {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
}

/** Tomorrow → +7 days, « Journée ». */
export function createDefaultSchedule(today: string): ScheduleDraft {
  const start = isISODate(today) ? addDaysISO(today, 1) : "";
  return {
    startDate: start,
    endDate: start ? addDaysISO(start, 6) : "",
    dayPart: DEFAULT_DAY_PART,
    customStart: "08:00",
    customEnd: "22:00",
  };
}

/** "HH:mm" times of the draft (preset or custom), null when invalid. */
export function scheduleTimes(draft: ScheduleDraft): { start: string | null; end: string | null } {
  if (draft.dayPart === "personnalise") {
    return { start: toHHmm(draft.customStart), end: toHHmm(draft.customEnd) };
  }
  const part = getDayPart(draft.dayPart);
  return { start: part.start, end: part.end };
}

/** Switching to « Personnalisé » starts from the previous preset's times. */
export function selectDayPart(draft: ScheduleDraft, id: DayPartId): ScheduleDraft {
  if (id === draft.dayPart) return draft;
  if (id === "personnalise") {
    const t = scheduleTimes(draft);
    return {
      ...draft,
      dayPart: id,
      customStart: t.start ?? draft.customStart,
      customEnd: t.end ?? draft.customEnd,
    };
  }
  return { ...draft, dayPart: id };
}

/**
 * Click on a day of the availability strip: the first click sets a one-day period and waits for
 * the end; a second click on a later (or same) day sets the end; an earlier day restarts.
 */
export function pickDay(
  draft: ScheduleDraft,
  day: string,
  awaitingEnd: boolean,
): { draft: ScheduleDraft; awaitingEnd: boolean } {
  if (!isISODate(day)) return { draft, awaitingEnd };
  if (!awaitingEnd || !isISODate(draft.startDate) || day < draft.startDate) {
    return { draft: { ...draft, startDate: day, endDate: day }, awaitingEnd: true };
  }
  return { draft: { ...draft, endDate: day }, awaitingEnd: false };
}

export type ScheduleField = "startDate" | "endDate" | "times";

export interface ScheduleValidation {
  /** No field error and (when slots are known) no conflict. */
  ok: boolean;
  errors: Partial<Record<ScheduleField, string>>;
  /** « Période indisponible … » on this Porteur, null when free or unknown. */
  availability: string | null;
  /** Set when dates and times are valid (availability aside). */
  period: BookingPeriod | null;
}

export interface ScheduleValidationOptions {
  /** Africa/Tunis today, minimum start date. */
  today: string;
  /** Booked periods of the Porteur (omit when unknown / several Porteurs). */
  slots?: readonly SupportAvailabilitySlot[];
}

export function validateSchedule(
  draft: ScheduleDraft,
  { today, slots }: ScheduleValidationOptions,
): ScheduleValidation {
  const errors: Partial<Record<ScheduleField, string>> = {};
  const startOk = isISODate(draft.startDate);
  const endOk = isISODate(draft.endDate);
  if (!startOk) errors.startDate = "Choisissez la date de début.";
  else if (isISODate(today) && draft.startDate < today) {
    errors.startDate = "La date de début ne peut pas être dans le passé.";
  }
  if (!endOk) errors.endDate = "Choisissez la date de fin.";
  else if (startOk && draft.endDate < draft.startDate) {
    errors.endDate = "La date de fin doit être égale ou postérieure à la date de début.";
  }
  const times = scheduleTimes(draft);
  const timeError = validateTimeRange(times.start, times.end);
  if (timeError) errors.times = timeError;

  const datesValid = !errors.startDate && !errors.endDate;
  const availability =
    datesValid && slots ? availabilityMessage(slots, draft.startDate, draft.endDate) : null;
  const period =
    datesValid && !timeError && times.start && times.end
      ? {
          startDate: draft.startDate,
          endDate: draft.endDate,
          startTime: `${times.start}:00`,
          endTime: `${times.end}:00`,
        }
      : null;
  return {
    ok: Object.keys(errors).length === 0 && availability === null,
    errors,
    availability,
    period,
  };
}

/** Draft with explicit daily times: the day-part follows the times (« Personnalisé » otherwise). */
export function scheduleWithTimes(draft: ScheduleDraft, start: string, end: string): ScheduleDraft {
  return { ...draft, dayPart: dayPartFromTimes(start, end), customStart: start, customEnd: end };
}

/** Same dates and same effective daily times. */
export function sameSchedule(a: ScheduleDraft, b: ScheduleDraft): boolean {
  const ta = scheduleTimes(a);
  const tb = scheduleTimes(b);
  return (
    a.startDate === b.startDate &&
    a.endDate === b.endDate &&
    ta.start === tb.start &&
    ta.end === tb.end
  );
}

/** Draft moved onto a date window (times kept). */
export function scheduleWithDates(
  draft: ScheduleDraft,
  window: { startDate: string; endDate: string },
): ScheduleDraft {
  return { ...draft, startDate: window.startDate, endDate: window.endDate };
}

/** Inclusive length of the draft period in days, null when the dates are invalid or reversed. */
export function scheduleLengthDays(draft: Pick<ScheduleDraft, "startDate" | "endDate">) {
  if (!isISODate(draft.startDate) || !isISODate(draft.endDate)) return null;
  if (draft.endDate < draft.startDate) return null;
  return diffDaysISO(draft.startDate, draft.endDate) + 1;
}

/** Default créneau length when the explorer proposes a slot (FFA-08). */
export const DEFAULT_SLOT_DAYS = 7;

/**
 * First free window on this Porteur from tomorrow, of `lengthDays` days, searched only inside
 * the fetched availability window (no claim beyond known data). Null when none.
 */
export function nextFreeWindow(
  slots: readonly SupportAvailabilitySlot[],
  { today, to, lengthDays }: { today: string; to: string; lengthDays: number },
): { startDate: string; endDate: string } | null {
  if (!isISODate(today) || !isISODate(to)) return null;
  const from = addDaysISO(today, 1);
  if (to < from) return null;
  return firstFreeWindow(slots, lengthDays, from, diffDaysISO(from, to) + 1);
}

/**
 * Proposed créneau when the Studio opens without a campaign: the first free window of 7 days
 * (times kept). Null when the current draft is already that window or nothing is free.
 */
export function proposeDefaultSchedule(
  draft: ScheduleDraft,
  slots: readonly SupportAvailabilitySlot[],
  { today, to }: { today: string; to: string },
): ScheduleDraft | null {
  const window = nextFreeWindow(slots, { today, to, lengthDays: DEFAULT_SLOT_DAYS });
  if (!window) return null;
  if (window.startDate === draft.startDate && window.endDate === draft.endDate) return null;
  return scheduleWithDates(draft, window);
}

const SHORT_DAY_MONTH = new Intl.DateTimeFormat("fr-TN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const SHORT_DAY_MONTH_YEAR = new Intl.DateTimeFormat("fr-TN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function utcNoon(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/**
 * Compact period for labels: « 14–20 sept. », « 28 sept. – 4 oct. », « 28 déc. 2026 – 3 janv.
 * 2027 », « 14 sept. » for one day. Empty string when invalid.
 */
export function formatShortPeriod(start: string, end: string): string {
  if (!isISODate(start) || !isISODate(end) || end < start) return "";
  const a = utcNoon(start);
  const b = utcNoon(end);
  if (start === end) return SHORT_DAY_MONTH.format(a);
  if (start.slice(0, 4) !== end.slice(0, 4)) {
    return `${SHORT_DAY_MONTH_YEAR.format(a)} – ${SHORT_DAY_MONTH_YEAR.format(b)}`;
  }
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${a.getUTCDate()}–${SHORT_DAY_MONTH.format(b)}`;
  }
  return `${SHORT_DAY_MONTH.format(a)} – ${SHORT_DAY_MONTH.format(b)}`;
}

/** « Prochaine disponibilité : 14 oct. → 20 oct. ». */
export function nextAvailabilityLabel(window: { startDate: string; endDate: string }): string {
  const a = SHORT_DAY_MONTH.format(utcNoon(window.startDate));
  const b = SHORT_DAY_MONTH.format(utcNoon(window.endDate));
  return `Prochaine disponibilité : ${a} → ${b}`;
}

/** « Réserver ce Porteur · 14–20 sept. » (scope in the label, FFA-17). */
export function reserveButtonLabel(draft: Pick<ScheduleDraft, "startDate" | "endDate">): string {
  const period = formatShortPeriod(draft.startDate, draft.endDate);
  return period ? `Réserver ce Porteur · ${period}` : "Réserver ce Porteur";
}

/** Consequence line next to the booking button (FFA-03). */
export const BOOKING_CONSEQUENCE =
  "Annulable depuis vos réservations tant que la campagne est en brouillon.";

/** Why « Réserver ce Porteur » is not available yet, in priority order (null = can book). */
export type ReserveBlocker =
  | { kind: "porteur"; reason: string }
  | { kind: "campaign"; reason: string }
  | { kind: "schedule"; reason: string }
  | { kind: "conflict"; reason: string };

export const CHOOSE_CAMPAIGN_REASON = "Choisissez une campagne";
export const CHOOSE_SCHEDULE_REASON = "Choisissez un créneau valide";
export const CONFLICT_REASON = "Ce Porteur est déjà réservé sur ces dates";

export function reserveBlocker({
  porteurBlock,
  hasCampaign,
  validation,
}: {
  porteurBlock: string | null;
  hasCampaign: boolean;
  validation: Pick<ScheduleValidation, "errors" | "availability" | "period">;
}): ReserveBlocker | null {
  if (porteurBlock) return { kind: "porteur", reason: porteurBlock };
  if (!hasCampaign) return { kind: "campaign", reason: CHOOSE_CAMPAIGN_REASON };
  if (!validation.period || Object.keys(validation.errors).length > 0) {
    return { kind: "schedule", reason: CHOOSE_SCHEDULE_REASON };
  }
  if (validation.availability) return { kind: "conflict", reason: CONFLICT_REASON };
  return null;
}

/** Copy of the campaign-period lock (FLOW-03). */
export const CAMPAIGN_PERIOD_LOCK_REASON = "Période de la campagne";
export const OFF_PERIOD_LABEL = "Réserver hors période";
export const OFF_PERIOD_WARNING = "Le créneau ne correspondra pas à la période de la campagne.";

export interface CampaignPeriodState {
  /** The chosen draft's own créneau; null without campaign or when its period is unusable. */
  campaignSchedule: ScheduleDraft | null;
  /** Dates and times read-only, following the campaign. */
  locked: boolean;
}

/**
 * With a chosen draft the créneau follows the campaign period (locked) unless the user
 * explicitly acknowledged « Réserver hors période ». A campaign without a usable period (missing
 * times, already ended) never locks.
 */
export function campaignPeriodState(
  campaign: Pick<CampaignResponse, "startDate" | "endDate" | "startTime" | "endTime"> | null,
  today: string,
  offPeriod: boolean,
): CampaignPeriodState {
  const campaignSchedule = campaign ? scheduleFromCampaign(campaign, today) : null;
  return { campaignSchedule, locked: campaignSchedule !== null && !offPeriod };
}

/** Availability window to fetch for a Porteur: [today, max(today+89, endDate)], capped. */
export function availabilityWindow(today: string, endDate?: string | null) {
  const minTo = addDaysISO(today, AVAILABILITY_FETCH_DAYS - 1);
  const maxTo = addDaysISO(today, AVAILABILITY_MAX_DAYS);
  let to = minTo;
  if (isISODate(endDate) && endDate > minTo) to = endDate > maxTo ? maxTo : endDate;
  return { from: today, to };
}

// ---------------------------------------------------------------------------------------------
// Campaigns

/** Only drafts can receive reservations from the explorer (the wizard flow). */
export function isDraftCampaign(c: Pick<CampaignResponse, "status">): boolean {
  return c.status === "BROUILLON";
}

export const CAMPAIGN_NOT_DRAFT_MESSAGE =
  "Cette campagne n'est plus en brouillon : les Porteurs se réservent avant la soumission. Choisissez un autre brouillon ou créez-en un.";

export type DraftCheck =
  | { ok: true; campaign: CampaignResponse }
  | { ok: false; campaign: CampaignResponse | null; outcome: FailedOutcome };

/**
 * Re-reads the campaign right before booking (contract §6: reservations must exist before the
 * submission, the backend accepts them in any status). The `/campaigns/mine` list may be stale
 * (submitted from another tab or from the wizard since the explorer loaded it).
 */
export async function checkDraftCampaign(
  campaignId: number,
  fetchCampaign: (id: number) => Promise<CampaignResponse>,
): Promise<DraftCheck> {
  try {
    const campaign = await fetchCampaign(campaignId);
    if (isDraftCampaign(campaign)) return { ok: true, campaign };
    return {
      ok: false,
      campaign,
      outcome: { status: "error", message: CAMPAIGN_NOT_DRAFT_MESSAGE, retryable: false },
    };
  } catch (e) {
    if (isAbortError(e)) throw e;
    return { ok: false, campaign: null, outcome: outcomeFromError(e) };
  }
}

export function draftCampaigns<C extends Pick<CampaignResponse, "status">>(
  list: readonly C[],
): C[] {
  return list.filter(isDraftCampaign);
}

/** Créneau prefilled from a campaign's own dates/times (start clamped to today), or null. */
export function scheduleFromCampaign(
  c: Pick<CampaignResponse, "startDate" | "endDate" | "startTime" | "endTime">,
  today: string,
): ScheduleDraft | null {
  if (!isISODate(c.startDate) || !isISODate(c.endDate)) return null;
  const start = toHHmm(c.startTime);
  const end = toHHmm(c.endTime);
  if (!start || !end || c.endDate < today) return null;
  return {
    startDate: c.startDate < today ? today : c.startDate,
    endDate: c.endDate,
    dayPart: dayPartFromTimes(start, end),
    customStart: start,
    customEnd: end,
  };
}

/** True when the draft period and times are exactly the campaign's. */
export function scheduleMatchesCampaign(
  draft: ScheduleDraft,
  c: Pick<CampaignResponse, "startDate" | "endDate" | "startTime" | "endTime">,
): boolean {
  const t = scheduleTimes(draft);
  return (
    draft.startDate === c.startDate &&
    draft.endDate === c.endDate &&
    t.start === toHHmm(c.startTime) &&
    t.end === toHHmm(c.endTime)
  );
}

export interface QuickDraftValues {
  name: string;
  objective: string;
  budget: string;
}

export const EMPTY_QUICK_DRAFT: QuickDraftValues = { name: "", objective: "", budget: "" };

export type QuickDraftErrors = Partial<Record<keyof QuickDraftValues | "schedule", string>>;

export type QuickDraftValidation =
  | { ok: true; request: CampaignRequest; errors: QuickDraftErrors }
  | { ok: false; request: null; errors: QuickDraftErrors };

/**
 * « Créer un brouillon rapide » : name, objective, budget validated with the campaign zod schema;
 * the campaign period and daily time range are the chosen créneau.
 */
export function validateQuickDraft(
  values: QuickDraftValues,
  draft: ScheduleDraft,
  today: string,
): QuickDraftValidation {
  const times = scheduleTimes(draft);
  const form: CampaignFormValues = {
    name: values.name,
    objective: values.objective,
    budget: values.budget,
    startDate: draft.startDate,
    endDate: draft.endDate,
    startTime: times.start ?? "",
    endTime: times.end ?? "",
  };
  const result = validateCampaignForm(form, { today });
  if (result.ok) return { ok: true, request: result.request, errors: {} };
  const errors: QuickDraftErrors = {};
  if (result.errors.name) errors.name = result.errors.name;
  if (result.errors.objective) errors.objective = result.errors.objective;
  if (result.errors.budget) errors.budget = result.errors.budget;
  const scheduleError =
    result.errors.startDate ??
    result.errors.endDate ??
    result.errors.startTime ??
    result.errors.endTime;
  if (scheduleError) errors.schedule = `Créneau : ${scheduleError}`;
  return { ok: false, request: null, errors };
}

// ---------------------------------------------------------------------------------------------
// Reservation plan

export function toReservationRequest(
  support: Pick<SupportResponse, "id" | "zoneId">,
  campaignId: number,
  period: BookingPeriod,
): ReservationRequest {
  return {
    campaignId,
    zoneId: support.zoneId,
    supportId: support.id,
    startDate: period.startDate,
    endDate: period.endDate,
    startTime: period.startTime,
    endTime: period.endTime,
  };
}

export type PlanStatus = "ready" | "not-bookable" | "unavailable" | "already-booked";

export interface PlanItem<S extends SupportResponse = SupportResponse> {
  support: S;
  status: PlanStatus;
  /** French reason for every status except « ready ». */
  reason: string | null;
  /** POST body, only for « ready » items when a campaign and a valid period are chosen. */
  request: ReservationRequest | null;
  /** Whether the availability of this Porteur was known when the plan was built. */
  availabilityChecked: boolean;
}

export interface BookingPlan<S extends SupportResponse = SupportResponse> {
  items: PlanItem<S>[];
  readyCount: number;
  blockedCount: number;
  /** A campaign, a valid period and at least one ready item. */
  canSubmit: boolean;
}

export interface BookingPlanInput<S extends SupportResponse> {
  supports: readonly S[];
  campaignId: number | null;
  period: BookingPeriod | null;
  /** Booked periods per support id (missing entry = unknown). */
  availability?: ReadonlyMap<number, readonly SupportAvailabilitySlot[]>;
  /** Existing reservations of the chosen campaign. */
  campaignReservations?: readonly ReservationResponse[];
}

function overlaps(r: Pick<ReservationResponse, "startDate" | "endDate">, p: BookingPeriod) {
  return r.startDate <= p.endDate && r.endDate >= p.startDate;
}

export function buildBookingPlan<S extends SupportResponse>({
  supports,
  campaignId,
  period,
  availability,
  campaignReservations = [],
}: BookingPlanInput<S>): BookingPlan<S> {
  const items = supports.map((support): PlanItem<S> => {
    const slots = availability?.get(support.id);
    const base = { support, availabilityChecked: slots !== undefined };
    const block = bookingBlockReason(support);
    if (block) return { ...base, status: "not-bookable", reason: block, request: null };
    if (period) {
      const own = campaignReservations.some(
        (r) =>
          r.supportId === support.id &&
          (r.reservationStatus === "TEMPORAIRE" || r.reservationStatus === "CONFIRMEE") &&
          overlaps(r, period),
      );
      if (own) {
        return { ...base, status: "already-booked", reason: ALREADY_BOOKED_MESSAGE, request: null };
      }
      const conflict = slots ? availabilityMessage(slots, period.startDate, period.endDate) : null;
      if (conflict) return { ...base, status: "unavailable", reason: conflict, request: null };
    }
    return {
      ...base,
      status: "ready",
      reason: null,
      request:
        campaignId !== null && period ? toReservationRequest(support, campaignId, period) : null,
    };
  });
  const readyCount = items.filter((i) => i.status === "ready").length;
  return {
    items,
    readyCount,
    blockedCount: items.length - readyCount,
    canSubmit: campaignId !== null && period !== null && readyCount > 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Outcomes

export type BookingOutcome =
  | { status: "reserved"; reservation: ReservationResponse }
  | { status: "conflict"; message: string }
  | { status: "error"; message: string; retryable: boolean };

export type FailedOutcome = Exclude<BookingOutcome, { status: "reserved" }>;

/** Maps a failed POST /reservations to an inline, French outcome. */
export function outcomeFromError(e: unknown): FailedOutcome {
  if (isReservationConflictError(e)) {
    return { status: "conflict", message: RESERVATION_CONFLICT_MESSAGE };
  }
  const presented = presentError(e);
  return { status: "error", message: presented.message, retryable: presented.retryable };
}

/**
 * Creates the reservations one after the other (the backend conflict check is per request, so
 * sequential calls keep outcomes deterministic). Abort stops the loop and rethrows.
 */
export async function runBookingPlan(
  requests: readonly ReservationRequest[],
  create: (request: ReservationRequest) => Promise<ReservationResponse>,
  onOutcome?: (supportId: number, outcome: BookingOutcome) => void,
): Promise<Map<number, BookingOutcome>> {
  const outcomes = new Map<number, BookingOutcome>();
  for (const request of requests) {
    let outcome: BookingOutcome;
    try {
      outcome = { status: "reserved", reservation: await create(request) };
    } catch (e) {
      if (isAbortError(e)) throw e;
      outcome = outcomeFromError(e);
    }
    outcomes.set(request.supportId, outcome);
    onOutcome?.(request.supportId, outcome);
  }
  return outcomes;
}

export interface OutcomeSummary {
  reserved: number;
  conflicts: number;
  errors: number;
  /** « 2 Porteurs réservés · 1 indisponible · 1 erreur ». */
  label: string;
}

export function summarizeOutcomes(outcomes: Iterable<BookingOutcome>): OutcomeSummary {
  let reserved = 0;
  let conflicts = 0;
  let errors = 0;
  for (const o of outcomes) {
    if (o.status === "reserved") reserved += 1;
    else if (o.status === "conflict") conflicts += 1;
    else errors += 1;
  }
  const parts: string[] = [];
  parts.push(
    reserved === 0
      ? "Aucun Porteur réservé"
      : `${reserved} Porteur${reserved > 1 ? "s" : ""} réservé${reserved > 1 ? "s" : ""}`,
  );
  if (conflicts > 0) parts.push(`${conflicts} indisponible${conflicts > 1 ? "s" : ""}`);
  if (errors > 0) parts.push(`${errors} erreur${errors > 1 ? "s" : ""}`);
  return { reserved, conflicts, errors, label: parts.join(" · ") };
}

// ---------------------------------------------------------------------------------------------
// v2 booking: campaign zones first, then one batch (contract §5 F2 item 9)

export const CAMPAIGN_ZONE_LABEL = "Sélection du réseau";

export const ZONE_LIMIT_MESSAGE =
  "Cette campagne a déjà 5 zones : ajustez ses zones dans l'assistant pour y inclure ces Porteurs.";

export interface ZoneCoverage {
  /** Circles to send with PUT /campaigns/{id}/zones, or null when every Porteur is covered. */
  zones: CampaignZoneRequest[] | null;
  /** Porteurs outside every current circle. */
  uncovered: number[];
}

/**
 * A reservation requires the Porteur inside one of the campaign circles (backend rule 6).
 * Keeps the existing circles (so no reservation is released) and adds one circle centred on the
 * uncovered Porteurs, covering them plus 0.5 km. Throws when the 5-circle limit is reached.
 */
export function planZoneCoverage(
  existing: readonly Pick<CampaignZoneResponse, "latitude" | "longitude" | "radiusKm" | "label">[],
  supports: readonly Pick<SupportResponse, "id" | "latitude" | "longitude">[],
): ZoneCoverage {
  const uncoveredSupports = supports.filter(
    (s) => !insideAnyCircle(s.latitude, s.longitude, existing),
  );
  if (uncoveredSupports.length === 0) return { zones: null, uncovered: [] };
  if (existing.length >= CAMPAIGN_ZONE_LIMITS.maxZones) throw new Error(ZONE_LIMIT_MESSAGE);
  const circle = coveringCircle(uncoveredSupports);
  if (!circle) return { zones: null, uncovered: [] };
  return {
    zones: [
      ...existing.map((z) => ({
        latitude: z.latitude,
        longitude: z.longitude,
        radiusKm: z.radiusKm,
        label: z.label ?? null,
      })),
      { ...circle, label: CAMPAIGN_ZONE_LABEL },
    ],
    uncovered: uncoveredSupports.map((s) => s.id),
  };
}

export interface BatchBookingDeps {
  zones: (campaignId: number) => Promise<CampaignZoneResponse[]>;
  setZones: (campaignId: number, zones: CampaignZoneRequest[]) => Promise<unknown>;
  createBatch: (body: ReservationBatchRequest) => Promise<ReservationResponse[]>;
}

/**
 * Books every Porteur of `requests` (same campaign and window) with POST /reservations/batch.
 * The batch is all-or-nothing: on 409 BATCH_CONFLICT the conflicting Porteurs get their own
 * message and the remaining ones are booked in a second batch. Zone coverage is ensured first.
 */
export async function runBatchBooking(
  requests: readonly ReservationRequest[],
  supports: readonly Pick<SupportResponse, "id" | "latitude" | "longitude">[],
  deps: BatchBookingDeps,
): Promise<Map<number, BookingOutcome>> {
  const outcomes = new Map<number, BookingOutcome>();
  const first = requests[0];
  if (!first) return outcomes;
  const ids = requests.map((r) => r.supportId);
  const failAll = (e: unknown, targets: readonly number[]) => {
    if (isAbortError(e)) throw e;
    const outcome =
      e instanceof Error && !(e instanceof ApiError) && e.message === ZONE_LIMIT_MESSAGE
        ? ({ status: "error", message: ZONE_LIMIT_MESSAGE, retryable: false } as const)
        : outcomeFromError(e);
    for (const id of targets) outcomes.set(id, outcome);
  };

  try {
    const wanted = new Set(ids);
    const coverage = planZoneCoverage(
      await deps.zones(first.campaignId),
      supports.filter((s) => wanted.has(s.id)),
    );
    if (coverage.zones) await deps.setZones(first.campaignId, coverage.zones);
  } catch (e) {
    failAll(e, ids);
    return outcomes;
  }

  const window = {
    campaignId: first.campaignId,
    startDate: first.startDate ?? null,
    endDate: first.endDate ?? null,
    startTime: first.startTime ?? null,
    endTime: first.endTime ?? null,
  };
  let remaining = ids;
  for (let attempt = 0; attempt < 2 && remaining.length > 0; attempt++) {
    try {
      const created = await deps.createBatch({ ...window, supportIds: remaining });
      for (const r of created) outcomes.set(r.supportId, { status: "reserved", reservation: r });
      remaining = [];
    } catch (e) {
      const conflicts = batchConflicts(e);
      const conflictIds = Object.keys(conflicts).map(Number);
      if (conflictIds.length === 0 || attempt === 1) {
        failAll(e, remaining);
        return outcomes;
      }
      for (const id of conflictIds) {
        outcomes.set(id, {
          status: "conflict",
          message: translateFieldMessage(conflicts[id]),
        });
      }
      remaining = remaining.filter((id) => !(id in conflicts));
    }
  }
  return outcomes;
}
