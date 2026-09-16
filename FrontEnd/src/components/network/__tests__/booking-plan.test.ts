import { describe, expect, it, vi } from "vitest";

import {
  ALREADY_BOOKED_MESSAGE,
  availabilityWindow,
  buildBookingPlan,
  campaignPeriodState,
  CHOOSE_CAMPAIGN_REASON,
  CONFLICT_REASON,
  CAMPAIGN_NOT_DRAFT_MESSAGE,
  checkDraftCampaign,
  createDefaultSchedule,
  draftCampaigns,
  formatShortPeriod,
  nextAvailabilityLabel,
  nextFreeWindow,
  outcomeFromError,
  pickDay,
  proposeDefaultSchedule,
  RESERVATION_CONFLICT_MESSAGE,
  reserveBlocker,
  reserveButtonLabel,
  runBookingPlan,
  sameSchedule,
  scheduleFromCampaign,
  scheduleLengthDays,
  scheduleMatchesCampaign,
  scheduleTimes,
  scheduleWithDates,
  scheduleWithTimes,
  selectDayPart,
  summarizeOutcomes,
  toReservationRequest,
  validateQuickDraft,
  validateSchedule,
  type ScheduleDraft,
} from "@/components/network/booking-plan";
import { campaign, reservation } from "@/components/espace/__tests__/fixtures";
import { ApiError, ApiTransportError } from "@/lib/api/errors";
import type { ReservationRequest, SupportAvailabilitySlot } from "@/lib/api/types";
import { support } from "@/lib/network/__tests__/fixtures";

const TODAY = "2026-09-13";

const draft = (patch: Partial<ScheduleDraft> = {}): ScheduleDraft => ({
  startDate: "2026-10-01",
  endDate: "2026-10-07",
  dayPart: "journee",
  customStart: "08:00",
  customEnd: "22:00",
  ...patch,
});

const slot = (
  startDate: string,
  endDate: string,
  reservationStatus: SupportAvailabilitySlot["reservationStatus"] = "TEMPORAIRE",
): SupportAvailabilitySlot => ({
  startDate,
  endDate,
  startTime: "17:00:00",
  endTime: "23:00:00",
  reservationStatus,
});

describe("créneau: day-parts → times", () => {
  it("maps every preset to the spec times", () => {
    expect(scheduleTimes(draft({ dayPart: "matin" }))).toEqual({ start: "07:00", end: "11:00" });
    expect(scheduleTimes(draft({ dayPart: "midi" }))).toEqual({ start: "11:00", end: "15:00" });
    expect(scheduleTimes(draft({ dayPart: "apres-midi" }))).toEqual({
      start: "15:00",
      end: "19:00",
    });
    expect(scheduleTimes(draft({ dayPart: "soiree" }))).toEqual({ start: "19:00", end: "23:00" });
    expect(scheduleTimes(draft({ dayPart: "journee" }))).toEqual({ start: "08:00", end: "22:00" });
  });

  it("uses the custom times for « Personnalisé » and rejects malformed ones", () => {
    expect(
      scheduleTimes(draft({ dayPart: "personnalise", customStart: "09:30", customEnd: "12:15" })),
    ).toEqual({ start: "09:30", end: "12:15" });
    expect(
      scheduleTimes(draft({ dayPart: "personnalise", customStart: "25:00", customEnd: "" })),
    ).toEqual({ start: null, end: null });
  });

  it("switching to « Personnalisé » starts from the previous preset", () => {
    const next = selectDayPart(draft({ dayPart: "soiree" }), "personnalise");
    expect(next).toMatchObject({
      dayPart: "personnalise",
      customStart: "19:00",
      customEnd: "23:00",
    });
    const same = draft();
    expect(selectDayPart(same, "journee")).toBe(same);
  });

  it("default schedule starts tomorrow for 7 days, all day", () => {
    expect(createDefaultSchedule(TODAY)).toEqual({
      startDate: "2026-09-14",
      endDate: "2026-09-20",
      dayPart: "journee",
      customStart: "08:00",
      customEnd: "22:00",
    });
  });
});

describe("pickDay (availability strip clicks)", () => {
  it("first click = one-day period, second click = end, earlier day restarts", () => {
    const a = pickDay(draft(), "2026-10-10", false);
    expect(a).toEqual({
      draft: expect.objectContaining({ startDate: "2026-10-10", endDate: "2026-10-10" }),
      awaitingEnd: true,
    });
    const b = pickDay(a.draft, "2026-10-14", a.awaitingEnd);
    expect(b.draft).toMatchObject({ startDate: "2026-10-10", endDate: "2026-10-14" });
    expect(b.awaitingEnd).toBe(false);
    const c = pickDay(a.draft, "2026-10-02", true);
    expect(c.draft).toMatchObject({ startDate: "2026-10-02", endDate: "2026-10-02" });
    expect(c.awaitingEnd).toBe(true);
  });

  it("ignores invalid days", () => {
    const d = draft();
    expect(pickDay(d, "2026-02-30", false)).toEqual({ draft: d, awaitingEnd: false });
  });
});

describe("validateSchedule", () => {
  it("accepts a valid future period and builds HH:mm:ss times", () => {
    const v = validateSchedule(draft({ dayPart: "matin" }), { today: TODAY });
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual({});
    expect(v.period).toEqual({
      startDate: "2026-10-01",
      endDate: "2026-10-07",
      startTime: "07:00:00",
      endTime: "11:00:00",
    });
  });

  it("rejects a past start, an inverted range and missing dates", () => {
    expect(validateSchedule(draft({ startDate: "2026-09-12" }), { today: TODAY }).errors).toEqual({
      startDate: "La date de début ne peut pas être dans le passé.",
    });
    const inverted = validateSchedule(draft({ endDate: "2026-09-30" }), { today: TODAY });
    expect(inverted.errors.endDate).toMatch(/postérieure/);
    expect(inverted.period).toBeNull();
    expect(
      validateSchedule(draft({ startDate: "", endDate: "" }), { today: TODAY }).errors,
    ).toEqual({ startDate: "Choisissez la date de début.", endDate: "Choisissez la date de fin." });
  });

  it("accepts a one-day period starting today", () => {
    expect(validateSchedule(draft({ startDate: TODAY, endDate: TODAY }), { today: TODAY }).ok).toBe(
      true,
    );
  });

  it("requires end time after start time for custom hours", () => {
    const v = validateSchedule(
      draft({ dayPart: "personnalise", customStart: "18:00", customEnd: "18:00" }),
      { today: TODAY },
    );
    expect(v.ok).toBe(false);
    expect(v.errors.times).toBe("L'heure de fin doit être après l'heure de début.");
    expect(v.period).toBeNull();
  });

  it("flags a period overlapping a booked slot (whole days, times ignored)", () => {
    const slots = [slot("2026-10-07", "2026-10-09", "CONFIRMEE")];
    const v = validateSchedule(draft({ dayPart: "matin" }), { today: TODAY, slots });
    expect(v.ok).toBe(false);
    expect(v.errors).toEqual({});
    expect(v.availability).toMatch(/^Période indisponible/);
    // the period itself stays valid (only availability blocks it)
    expect(v.period).not.toBeNull();
    expect(validateSchedule(draft({ endDate: "2026-10-06" }), { today: TODAY, slots }).ok).toBe(
      true,
    );
  });

  it("ignores availability when the slots are unknown", () => {
    expect(validateSchedule(draft(), { today: TODAY }).availability).toBeNull();
  });
});

describe("availabilityWindow", () => {
  it("covers at least 90 days and extends to the chosen end date, capped", () => {
    expect(availabilityWindow(TODAY)).toEqual({ from: TODAY, to: "2026-12-11" });
    expect(availabilityWindow(TODAY, "2027-01-15")).toEqual({ from: TODAY, to: "2027-01-15" });
    expect(availabilityWindow(TODAY, "2030-01-01").to).toBe("2028-09-12");
    expect(availabilityWindow(TODAY, "nope").to).toBe("2026-12-11");
  });
});

describe("campaign helpers", () => {
  it("keeps only drafts", () => {
    const list = [
      campaign({ id: 1 }),
      campaign({ id: 2, status: "ACTIVE" }),
      campaign({ id: 3, status: "REJECTED_BY_AI" }),
    ];
    expect(draftCampaigns(list).map((c) => c.id)).toEqual([1]);
  });

  it("prefills the créneau from a campaign, clamping a past start to today", () => {
    expect(
      scheduleFromCampaign(
        campaign({
          id: 1,
          startDate: "2026-09-01",
          endDate: "2026-09-30",
          startTime: "19:00:00",
          endTime: "23:00:00",
        }),
        TODAY,
      ),
    ).toEqual({
      startDate: TODAY,
      endDate: "2026-09-30",
      dayPart: "soiree",
      customStart: "19:00",
      customEnd: "23:00",
    });
    expect(
      scheduleFromCampaign(campaign({ id: 2, startTime: "09:15:00", endTime: "12:00:00" }), TODAY)
        ?.dayPart,
    ).toBe("personnalise");
    expect(scheduleFromCampaign(campaign({ id: 3, startDate: null }), TODAY)).toBeNull();
    expect(
      scheduleFromCampaign(
        campaign({ id: 4, startDate: "2026-08-01", endDate: "2026-08-31" }),
        TODAY,
      ),
    ).toBeNull();
  });

  it("compares a draft with a campaign period", () => {
    const c = campaign({ id: 1 });
    expect(
      scheduleMatchesCampaign(draft({ startDate: "2026-10-01", endDate: "2026-10-31" }), c),
    ).toBe(true);
    expect(scheduleMatchesCampaign(draft({ endDate: "2026-10-31", dayPart: "matin" }), c)).toBe(
      false,
    );
  });
});

describe("validateQuickDraft (existing campaign schema)", () => {
  const values = {
    name: "  Lancement boutique ",
    objective: "Faire connaître l'ouverture de la boutique",
    budget: "1 500,50",
  };

  it("builds a CampaignRequest whose dates/times are the créneau", () => {
    const result = validateQuickDraft(values, draft({ dayPart: "soiree" }), TODAY);
    expect(result.ok).toBe(true);
    expect(result.request).toEqual({
      name: "Lancement boutique",
      objective: "Faire connaître l'ouverture de la boutique",
      budget: 1500.5,
      startDate: "2026-10-01",
      endDate: "2026-10-07",
      startTime: "19:00:00",
      endTime: "23:00:00",
    });
  });

  it("returns French field errors and a single créneau error", () => {
    const result = validateQuickDraft(
      { name: "", objective: "court", budget: "-3" },
      draft({ startDate: "2026-09-01" }),
      TODAY,
    );
    expect(result.ok).toBe(false);
    expect(result.errors.name).toBe("Donnez un nom à votre campagne.");
    expect(result.errors.objective).toMatch(/10 caractères minimum/);
    expect(result.errors.budget).toBeDefined();
    expect(result.errors.schedule).toBe("Créneau : La date de début ne peut pas être passée.");
  });
});

describe("booking plan", () => {
  const period = {
    startDate: "2026-10-01",
    endDate: "2026-10-07",
    startTime: "08:00:00",
    endTime: "22:00:00",
  };
  const a = support({ id: 1, zoneId: 5, porteurType: "A" });
  const d = support({ id: 2, zoneId: 5, porteurType: "D" });
  const maintenance = support({
    id: 3,
    zoneId: 6,
    technicalStatus: "MAINTENANCE",
    porteurType: "B",
  });
  const busy = support({ id: 4, zoneId: 7, porteurType: "C" });
  const own = support({ id: 5, zoneId: 7, porteurType: "C" });

  it("sends the support's own zoneId", () => {
    expect(toReservationRequest(a, 42, period)).toEqual({
      campaignId: 42,
      zoneId: 5,
      supportId: 1,
      ...period,
    });
  });

  it("classifies each Porteur: ready / not-bookable / unavailable / already booked", () => {
    const plan = buildBookingPlan({
      supports: [a, d, maintenance, busy, own],
      campaignId: 42,
      period,
      availability: new Map([
        [1, []],
        [4, [slot("2026-10-05", "2026-10-06")]],
        [5, [slot("2026-10-01", "2026-10-02")]],
      ]),
      campaignReservations: [
        reservation({
          id: 9,
          campaignId: 42,
          supportId: 5,
          startDate: "2026-10-01",
          endDate: "2026-10-02",
        }),
        reservation({ id: 10, campaignId: 42, supportId: 1, reservationStatus: "ANNULEE" }),
      ],
    });
    expect(plan.items.map((i) => i.status)).toEqual([
      "ready",
      "not-bookable",
      "not-bookable",
      "unavailable",
      "already-booked",
    ]);
    expect(plan.items[0]?.request).toEqual(toReservationRequest(a, 42, period));
    expect(plan.items[0]?.availabilityChecked).toBe(true);
    expect(plan.items[1]?.reason).toMatch(/type D/);
    expect(plan.items[2]?.reason).toMatch(/maintenance/);
    expect(plan.items[3]?.reason).toMatch(/^Période indisponible/);
    expect(plan.items[4]?.reason).toBe(ALREADY_BOOKED_MESSAGE);
    expect(plan).toMatchObject({ readyCount: 1, blockedCount: 4, canSubmit: true });
  });

  it("cannot submit without a campaign or a valid period", () => {
    const noCampaign = buildBookingPlan({ supports: [a], campaignId: null, period });
    expect(noCampaign.canSubmit).toBe(false);
    expect(noCampaign.items[0]).toMatchObject({
      status: "ready",
      request: null,
      availabilityChecked: false,
    });
    expect(buildBookingPlan({ supports: [a], campaignId: 1, period: null }).canSubmit).toBe(false);
    expect(buildBookingPlan({ supports: [d], campaignId: 1, period }).canSubmit).toBe(false);
  });
});

describe("outcomes", () => {
  it("maps the backend conflict and other errors to French inline messages", () => {
    const conflict = new ApiError(400, "Support déjà réservé", {
      rawMessage: "Support already reserved for the selected period",
    });
    expect(outcomeFromError(conflict)).toEqual({
      status: "conflict",
      message: RESERVATION_CONFLICT_MESSAGE,
    });
    expect(
      outcomeFromError(new ApiError(502, "Le service TPUB est momentanément indisponible.")),
    ).toMatchObject({
      status: "error",
      retryable: true,
    });
    expect(outcomeFromError(new ApiError(404, "Campagne introuvable"))).toMatchObject({
      status: "error",
      message: "Campagne introuvable",
      retryable: false,
    });
  });

  it("runs requests sequentially and reports each outcome", async () => {
    const order: number[] = [];
    const requests: ReservationRequest[] = [1, 2, 3].map((id) =>
      toReservationRequest(support({ id, zoneId: 1 }), 42, {
        startDate: "2026-10-01",
        endDate: "2026-10-02",
        startTime: "08:00:00",
        endTime: "22:00:00",
      }),
    );
    const create = vi.fn(async (r: ReservationRequest) => {
      order.push(r.supportId);
      await Promise.resolve();
      if (r.supportId === 2) {
        throw new ApiError(400, "x", {
          rawMessage: "Support already reserved for the selected period",
        });
      }
      if (r.supportId === 3) throw new ApiTransportError("network");
      return reservation({ id: 100 + r.supportId, campaignId: 42, supportId: r.supportId });
    });
    const seen = vi.fn();
    const outcomes = await runBookingPlan(requests, create, seen);
    expect(order).toEqual([1, 2, 3]);
    expect(seen).toHaveBeenCalledTimes(3);
    expect([...outcomes.values()].map((o) => o.status)).toEqual(["reserved", "conflict", "error"]);
    expect(summarizeOutcomes(outcomes.values())).toEqual({
      reserved: 1,
      conflicts: 1,
      errors: 1,
      label: "1 Porteur réservé · 1 indisponible · 1 erreur",
    });
  });

  it("stops on abort", async () => {
    const abort = new ApiTransportError("aborted");
    await expect(
      runBookingPlan(
        [
          toReservationRequest(support({ id: 1 }), 1, {
            startDate: "2026-10-01",
            endDate: "2026-10-01",
            startTime: "08:00:00",
            endTime: "09:00:00",
          }),
        ],
        () => Promise.reject(abort),
      ),
    ).rejects.toBe(abort);
  });

  it("summarizes plurals and the empty case", () => {
    expect(summarizeOutcomes([]).label).toBe("Aucun Porteur réservé");
    const r = { status: "reserved", reservation: reservation({ id: 1, campaignId: 1 }) } as const;
    expect(summarizeOutcomes([r, r]).label).toBe("2 Porteurs réservés");
  });

  it("re-checks the campaign status right before booking", async () => {
    const ok = await checkDraftCampaign(5, (id) => Promise.resolve(campaign({ id })));
    expect(ok.ok).toBe(true);

    const submitted = await checkDraftCampaign(5, (id) =>
      Promise.resolve(campaign({ id, status: "PENDING_AI_CHECK" })),
    );
    expect(submitted).toMatchObject({
      ok: false,
      campaign: { id: 5, status: "PENDING_AI_CHECK" },
      outcome: { status: "error", message: CAMPAIGN_NOT_DRAFT_MESSAGE, retryable: false },
    });

    const failed = await checkDraftCampaign(5, () =>
      Promise.reject(new ApiError(404, "Campagne introuvable")),
    );
    expect(failed.ok).toBe(false);

    const abort = new ApiTransportError("aborted");
    await expect(checkDraftCampaign(5, () => Promise.reject(abort))).rejects.toBe(abort);
  });
});

describe("campaign-first créneau helpers", () => {
  it("derives the day-part from explicit times", () => {
    expect(scheduleWithTimes(draft(), "19:00", "23:00")).toMatchObject({
      dayPart: "soiree",
      customStart: "19:00",
      customEnd: "23:00",
    });
    const custom = scheduleWithTimes(draft(), "09:30", "12:00");
    expect(custom.dayPart).toBe("personnalise");
    expect(scheduleTimes(custom)).toEqual({ start: "09:30", end: "12:00" });
  });

  it("compares schedules on dates and effective times", () => {
    expect(sameSchedule(draft(), scheduleWithTimes(draft(), "08:00", "22:00"))).toBe(true);
    expect(sameSchedule(draft(), draft({ endDate: "2026-10-08" }))).toBe(false);
    expect(sameSchedule(draft(), draft({ dayPart: "matin" }))).toBe(false);
  });

  it("measures the period and moves it onto a window", () => {
    expect(scheduleLengthDays(draft())).toBe(7);
    expect(scheduleLengthDays(draft({ endDate: "2026-09-30" }))).toBeNull();
    expect(scheduleLengthDays(draft({ startDate: "" }))).toBeNull();
    expect(
      scheduleWithDates(draft({ dayPart: "soiree" }), {
        startDate: "2026-11-01",
        endDate: "2026-11-03",
      }),
    ).toMatchObject({ startDate: "2026-11-01", endDate: "2026-11-03", dayPart: "soiree" });
  });

  it("finds the next free window from tomorrow, inside the fetched window only", () => {
    const slots = [slot("2026-09-14", "2026-09-17")];
    expect(nextFreeWindow(slots, { today: TODAY, to: "2026-12-11", lengthDays: 7 })).toEqual({
      startDate: "2026-09-18",
      endDate: "2026-09-24",
    });
    // Not enough known days after the booking: no claim.
    expect(nextFreeWindow(slots, { today: TODAY, to: "2026-09-20", lengthDays: 7 })).toBeNull();
    expect(nextFreeWindow([], { today: TODAY, to: "2026-12-11", lengthDays: 1 })).toEqual({
      startDate: "2026-09-14",
      endDate: "2026-09-14",
    });
  });

  it("proposes the first free week only when it differs from the draft (FFA-08)", () => {
    const initial = createDefaultSchedule(TODAY); // 14 → 20 sept.
    expect(proposeDefaultSchedule(initial, [], { today: TODAY, to: "2026-12-11" })).toBeNull();
    expect(
      proposeDefaultSchedule(initial, [slot("2026-09-15", "2026-09-15")], {
        today: TODAY,
        to: "2026-12-11",
      }),
    ).toMatchObject({ startDate: "2026-09-16", endDate: "2026-09-22", dayPart: "journee" });
  });

  it("formats compact periods and labels", () => {
    expect(formatShortPeriod("2026-09-14", "2026-09-20")).toBe("14–20 sept.");
    expect(formatShortPeriod("2026-09-28", "2026-10-04")).toBe("28 sept. – 4 oct.");
    expect(formatShortPeriod("2026-12-28", "2027-01-03")).toBe("28 déc. 2026 – 3 janv. 2027");
    expect(formatShortPeriod("2026-09-14", "2026-09-14")).toBe("14 sept.");
    expect(formatShortPeriod("2026-09-20", "2026-09-14")).toBe("");
    expect(reserveButtonLabel(draft())).toBe("Réserver ce Porteur · 1–7 oct.");
    expect(reserveButtonLabel(draft({ startDate: "" }))).toBe("Réserver ce Porteur");
    expect(nextAvailabilityLabel({ startDate: "2026-10-14", endDate: "2026-10-20" })).toBe(
      "Prochaine disponibilité : 14 oct. → 20 oct.",
    );
  });

  it("explains why booking is not available yet, in order", () => {
    const ok = validateSchedule(draft(), { today: TODAY, slots: [] });
    const busy = validateSchedule(draft(), {
      today: TODAY,
      slots: [slot("2026-10-02", "2026-10-03")],
    });
    const invalid = validateSchedule(draft({ endDate: "" }), { today: TODAY });
    expect(reserveBlocker({ porteurBlock: "Non", hasCampaign: true, validation: ok })).toEqual({
      kind: "porteur",
      reason: "Non",
    });
    expect(reserveBlocker({ porteurBlock: null, hasCampaign: false, validation: ok })?.reason).toBe(
      CHOOSE_CAMPAIGN_REASON,
    );
    expect(
      reserveBlocker({ porteurBlock: null, hasCampaign: true, validation: invalid })?.kind,
    ).toBe("schedule");
    expect(
      reserveBlocker({ porteurBlock: null, hasCampaign: true, validation: busy })?.reason,
    ).toBe(CONFLICT_REASON);
    expect(reserveBlocker({ porteurBlock: null, hasCampaign: true, validation: ok })).toBeNull();
  });

  it("locks the créneau on a campaign with a usable period unless off-period is acknowledged", () => {
    const c = campaign({ id: 3 });
    expect(campaignPeriodState(null, TODAY, false)).toEqual({
      campaignSchedule: null,
      locked: false,
    });
    const locked = campaignPeriodState(c, TODAY, false);
    expect(locked.locked).toBe(true);
    expect(locked.campaignSchedule).toMatchObject({
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    });
    expect(campaignPeriodState(c, TODAY, true).locked).toBe(false);
    // Ended or incomplete campaign: never locked.
    expect(campaignPeriodState({ ...c, endDate: "2026-09-01" }, TODAY, false).locked).toBe(false);
    expect(campaignPeriodState({ ...c, startTime: null }, TODAY, false).locked).toBe(false);
  });
});
