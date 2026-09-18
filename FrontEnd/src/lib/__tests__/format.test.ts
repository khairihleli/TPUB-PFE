import { describe, expect, it } from "vitest";

import {
  formatCompact,
  formatCoordinatesFr,
  formatCount,
  formatDate,
  formatDateRange,
  formatDateRangeLong,
  formatEstimate,
  formatNumber,
  formatRelative,
  formatTimeRangeLong,
  formatTimeRange,
  formatTND,
  fromApiTime,
  initials,
  todayISO,
  toApiTime,
  toApiTimeOrNull,
  toLocalIsoDateTime,
} from "@/lib/format";

/** Normalise narrow/nbsp spaces for stable assertions. */
const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

describe("formatTND", () => {
  it("formats whole dinars without millimes", () => {
    const out = norm(formatTND(1500));
    expect(out).toMatch(/1 ?500(?![,.]\d)/);
    expect(out).toMatch(/DT|TND/);
  });
  it("keeps the 3 millime decimals when the amount has a fraction", () => {
    expect(norm(formatTND(1500.25))).toMatch(/1 ?500[,.]250/);
  });
  it("never emits narrow no-break spaces", () => {
    expect(formatTND(15900)).not.toMatch(/\u202f/);
  });
  it("renders a dash for missing values", () => {
    expect(formatTND(null)).toBe("—");
    expect(formatTND(Number.NaN)).toBe("—");
  });
});

describe("dates", () => {
  it("never shifts a calendar date", () => {
    expect(formatDate("2026-10-01", "long")).toMatch(/^1(er)? octobre 2026$/);
    expect(formatDate("2026-10-01", "short")).toBe("01/10/2026");
  });
  it("handles null/invalid", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("pas une date")).toBe("—");
  });
  it("formats ranges", () => {
    expect(formatDateRange("2026-10-01", "2026-10-31", "short")).toBe("01/10/2026 → 31/10/2026");
  });
  it("computes today in Africa/Tunis", () => {
    // 23:30 UTC on Sept 12 is 00:30 on Sept 13 in Tunis (UTC+1).
    expect(todayISO(new Date("2026-09-12T23:30:00Z"))).toBe("2026-09-13");
    expect(toLocalIsoDateTime(new Date("2026-09-12T13:30:05Z"))).toBe("2026-09-12T14:30:05");
  });
});

describe("times", () => {
  it("adds seconds for the API", () => {
    expect(toApiTime("08:00")).toBe("08:00:00");
    expect(toApiTime("22:30:15")).toBe("22:30:15");
    expect(() => toApiTime("25:00")).toThrow();
    expect(toApiTimeOrNull("")).toBeNull();
  });
  it("strips seconds for inputs", () => {
    expect(fromApiTime("08:00:00")).toBe("08:00");
    expect(fromApiTime(null)).toBe("");
    expect(formatTimeRange("08:00:00", "22:00:00")).toBe("08:00 – 22:00");
  });
});

describe("misc", () => {
  it("initials", () => {
    expect(initials("Sami Ben Salah")).toBe("SS");
    expect(initials("Administrateur")).toBe("AD");
    expect(initials("")).toBe("?");
  });
  it("French plural (0 and 1 are singular)", () => {
    expect(formatCount(0, "campagne", "campagnes")).toBe("0 campagne");
    expect(formatCount(1, "campagne", "campagnes")).toBe("1 campagne");
    expect(formatCount(3, "campagne", "campagnes")).toBe("3 campagnes");
  });
});

describe("NBSP normaliser (VD-04)", () => {
  it("uses U+00A0 for thousands in every number formatter", () => {
    expect(formatNumber(4000)).toBe("4 000");
    expect(formatTND(9700)).toBe("9 700 DT");
    expect(formatCompact(12500)).not.toMatch(/\u202f/);
    expect(formatEstimate(120, "DT")).toBe("≈ 120 DT");
    expect(formatEstimate(4000, "vues")).toBe("≈ 4 000 vues");
  });
});

describe("relative time", () => {
  const now = new Date("2026-09-12T12:00:00Z");
  it("formats instants", () => {
    expect(formatRelative("2026-09-12T11:59:40Z", now)).toBe("à l'instant");
    expect(formatRelative("2026-09-12T11:55:00Z", now)).toBe("il y a 5 min");
    expect(formatRelative("2026-09-12T09:00:00Z", now)).toBe("il y a 3 h");
    expect(formatRelative("2026-09-17T12:00:00Z", now)).toBe("dans 5 jours");
  });
  it("formats calendar dates against the Tunis day", () => {
    expect(formatRelative("2026-09-12", now)).toBe("aujourd'hui");
    expect(formatRelative("2026-09-13", now)).toBe("demain");
    expect(formatRelative("2026-09-11", now)).toBe("hier");
    expect(formatRelative("2026-09-17", now)).toBe("dans 5 jours");
    expect(formatRelative("2026-10-12", now)).toBe("dans 4 semaines");
    expect(formatRelative(null, now)).toBe("");
  });
});

describe("long ranges and coordinates", () => {
  it("echoes a date range in French with its duration", () => {
    expect(formatDateRangeLong("2027-02-10", "2027-02-16")).toBe(
      "du mercredi 10 février au mardi 16 février 2027 · 7 jours",
    );
    expect(formatDateRangeLong("2026-12-30", "2027-01-02")).toBe(
      "du mercredi 30 décembre 2026 au samedi 2 janvier 2027 · 4 jours",
    );
    expect(formatDateRangeLong("2027-02-10", "2027-02-10")).toBe(
      "le mercredi 10 février 2027 · 1 jour",
    );
    expect(formatDateRangeLong("2027-02-16", "2027-02-10")).toBe("");
  });
  it("echoes a time range", () => {
    expect(formatTimeRangeLong("09:00", "18:00")).toBe("de 09:00 à 18:00 · 9 h");
    expect(formatTimeRangeLong("08:00:00", "08:30:00")).toBe("de 08:00 à 08:30 · 30 min");
    expect(formatTimeRangeLong("18:00", "09:00")).toBe("");
  });
  it("formats coordinates with a French comma and hemispheres", () => {
    expect(formatCoordinatesFr(36.8829, 10.3301)).toBe("36,8829° N · 10,3301° E");
    expect(formatCoordinatesFr(-3.5, -0.12345)).toBe("3,5000° S · 0,1235° O");
    expect(formatCoordinatesFr(null, 1)).toBe("—");
  });
});
