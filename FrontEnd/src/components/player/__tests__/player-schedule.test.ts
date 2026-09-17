import { describe, expect, it } from "vitest";

import {
  classifyPlayerError,
  contentDelayMs,
  DEFAULT_DURATION_S,
  formatCountdown,
  adMediaKind,
  isNewUrgence,
  parseSimulatedDateTime,
  pollDelayMs,
  shouldSendClick,
  simulatedDateTime,
  MAX_DURATION_S,
  MIN_DURATION_S,
  parseSupportId,
  planAfterError,
  planAfterSuccess,
  RETRY_MAX_MS,
  RETRY_SLOW_MS,
  retryDelayMs,
  secondsUntil,
  slideKey,
} from "@/components/player/player-schedule";
import { ApiError, ApiTransportError } from "@/lib/api/errors";
import type { Diffusion } from "@/lib/api/types";

const ad: Diffusion = {
  type: "PUBLICITE",
  campaignId: 4,
  title: "Lancement Café Démo",
  mediaUrl: null,
  duration: 10,
  zone: "Tunis Centre",
  priority: 0,
};
const urgent: Diffusion = {
  type: "URGENCE",
  campaignId: null,
  title: "Voie fermée",
  mediaUrl: null,
  duration: 15,
  zone: "Tunis Centre",
  priority: 1,
};
const fallback: Diffusion = {
  type: "DEFAUT",
  campaignId: null,
  title: "TPUB - Contenu par defaut",
  mediaUrl: null,
  duration: 10,
  zone: "Tunis Centre",
  priority: 0,
};

describe("contentDelayMs", () => {
  it("waits exactly the duration returned by the backend", () => {
    expect(contentDelayMs(10)).toBe(10_000);
    expect(contentDelayMs(15)).toBe(15_000);
  });

  it("never polls faster than the floor (each call writes a diffusion log)", () => {
    expect(contentDelayMs(0)).toBe(DEFAULT_DURATION_S * 1000);
    expect(contentDelayMs(-3)).toBe(DEFAULT_DURATION_S * 1000);
    expect(contentDelayMs(1)).toBe(MIN_DURATION_S * 1000);
    expect(contentDelayMs(Number.NaN)).toBe(DEFAULT_DURATION_S * 1000);
    expect(contentDelayMs("10")).toBe(DEFAULT_DURATION_S * 1000);
    expect(contentDelayMs(undefined)).toBe(DEFAULT_DURATION_S * 1000);
  });

  it("caps very long durations so a new priority message is picked up", () => {
    expect(contentDelayMs(3600)).toBe(MAX_DURATION_S * 1000);
  });
});

describe("retryDelayMs", () => {
  it("doubles from 2 s and caps at 60 s", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((a) => retryDelayMs(a))).toEqual([
      2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000,
    ]);
    expect(retryDelayMs(500)).toBe(RETRY_MAX_MS);
  });

  it("treats invalid attempts as the first one", () => {
    expect(retryDelayMs(0)).toBe(2_000);
    expect(retryDelayMs(-2)).toBe(2_000);
    expect(retryDelayMs(Number.NaN)).toBe(2_000);
  });

  it("applies bounded ±20 % jitter when a random source is given", () => {
    expect(retryDelayMs(2, () => 0)).toBe(3_200);
    expect(retryDelayMs(2, () => 1)).toBe(4_800);
    expect(retryDelayMs(2, () => 0.5)).toBe(4_000);
    expect(retryDelayMs(10, () => 1)).toBe(RETRY_MAX_MS);
  });
});

describe("classifyPlayerError / planAfterError", () => {
  it("backs off exponentially when the network is down", () => {
    const offline = new ApiTransportError("network");
    const first = planAfterError(offline, 0, 7);
    expect(first).toMatchObject({ ok: false, attempt: 1, delayMs: 2_000 });
    const third = planAfterError(offline, 2, 7);
    expect(third).toMatchObject({ attempt: 3, delayMs: 8_000 });
    if (!third.ok) expect(third.error.kind).toBe("offline");
  });

  it("distinguishes an unreachable backend (502) from an unknown screen (404)", () => {
    expect(classifyPlayerError(new ApiError(502, "x"), 7).kind).toBe("unreachable");
    const notFound = classifyPlayerError(new ApiError(404, "x"), 7);
    expect(notFound.kind).toBe("not-found");
    expect(notFound.message).toContain("7");
  });

  it("retries slowly when a retry is unlikely to help", () => {
    const plan = planAfterError(new ApiError(404, "Support not found: 7"), 0, 7);
    expect(plan.delayMs).toBe(RETRY_SLOW_MS);
    expect(planAfterError(new ApiError(400, "bad"), 3, 7).delayMs).toBe(RETRY_SLOW_MS);
  });

  it("keeps the normal ladder for a 401 (stale cookie cleared by the bridge) and 500", () => {
    expect(planAfterError(new ApiError(401, "x"), 0, 7).delayMs).toBe(2_000);
    expect(planAfterError(new ApiError(500, "x"), 1, 7).delayMs).toBe(4_000);
    expect(planAfterError(new Error("boom"), 0, 7)).toMatchObject({ delayMs: 2_000 });
  });

  it("resets the attempts after a success", () => {
    expect(planAfterSuccess(ad)).toEqual({ ok: true, delayMs: 10_000, attempt: 0 });
    // A priority message is re-checked every min(duration, 5) s.
    expect(planAfterSuccess(urgent)).toEqual({ ok: true, delayMs: 5_000, attempt: 0 });
  });
});

describe("isNewUrgence", () => {
  it("announces a priority message once, not on every poll", () => {
    expect(isNewUrgence(null, urgent)).toBe(true);
    expect(isNewUrgence(ad, urgent)).toBe(true);
    expect(isNewUrgence(urgent, { ...urgent })).toBe(false);
    expect(isNewUrgence(urgent, { ...urgent, title: "Autre message" })).toBe(true);
  });

  it("never announces ads or default content", () => {
    expect(isNewUrgence(null, ad)).toBe(false);
    expect(isNewUrgence(urgent, fallback)).toBe(false);
  });

  it("keys slides by type, campaign and title", () => {
    expect(slideKey(ad)).toBe("PUBLICITE:4:Lancement Café Démo");
    expect(slideKey(fallback)).toBe("DEFAUT:-:TPUB - Contenu par defaut");
  });
});

describe("helpers", () => {
  it("parses only positive integer support ids", () => {
    expect(parseSupportId("12")).toBe(12);
    expect(parseSupportId("0")).toBeNull();
    expect(parseSupportId("-1")).toBeNull();
    expect(parseSupportId("1.5")).toBeNull();
    expect(parseSupportId("abc")).toBeNull();
    expect(parseSupportId("")).toBeNull();
    expect(parseSupportId(undefined)).toBeNull();
    expect(parseSupportId("1234567890123456")).toBeNull();
  });

  it("computes the countdown", () => {
    expect(secondsUntil(10_000, 0)).toBe(10);
    expect(secondsUntil(10_000, 9_001)).toBe(1);
    expect(secondsUntil(10_000, 12_000)).toBe(0);
    expect(secondsUntil(null, 0)).toBeNull();
    expect(secondsUntil(10, null)).toBeNull();
    expect(formatCountdown(7)).toBe("0:07");
    expect(formatCountdown(75)).toBe("1:15");
    expect(formatCountdown(null)).toBe("—");
  });
});

describe("v2 player helpers", () => {
  it("polls a priority message every min(duration, 5) s and other contents at their duration", () => {
    expect(pollDelayMs({ type: "URGENCE", duration: 30 })).toBe(5_000);
    expect(pollDelayMs({ type: "URGENCE", duration: 5 })).toBe(5_000);
    expect(pollDelayMs({ type: "PUBLICITE", duration: 30 })).toBe(30_000);
    expect(pollDelayMs({ type: "DEFAUT", duration: 10 })).toBe(10_000);
  });

  it("chooses the media rendering from mediaType, then from the extension", () => {
    expect(adMediaKind({ mediaUrl: null, mediaType: "IMAGE" })).toBe("none");
    expect(adMediaKind({ mediaUrl: "  ", mediaType: "VIDEO" })).toBe("none");
    expect(adMediaKind({ mediaUrl: "/uploads/campaigns/1/a.jpg", mediaType: "IMAGE" })).toBe(
      "image",
    );
    expect(adMediaKind({ mediaUrl: "/uploads/campaigns/1/a.png", mediaType: "BANNER" })).toBe(
      "image",
    );
    expect(adMediaKind({ mediaUrl: "/uploads/campaigns/1/a.mp4", mediaType: "VIDEO" })).toBe(
      "video",
    );
    expect(adMediaKind({ mediaUrl: "/uploads/campaigns/1/a.webm", mediaType: null })).toBe("video");
    expect(adMediaKind({ mediaUrl: "/uploads/campaigns/1/a.webp" })).toBe("image");
  });

  it("sends one CLIC per publicité diffusion", () => {
    const sent = new Set<number>([7]);
    expect(shouldSendClick({ type: "PUBLICITE", diffusionLogId: 8 }, sent)).toBe(true);
    expect(shouldSendClick({ type: "PUBLICITE", diffusionLogId: 7 }, sent)).toBe(false);
    expect(shouldSendClick({ type: "PUBLICITE" }, sent)).toBe(false);
    expect(shouldSendClick({ type: "URGENCE", diffusionLogId: 9 }, sent)).toBe(false);
    expect(shouldSendClick(null, sent)).toBe(false);
  });

  it("parses the ?datetime simulation and advances it with the real clock", () => {
    expect(parseSimulatedDateTime("2026-09-20T18:30")).toBe("2026-09-20T18:30:00");
    expect(parseSimulatedDateTime("2026-09-20T18:30:15")).toBe("2026-09-20T18:30:15");
    expect(parseSimulatedDateTime("2026-02-30T10:00")).toBeNull();
    expect(parseSimulatedDateTime("2026-09-20 18:30")).toBeNull();
    expect(parseSimulatedDateTime("")).toBeNull();
    expect(parseSimulatedDateTime(undefined)).toBeNull();
    expect(simulatedDateTime("2026-09-20T23:59:50", 12_400)).toBe("2026-09-21T00:00:02");
    expect(simulatedDateTime("2026-09-20T10:00:00", -5)).toBe("2026-09-20T10:00:00");
  });

  it("keys media slides by their media too", () => {
    expect(slideKey({ ...ad, mediaUrl: "/uploads/x.jpg" })).toBe(
      "PUBLICITE:4:Lancement Café Démo:/uploads/x.jpg",
    );
  });
});
