import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  buildMonthGrid,
  clampISODate,
  daysInclusive,
  firstUnavailableRun,
  formatDayLong,
  formatFrDateInput,
  formatMonthTitle,
  maskFrDateInput,
  mondayIndex,
  moveCalendarFocus,
  parseFrDate,
  presetRange,
  timeOptions,
  timeToMinutes,
} from "@/lib/date-input";

describe("parseFrDate", () => {
  it.each([
    ["10/02/2027", "2027-02-10"],
    ["1/2/2027", "2027-02-01"],
    ["10.02.2027", "2027-02-10"],
    ["10-02-2027", "2027-02-10"],
    ["10022027", "2027-02-10"],
    ["2027-02-10", "2027-02-10"],
    [" 29/02/2028 ", "2028-02-29"],
  ])("%s → %s", (input, expected) => {
    expect(parseFrDate(input)).toBe(expected);
  });

  it.each(["31/02/2027", "29/02/2027", "10/13/2027", "10/02/27", "abc", "", "00/01/2027"])(
    "rejects %s",
    (input) => {
      expect(parseFrDate(input)).toBeNull();
    },
  );
});

describe("masks and formatting", () => {
  it("auto-inserts slashes while typing digits", () => {
    expect(maskFrDateInput("1")).toBe("1");
    expect(maskFrDateInput("100")).toBe("10/0");
    expect(maskFrDateInput("1002")).toBe("10/02");
    expect(maskFrDateInput("10022027")).toBe("10/02/2027");
    expect(maskFrDateInput("100220271")).toBe("10/02/2027");
    expect(maskFrDateInput("10a02")).toBe("10/02");
  });
  it("keeps user separators and converts an ISO paste", () => {
    expect(maskFrDateInput("1/2/2027")).toBe("1/2/2027");
    expect(maskFrDateInput("1/")).toBe("1/");
    expect(maskFrDateInput("2027-02-10")).toBe("10/02/2027");
  });
  it("formats ISO for the input", () => {
    expect(formatFrDateInput("2027-02-10")).toBe("10/02/2027");
    expect(formatFrDateInput("2027-02-30")).toBe("");
    expect(formatFrDateInput(null)).toBe("");
  });
  it("names days and months in French", () => {
    expect(formatDayLong("2027-02-10")).toBe("mercredi 10 février 2027");
    expect(formatMonthTitle("2027-02-10")).toBe("février 2027");
  });
});

describe("arithmetic and presets", () => {
  it("adds days and months without drift", () => {
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2027-03-15", -12)).toBe("2026-03-15");
    expect(daysInclusive("2027-02-10", "2027-02-16")).toBe(7);
    expect(daysInclusive("2027-02-16", "2027-02-10")).toBeNull();
  });

  it("builds presets from the chosen start, else tomorrow", () => {
    expect(presetRange("1w", "2027-02-10", "2027-01-01")).toEqual({
      start: "2027-02-10",
      end: "2027-02-16",
    });
    expect(presetRange("2w", "2027-02-10", "2027-01-01").end).toBe("2027-02-23");
    expect(presetRange("1m", "2027-02-10", "2027-01-01").end).toBe("2027-03-09");
    expect(presetRange("1w", "", "2027-01-01")).toEqual({ start: "2027-01-02", end: "2027-01-08" });
  });

  it("clamps into bounds", () => {
    expect(clampISODate("2027-01-01", "2027-02-01")).toBe("2027-02-01");
    expect(clampISODate("2027-05-01", null, "2027-03-01")).toBe("2027-03-01");
  });

  it("finds the first unavailable run inside a range", () => {
    const busy = new Set(["2027-09-14", "2027-09-15", "2027-09-20"]);
    expect(firstUnavailableRun("2027-09-10", "2027-09-30", (d) => busy.has(d))).toEqual({
      start: "2027-09-14",
      end: "2027-09-15",
    });
    expect(firstUnavailableRun("2027-09-01", "2027-09-05", (d) => busy.has(d))).toBeNull();
  });
});

describe("calendar grid (Monday first)", () => {
  it("starts weeks on lundi and covers whole weeks", () => {
    const weeks = buildMonthGrid("2027-02-10");
    expect(weeks[0]?.[0]?.iso).toBe("2027-02-01"); // 1 Feb 2027 is a Monday
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(28);
    const sept = buildMonthGrid("2026-09-01");
    expect(sept[0]?.[0]).toMatchObject({ iso: "2026-08-31", inMonth: false });
    expect(mondayIndex("2026-09-13")).toBe(6); // Sunday
  });

  it("moves focus per the APG keyboard model", () => {
    expect(moveCalendarFocus("2027-02-10", "ArrowRight")).toBe("2027-02-11");
    expect(moveCalendarFocus("2027-02-10", "ArrowUp")).toBe("2027-02-03");
    expect(moveCalendarFocus("2027-02-10", "PageDown")).toBe("2027-03-10");
    expect(moveCalendarFocus("2027-02-10", "PageUp", true)).toBe("2026-02-10");
    expect(moveCalendarFocus("2027-02-10", "Home")).toBe("2027-02-08");
    expect(moveCalendarFocus("2027-02-10", "End")).toBe("2027-02-14");
  });
});

describe("times", () => {
  it("lists 48 half-hour options in 24 h", () => {
    const options = timeOptions();
    expect(options).toHaveLength(48);
    expect(options[0]).toBe("00:00");
    expect(options[19]).toBe("09:30");
    expect(options[47]).toBe("23:30");
    expect(timeOptions(15)).toHaveLength(96);
  });
  it("parses minutes", () => {
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("09:30:00")).toBe(570);
    expect(timeToMinutes("24:00")).toBeNull();
  });
});
