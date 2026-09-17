import { describe, expect, it } from "vitest";

import type { SupportAvailabilitySlot } from "@/lib/api/types";
import {
  addDaysISO,
  availabilityMessage,
  blockedDays,
  isBlockSlot,
  buildCalendarStrip,
  conflictingSlots,
  DAY_PARTS,
  DAY_STATUS_LABEL,
  dayPartFromTimes,
  diffDaysISO,
  eachDayISO,
  findFirstFreeWindow,
  firstFreeWindow,
  getDayPart,
  isISODate,
  isRangeFree,
  toHHmm,
  validateDateRange,
  validateTimeRange,
} from "@/lib/network/availability";

const slot = (
  startDate: string,
  endDate: string,
  reservationStatus: SupportAvailabilitySlot["reservationStatus"] = "TEMPORAIRE",
): SupportAvailabilitySlot => ({
  startDate,
  endDate,
  startTime: "08:00:00",
  endTime: "10:00:00",
  reservationStatus,
});

const SLOTS = [slot("2026-10-05", "2026-10-07"), slot("2026-10-10", "2026-10-10", "CONFIRMEE")];

describe("ISO date helpers", () => {
  it("validates real calendar dates", () => {
    expect(isISODate("2026-02-28")).toBe(true);
    expect(isISODate("2028-02-29")).toBe(true);
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("2026-2-3")).toBe(false);
    expect(isISODate(20261001)).toBe(false);
  });

  it("adds days across months, years and DST", () => {
    expect(addDaysISO("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysISO("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
    expect(() => addDaysISO("nope", 1)).toThrow(RangeError);
    expect(diffDaysISO("2026-10-01", "2026-10-31")).toBe(30);
  });

  it("expands inclusive ranges", () => {
    expect(eachDayISO("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    expect(eachDayISO("2026-10-02", "2026-10-01")).toEqual([]);
    expect(eachDayISO("x", "2026-10-01")).toEqual([]);
    expect(eachDayISO("2026-01-01", "2030-01-01", 5)).toHaveLength(5);
  });
});

describe("blockedDays", () => {
  it("expands every blocking slot", () => {
    expect([...blockedDays(SLOTS)]).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-10",
    ]);
  });

  it("clips to a window and ignores invalid slots/statuses", () => {
    const weird = [
      ...SLOTS,
      slot("bad", "2026-10-01"),
      {
        ...slot("2026-10-20", "2026-10-21"),
        reservationStatus: "ANNULEE",
      } as unknown as SupportAvailabilitySlot,
    ];
    expect([...blockedDays(weird, { from: "2026-10-06", to: "2026-10-09" })]).toEqual([
      "2026-10-06",
      "2026-10-07",
    ]);
  });
});

describe("isRangeFree & conflicts (backend rule: dates overlap, times ignored)", () => {
  it.each([
    ["2026-10-01", "2026-10-04", true],
    ["2026-10-01", "2026-10-05", false],
    ["2026-10-07", "2026-10-09", false],
    ["2026-10-08", "2026-10-09", true],
    ["2026-10-10", "2026-10-10", false],
    ["2026-10-11", "2026-10-30", true],
    ["2026-10-01", "2026-10-31", false],
  ])("%s → %s free=%s", (start, end, free) => {
    expect(isRangeFree(SLOTS, start, end)).toBe(free);
  });

  it("an invalid range is never free", () => {
    expect(isRangeFree([], "2026-10-02", "2026-10-01")).toBe(false);
    expect(isRangeFree([], "", "2026-10-01")).toBe(false);
    expect(isRangeFree([], "2026-10-01", "2026-10-01")).toBe(true);
    expect(conflictingSlots(SLOTS, "2026-10-09", "2026-10-01")).toEqual([]);
  });

  it("returns the overlapping slots", () => {
    expect(conflictingSlots(SLOTS, "2026-10-06", "2026-10-12")).toHaveLength(2);
  });

  it("builds a French unavailability message", () => {
    expect(availabilityMessage(SLOTS, "2026-10-20", "2026-10-21")).toBeNull();
    const one = availabilityMessage(SLOTS, "2026-10-06", "2026-10-06");
    expect(one).toMatch(/^Période indisponible/);
    expect(one).toContain("5 oct. 2026");
    expect(availabilityMessage(SLOTS, "2026-10-01", "2026-10-31")).toContain("et 1 autre période");
    expect(
      availabilityMessage([...SLOTS, slot("2026-10-20", "2026-10-20")], "2026-10-01", "2026-10-31"),
    ).toContain("et 2 autres périodes");
  });
});

describe("findFirstFreeWindow", () => {
  it("returns from itself when free", () => {
    expect(findFirstFreeWindow(SLOTS, { from: "2026-10-01", lengthDays: 3 })).toEqual({
      startDate: "2026-10-01",
      endDate: "2026-10-03",
    });
  });

  it("skips blocked days", () => {
    expect(findFirstFreeWindow(SLOTS, { from: "2026-10-04", lengthDays: 3 })).toEqual({
      startDate: "2026-10-11",
      endDate: "2026-10-13",
    });
    expect(findFirstFreeWindow(SLOTS, { from: "2026-10-05", lengthDays: 2 })).toEqual({
      startDate: "2026-10-08",
      endDate: "2026-10-09",
    });
  });

  it("returns null when the horizon is too short or input invalid", () => {
    expect(
      findFirstFreeWindow(SLOTS, { from: "2026-10-05", lengthDays: 5, horizonDays: 6 }),
    ).toBeNull();
    expect(
      findFirstFreeWindow(SLOTS, { from: "2026-10-01", lengthDays: 10, horizonDays: 3 }),
    ).toBeNull();
    expect(findFirstFreeWindow(SLOTS, { from: "bad", lengthDays: 1 })).toBeNull();
  });

  it("treats lengthDays < 1 as 1 day", () => {
    expect(findFirstFreeWindow(SLOTS, { from: "2026-10-05", lengthDays: 0 })).toEqual({
      startDate: "2026-10-08",
      endDate: "2026-10-08",
    });
  });
});

describe("v2 availability blocks", () => {
  const block: SupportAvailabilitySlot = {
    startDate: "2026-10-05",
    endDate: "2026-10-05",
    startTime: "07:00:00",
    endTime: "12:00:00",
    kind: "BLOCAGE",
    reservationStatus: null,
    availabilityStatus: "MAINTENANCE",
    reason: "Remplacement de la dalle",
  };

  it("counts a TPUB block as blocking and shows it as taken", () => {
    expect(isBlockSlot(block)).toBe(true);
    expect([...blockedDays([block])]).toEqual(["2026-10-05"]);
    const strip = buildCalendarStrip([block], "2026-10-04", 3);
    expect(strip.map((d) => d.status)).toEqual(["libre", "confirmee", "libre"]);
  });
});

describe("buildCalendarStrip", () => {
  it("builds N days with statuses, CONFIRMEE winning", () => {
    const strip = buildCalendarStrip(
      [...SLOTS, slot("2026-10-10", "2026-10-11")],
      "2026-09-29",
      14,
    );
    expect(strip).toHaveLength(14);
    expect(strip[0]).toMatchObject({
      date: "2026-09-29",
      status: "libre",
      blocked: false,
      weekday: 2,
    });
    expect(strip.find((d) => d.date === "2026-10-01")?.monthStart).toBe(true);
    expect(strip.find((d) => d.date === "2026-10-06")?.status).toBe("temporaire");
    expect(strip.find((d) => d.date === "2026-10-10")?.status).toBe("confirmee");
    expect(strip.find((d) => d.date === "2026-10-11")?.status).toBe("temporaire");
    expect(strip.filter((d) => d.blocked)).toHaveLength(5);
  });

  it("defaults to 60 days and handles bad input", () => {
    expect(buildCalendarStrip([], "2026-10-01")).toHaveLength(60);
    expect(buildCalendarStrip([], "bad")).toEqual([]);
    expect(buildCalendarStrip([], "2026-10-01", 0)).toEqual([]);
    expect(DAY_STATUS_LABEL.confirmee).toBe("Réservé (confirmé)");
  });
});

describe("day parts", () => {
  it("exposes the spec presets", () => {
    expect(DAY_PARTS.map((p) => [p.label, p.start, p.end])).toEqual([
      ["Matin", "07:00", "11:00"],
      ["Midi", "11:00", "15:00"],
      ["Après-midi", "15:00", "19:00"],
      ["Soirée", "19:00", "23:00"],
      ["Journée", "08:00", "22:00"],
      ["Personnalisé", null, null],
    ]);
    expect(getDayPart("soiree").start).toBe("19:00");
    expect(getDayPart("personnalise").start).toBeNull();
  });

  it("maps times back to a preset", () => {
    expect(dayPartFromTimes("08:00:00", "22:00:00")).toBe("journee");
    expect(dayPartFromTimes("07:00", "11:00")).toBe("matin");
    expect(dayPartFromTimes("07:30", "11:00")).toBe("personnalise");
    expect(dayPartFromTimes(null, undefined)).toBe("personnalise");
  });

  it("parses HH:mm", () => {
    expect(toHHmm("08:00:00")).toBe("08:00");
    expect(toHHmm(" 23:59 ")).toBe("23:59");
    expect(toHHmm("24:00")).toBeNull();
    expect(toHHmm("8:00")).toBeNull();
    expect(toHHmm("")).toBeNull();
  });

  it("validates time and date ranges in French", () => {
    expect(validateTimeRange("08:00", "10:00")).toBeNull();
    expect(validateTimeRange("10:00", "10:00")).toMatch(/après/);
    expect(validateTimeRange("x", "10:00")).toMatch(/Indiquez/);
    expect(validateDateRange("2026-10-01", "2026-10-02", "2026-09-30")).toBeNull();
    expect(validateDateRange("2026-09-01", "2026-10-02", "2026-09-30")).toMatch(/passé/);
    expect(validateDateRange("2026-10-03", "2026-10-02")).toMatch(/après/);
    expect(validateDateRange(null, "2026-10-02")).toMatch(/Indiquez/);
  });
});

describe("firstFreeWindow (positional shorthand)", () => {
  it("returns the first free window after the booked days", () => {
    const slots: SupportAvailabilitySlot[] = [
      {
        startDate: "2027-09-01",
        endDate: "2027-09-10",
        startTime: "08:00:00",
        endTime: "22:00:00",
        reservationStatus: "CONFIRMEE",
      },
    ];
    expect(firstFreeWindow(slots, 7, "2027-09-01")).toEqual({
      startDate: "2027-09-11",
      endDate: "2027-09-17",
    });
    expect(firstFreeWindow(slots, 7, "2027-09-01", 12)).toBeNull();
  });
});
