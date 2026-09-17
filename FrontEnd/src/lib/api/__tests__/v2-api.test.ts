import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  apiDownload,
  apiFetch,
  filenameFromContentDisposition,
  resetSessionExpiredGuard,
} from "@/lib/api/client";
import {
  adminApi,
  campaignsApi,
  listParam,
  mediaApi,
  normalizeAiReport,
  normalizePage,
  reservationsApi,
  statisticsApi,
} from "@/lib/api/endpoints";
import {
  ApiError,
  batchConflicts,
  isNoAiReportError,
  isReservationConflictError,
  presentError,
  submitIncompleteErrors,
} from "@/lib/api/errors";
import {
  CODE_MESSAGES,
  SESSION_EXPIRED_MESSAGE,
  translateFieldMessage,
  translateMessage,
} from "@/lib/api/messages";
import type { CampaignResponse } from "@/lib/api/types";

function respond(status: number, body?: unknown, headers: Record<string, string> = {}) {
  const text = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  return new Response(text || null, {
    status,
    headers: text ? { "content-type": "application/json", ...headers } : headers,
  });
}

const fetchMock = vi.fn<typeof fetch>();

function urlOf(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return (input as Request).url;
}

beforeEach(() => {
  resetSessionExpiredGuard();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function lastCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1);
  return { url: urlOf(call?.[0]), init: call?.[1] ?? {} };
}

describe("code-first translation (contract §2.0)", () => {
  it("shows the French backend message for a known code", () => {
    expect(
      translateMessage(
        "Ce Porteur est déjà réservé (Écran Lac 2).",
        409,
        "SUPPORT_ALREADY_RESERVED",
      ),
    ).toBe("Ce Porteur est déjà réservé (Écran Lac 2).");
  });

  it("falls back to the code label when the message is missing or English", () => {
    expect(translateMessage(null, 409, "BATCH_CONFLICT")).toBe(CODE_MESSAGES.BATCH_CONFLICT);
    expect(translateMessage("Media too large", 413, "MEDIA_TOO_LARGE")).toBe(
      CODE_MESSAGES.MEDIA_TOO_LARGE,
    );
  });

  it("imposes the wording of session and security codes", () => {
    expect(translateMessage("Jeton expiré", 401, "TOKEN_EXPIRED")).toBe(SESSION_EXPIRED_MESSAGE);
    expect(translateMessage("Erreur interne détaillée", 500, "INTERNAL_ERROR")).toMatch(
      /de notre côté/,
    );
  });

  it("keeps the legacy English table for bodies without code", () => {
    expect(translateMessage("Email already registered", 400, null)).toBe(
      "Un compte existe déjà avec cet e-mail.",
    );
  });

  it("translates codes used as field values and unaccented French messages", () => {
    expect(translateFieldMessage("SUPPORT_UNAVAILABLE")).toBe(CODE_MESSAGES.SUPPORT_UNAVAILABLE);
    expect(translateFieldMessage("UNKNOWN_THING")).toBe("Valeur invalide.");
    expect(translateFieldMessage("Champ obligatoire.")).toBe("Champ obligatoire.");
    expect(translateFieldMessage("Adresse e-mail invalide.")).toBe("Adresse e-mail invalide.");
  });
});

describe("ApiError with code", () => {
  it("exposes code, translated and raw field errors", async () => {
    fetchMock.mockResolvedValueOnce(
      respond(409, {
        status: 409,
        code: "BATCH_CONFLICT",
        message: "Certains Porteurs ne sont plus disponibles.",
        errors: { "3": "SUPPORT_ALREADY_RESERVED", "5": "SUPPORT_UNAVAILABLE" },
      }),
    );
    const err = await reservationsApi
      .createBatch({ campaignId: 1, supportIds: [3, 5] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const e = err as ApiError;
    expect(e.code).toBe("BATCH_CONFLICT");
    expect(e.message).toBe("Certains Porteurs ne sont plus disponibles.");
    expect(e.fieldErrors["3"]).toBe(CODE_MESSAGES.SUPPORT_ALREADY_RESERVED);
    expect(batchConflicts(e)).toEqual({ 3: "SUPPORT_ALREADY_RESERVED", 5: "SUPPORT_UNAVAILABLE" });
    expect(isReservationConflictError(e)).toBe(true);
  });

  it("recognises AI_REPORT_NOT_FOUND and the legacy 400", () => {
    expect(isNoAiReportError(new ApiError(404, "x", { code: "AI_REPORT_NOT_FOUND" }))).toBe(true);
    expect(
      isNoAiReportError(
        new ApiError(400, "x", { rawMessage: "No AI report found for campaign: 3" }),
      ),
    ).toBe(true);
    expect(isNoAiReportError(new ApiError(404, "x", { code: "CAMPAIGN_NOT_FOUND" }))).toBe(false);
  });

  it("returns SUBMIT_INCOMPLETE parts", () => {
    const e = new ApiError(400, "x", {
      code: "SUBMIT_INCOMPLETE",
      fieldErrors: { zones: "Aucune zone ciblée." },
    });
    expect(submitIncompleteErrors(e)).toEqual({ zones: "Aucune zone ciblée." });
    expect(submitIncompleteErrors(new ApiError(400, "x"))).toBeNull();
  });

  it("presents a login refusal as such, not as an expired session", () => {
    const disabled = new ApiError(401, CODE_MESSAGES.ACCOUNT_DISABLED ?? "", {
      code: "ACCOUNT_DISABLED",
    });
    expect(presentError(disabled)).toMatchObject({
      title: "Connexion impossible",
      message: CODE_MESSAGES.ACCOUNT_DISABLED,
    });
    expect(presentError(new ApiError(401, "x", { code: "SESSION_REVOKED" })).message).toBe(
      SESSION_EXPIRED_MESSAGE,
    );
  });
});

describe("multipart and downloads", () => {
  it("sends FormData untouched, without JSON content-type nor timeout", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValueOnce(respond(201, { id: 9 }));
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "affiche.jpg", {
      type: "image/jpeg",
    });
    await mediaApi.upload(12, file, { kind: "BANNER", durationSeconds: 14.6 });
    const { url, init } = lastCall();
    expect(url).toBe("/api/campaigns/12/media");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    const form = init.body as FormData;
    expect((form.get("file") as File).name).toBe("affiche.jpg");
    expect(form.get("kind")).toBe("BANNER");
    expect(form.get("durationSeconds")).toBe("15");
    expect(timeout).not.toHaveBeenCalled();
    timeout.mockRestore();
  });

  it("parses Content-Disposition file names safely", () => {
    expect(
      filenameFromContentDisposition(
        'attachment; filename="tpub-statistiques-views-2026-09-01-2026-09-30.csv"',
      ),
    ).toBe("tpub-statistiques-views-2026-09-01-2026-09-30.csv");
    expect(
      filenameFromContentDisposition("attachment; filename*=UTF-8''stats%20ao%C3%BBt.csv"),
    ).toBe("stats août.csv");
    expect(filenameFromContentDisposition('attachment; filename="../../etc/passwd"')).toBe(
      ".._.._etc_passwd",
    );
    expect(filenameFromContentDisposition(null)).toBeNull();
  });

  it("downloads a blob and raises French errors", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("Date;Affichages\n", {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=UTF-8",
          "content-disposition": 'attachment; filename="export.csv"',
        },
      }),
    );
    const file = await apiDownload("/statistics/export.csv", { type: "mine" });
    expect(file.filename).toBe("export.csv");
    expect(file.blob.size).toBeGreaterThan(0);
    expect(lastCall().url).toBe("/api/statistics/export.csv?type=mine");

    fetchMock.mockResolvedValueOnce(
      respond(400, { status: 400, code: "EXPORT_TYPE_INVALID", message: "Type d'export inconnu." }),
    );
    const err = await apiDownload("/statistics/export.csv", { type: "x" }).catch((e: unknown) => e);
    expect((err as ApiError).code).toBe("EXPORT_TYPE_INVALID");
  });

  it("exportCsv saves the file through an object URL", async () => {
    const create = vi.fn(() => "blob:tpub");
    const revoke = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    fetchMock.mockResolvedValueOnce(new Response("a;b", { status: 200 }));
    await expect(
      statisticsApi.exportCsv({ type: "campaign", campaignId: 4, from: "2026-09-01" }),
    ).resolves.toBe("tpub-statistiques-campaign.csv");
    expect(lastCall().url).toBe(
      "/api/statistics/export.csv?type=campaign&from=2026-09-01&campaignId=4",
    );
    expect(create).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });
});

describe("endpoint shapes", () => {
  it("joins list filters with commas", () => {
    expect(listParam(["BROUILLON", "BLOCKED"])).toBe("BROUILLON,BLOCKED");
    expect(listParam([])).toBeUndefined();
    expect(listParam(4)).toBe("4");
    expect(listParam(undefined)).toBeUndefined();
  });

  it("normalises legacy arrays and v2 pages", () => {
    expect(normalizePage([1, 2])).toEqual({
      items: [1, 2],
      page: 0,
      size: 2,
      totalItems: 2,
      totalPages: 1,
    });
    const page = { items: [3], page: 1, size: 1, totalItems: 2, totalPages: 2 };
    expect(normalizePage(page)).toBe(page);
    expect(normalizePage(null).items).toEqual([]);
  });

  it("sends mine() filters and accepts the signal in the same object", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(respond(200, []));
    await campaignsApi.mine({
      q: " soldes ",
      status: ["BROUILLON", "REJECTED_BY_AI"],
      signal: controller.signal,
    });
    const { url, init } = lastCall();
    expect(url).toBe("/api/campaigns/mine?q=soldes&status=BROUILLON%2CREJECTED_BY_AI");
    expect(init.signal).toBeDefined();
  });

  it("walks every search page for all()", async () => {
    const c = (id: number, createdAt: string) => ({ id, createdAt }) as CampaignResponse;
    fetchMock
      .mockResolvedValueOnce(
        respond(200, {
          items: [c(1, "2026-09-01")],
          page: 0,
          size: 100,
          totalItems: 2,
          totalPages: 2,
        }),
      )
      .mockResolvedValueOnce(
        respond(200, {
          items: [c(2, "2026-09-10")],
          page: 1,
          size: 100,
          totalItems: 2,
          totalPages: 2,
        }),
      );
    const items = await campaignsApi.all({ status: ["ACTIVE"] });
    expect(items.map((x) => x.id)).toEqual([2, 1]);
    expect(urlOf(fetchMock.mock.calls[1]?.[0])).toBe(
      "/api/campaigns?status=ACTIVE&page=1&size=100",
    );
  });

  it("duplicates on the server by id, client-side for a legacy source object", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(respond(201, { id: 8 })));
    await campaignsApi.duplicate(3, { includeMedia: false });
    expect(lastCall().url).toBe("/api/campaigns/3/duplicate");
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ includeMedia: false });
    await campaignsApi.duplicate(3);
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ includeMedia: true });
    await campaignsApi.duplicate({
      id: 3,
      name: "Soldes",
      objective: null,
      budget: 10,
      status: "BLOCKED",
      startDate: null,
      endDate: null,
      startTime: null,
      endTime: null,
    } as CampaignResponse);
    expect(lastCall().url).toBe("/api/campaigns");
  });

  it("submits without timeout and rejects with a JSON reason", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(respond(200, { id: 3 })));
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await campaignsApi.submit(3);
    expect(timeout).not.toHaveBeenCalled();
    timeout.mockRestore();
    await adminApi.reject(3, "  Visuel illisible  ");
    expect(lastCall().url).toBe("/api/admin/campaigns/3/reject");
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ reason: "Visuel illisible" });
    await adminApi.validate(4, { overrideAi: true, comment: "OK" });
    expect(JSON.parse(lastCall().init.body as string)).toEqual({ overrideAi: true, comment: "OK" });
  });

  it("fills missing AI report arrays", () => {
    const report = normalizeAiReport({
      campaignId: 1,
      aiStatus: "review_required",
      riskScore: 40,
      qualityScore: 60,
      detectedIssues: null as unknown as string[],
      recommendation: null,
    });
    expect(report.aiStatus).toBe("REVIEW_REQUIRED");
    expect(report).toMatchObject({
      detectedIssues: [],
      issues: [],
      recommendations: [],
      mediaAnalyses: [],
      matchedRules: [],
    });
  });

  it("keeps apiFetch JSON behaviour", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { ok: true }));
    await apiFetch("/me", { method: "PUT", body: { nom: "A" } });
    expect((lastCall().init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });
});
