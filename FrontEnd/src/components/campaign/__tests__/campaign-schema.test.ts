import { describe, expect, it } from "vitest";

import {
  type CampaignFormValues,
  campaignToFormValues,
  hasSchedule,
  mapServerFieldErrors,
  parseBudget,
  timeToMinutes,
  toCampaignRequest,
  validateCampaignForm,
} from "@/components/campaign/campaign-schema";
import type { CampaignResponse } from "@/lib/api/types";

const TODAY = "2026-09-13";

const valid: CampaignFormValues = {
  name: "  Lancement Café Démo ",
  objective: "Notoriété de la nouvelle gamme auprès du quartier",
  budget: "2500",
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  startTime: "08:00",
  endTime: "22:00",
};

function errorsFor(values: Partial<CampaignFormValues>, savedStartDate: string | null = null) {
  return validateCampaignForm({ ...valid, ...values }, { today: TODAY, savedStartDate }).errors;
}

describe("validateCampaignForm", () => {
  it("accepts a complete campaign and converts it to a CampaignRequest", () => {
    const result = validateCampaignForm(valid, { today: TODAY });
    expect(result.ok).toBe(true);
    expect(result.request).toEqual({
      name: "Lancement Café Démo",
      objective: "Notoriété de la nouvelle gamme auprès du quartier",
      budget: 2500,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      startTime: "08:00:00",
      endTime: "22:00:00",
    });
  });

  it("requires a name, an objective and a budget", () => {
    const errors = errorsFor({ name: "   ", objective: "", budget: "" });
    expect(errors.name).toBe("Donnez un nom à votre campagne.");
    expect(errors.objective).toBe("Décrivez l'objectif de la campagne.");
    expect(errors.budget).toMatch(/Indiquez un budget/);
  });

  it("asks for a meaningful objective (read by the AI)", () => {
    expect(errorsFor({ objective: "Promo" }).objective).toMatch(/10 caractères minimum/);
  });

  it("rejects names longer than the DB column (200)", () => {
    expect(errorsFor({ name: "x".repeat(201) }).name).toBe("200 caractères maximum.");
  });

  it("validates the budget: number, > 0 (submit rule), two decimals at most", () => {
    expect(errorsFor({ budget: "abc" }).budget).toMatch(/Budget invalide/);
    expect(errorsFor({ budget: "-10" }).budget).toBe("Le budget doit être supérieur à 0 TND.");
    expect(errorsFor({ budget: "10,123" }).budget).toMatch(/deux décimales/);
    expect(errorsFor({ budget: "0" }).budget).toBe("Le budget doit être supérieur à 0 TND.");
    expect(errorsFor({ budget: "1 500,50" }).budget).toBeUndefined();
  });

  it("refuses a start date in the past but accepts today", () => {
    expect(errorsFor({ startDate: "2026-09-12" }).startDate).toBe(
      "La date de début ne peut pas être passée.",
    );
    expect(errorsFor({ startDate: TODAY, endDate: TODAY }).startDate).toBeUndefined();
  });

  it("requires endDate ≥ startDate (same day allowed)", () => {
    expect(errorsFor({ startDate: "2026-10-10", endDate: "2026-10-09" }).endDate).toBe(
      "La date de fin doit être égale ou postérieure à la date de début.",
    );
    expect(errorsFor({ startDate: "2026-10-10", endDate: "2026-10-10" }).endDate).toBeUndefined();
  });

  it("rejects impossible calendar dates", () => {
    expect(errorsFor({ endDate: "2026-02-30" }).endDate).toBe("Date invalide.");
  });

  it("requires endTime strictly after startTime", () => {
    expect(errorsFor({ startTime: "22:00", endTime: "08:00" }).endTime).toBe(
      "L'heure de fin doit être postérieure à l'heure de début.",
    );
    expect(errorsFor({ startTime: "10:00", endTime: "10:00" }).endTime).toBeDefined();
    expect(errorsFor({ startTime: "10:00", endTime: "10:01" }).endTime).toBeUndefined();
  });

  it("requires the period and the time range (reservations need them)", () => {
    const errors = errorsFor({ startDate: "", endDate: "", startTime: "", endTime: "" });
    expect(errors.startDate).toBeDefined();
    expect(errors.endDate).toBeDefined();
    expect(errors.startTime).toBeDefined();
    expect(errors.endTime).toBeDefined();
  });

  it("accepts an unchanged past start date on edit (START_DATE_IN_PAST only when changed)", () => {
    const past = { startDate: "2026-09-01", endDate: "2026-09-30" };
    expect(errorsFor(past).startDate).toBeDefined();
    expect(errorsFor(past, "2026-09-01").startDate).toBeUndefined();
    expect(errorsFor(past, "2026-08-01").startDate).toBeDefined();
  });
});

describe("time conversion", () => {
  it("sends HH:mm:ss (Spring CampaignRequest is strict)", () => {
    const req = toCampaignRequest({ ...valid, startTime: "07:30", endTime: "23:59" });
    expect(req.startTime).toBe("07:30:00");
    expect(req.endTime).toBe("23:59:00");
  });

  it("keeps values that already have seconds", () => {
    expect(toCampaignRequest({ ...valid, startTime: "08:00:00" }).startTime).toBe("08:00:00");
  });

  it("maps a response back to HH:mm for <input type=time>", () => {
    const campaign = {
      id: 1,
      name: "Test",
      objective: null,
      budget: 1500.5,
      startDate: "2026-10-01",
      endDate: "2026-10-02",
      startTime: "08:15:00",
      endTime: "21:45:00",
    } as CampaignResponse;
    expect(campaignToFormValues(campaign)).toEqual({
      name: "Test",
      objective: "",
      budget: "1500.5",
      startDate: "2026-10-01",
      endDate: "2026-10-02",
      startTime: "08:15",
      endTime: "21:45",
    });
  });

  it("round-trips form → request → form", () => {
    const req = toCampaignRequest(valid);
    const back = campaignToFormValues({ ...req, id: 3 } as CampaignResponse);
    expect(back.startTime).toBe(valid.startTime);
    expect(back.endTime).toBe(valid.endTime);
    expect(back.name).toBe(valid.name.trim());
  });

  it("converts times to minutes and rejects invalid ones", () => {
    expect(timeToMinutes("08:30")).toBe(510);
    expect(timeToMinutes("23:59:59")).toBe(1439);
    expect(timeToMinutes("24:00")).toBeNull();
    expect(timeToMinutes("8h")).toBeNull();
  });
});

describe("helpers", () => {
  it("parses budgets written the French way", () => {
    expect(parseBudget("2 500")).toBe(2500);
    expect(parseBudget("2 500,75")).toBe(2500.75);
    expect(parseBudget("12.5")).toBe(12.5);
    expect(parseBudget("1e3")).toBeNaN();
  });

  it("keeps only known server field errors", () => {
    expect(mapServerFieldErrors({ budget: "Doit être positif", clientId: "x" })).toEqual({
      budget: "Doit être positif",
    });
  });

  it("detects a complete schedule", () => {
    expect(
      hasSchedule({
        startDate: "2026-10-01",
        endDate: "2026-10-02",
        startTime: "08:00:00",
        endTime: "09:00:00",
      }),
    ).toBe(true);
    expect(
      hasSchedule({ startDate: "2026-10-01", endDate: null, startTime: null, endTime: null }),
    ).toBe(false);
  });
});
