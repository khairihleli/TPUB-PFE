import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sessionDestination } from "@/components/auth/auth-redirect";
import {
  clearChallengeInfo,
  readChallengeInfo,
  storeChallengeInfo,
} from "@/components/auth/challenge-storage";
import { normalizeSessionLogin } from "@/lib/api/endpoints";
import {
  ApiError,
  isChallengeExpiredError,
  isDeviceKeyError,
  parseRetryAfter,
  presentError,
} from "@/lib/api/errors";
import { signedMediaQuery } from "@/lib/backend";
import {
  campaignIdOfMediaUrl,
  earliestSignedUrlExpiry,
  isExpiringSoon,
  isSignedMediaUrl,
  mediaExtension,
  sameMediaFile,
  signedUrlExpiresAt,
  stripQuery,
} from "@/lib/media-url";
import {
  clearDeviceKey,
  DEVICE_KEY_HEADER,
  isDeviceKey,
  readDeviceKey,
  storeDeviceKey,
} from "@/lib/player/device-key";
import {
  clearResourceCache,
  getCached,
  primeCache,
  SIGNED_MEDIA_TTL_MS,
  signedPayloadExpiry,
} from "@/lib/resource-cache";
import {
  base64UrlEncode,
  challengeMaxAge,
  isAuthResponse,
  isLoginChallenge,
  parseUserCookie,
  serializeUserCookie,
  sessionUserFromAuth,
  withAccountFlags,
} from "@/lib/session-cookie";

const SIGNED = "/uploads/campaigns/12/visuel.JPG?exp=1790000100&sig=AbC_d-9";

describe("signed media URLs (§3.5)", () => {
  it("reads the path, extension and expiry of a signed URL", () => {
    expect(stripQuery(SIGNED)).toBe("/uploads/campaigns/12/visuel.JPG");
    expect(stripQuery("/a.mp4#t=3")).toBe("/a.mp4");
    expect(stripQuery(null)).toBe("");
    expect(mediaExtension(SIGNED)).toBe("jpg");
    expect(mediaExtension("/uploads/spot.mp4?exp=1&sig=x")).toBe("mp4");
    expect(mediaExtension("/uploads/sans-extension?exp=1")).toBeNull();
    expect(mediaExtension("/uploads/.cache")).toBeNull();
    expect(signedUrlExpiresAt(SIGNED)).toBe(1_790_000_100_000);
    expect(signedUrlExpiresAt("/uploads/a.jpg?exp=abc&sig=x")).toBeNull();
    expect(isSignedMediaUrl(SIGNED)).toBe(true);
    expect(isSignedMediaUrl("/uploads/a.jpg?exp=1")).toBe(false);
    expect(isSignedMediaUrl("blob:http://localhost/1")).toBe(false);
  });

  it("detects links that expire soon; unsigned links never expire", () => {
    const exp = 1_790_000_100_000;
    expect(isExpiringSoon(SIGNED, exp - 60_000)).toBe(true);
    expect(isExpiringSoon(SIGNED, exp - 10 * 60_000)).toBe(false);
    expect(isExpiringSoon(SIGNED, exp + 1)).toBe(true);
    expect(isExpiringSoon(SIGNED, exp - 10 * 60_000, 15 * 60_000)).toBe(true);
    expect(isExpiringSoon("/uploads/a.jpg", exp)).toBe(false);
  });

  it("identifies the owning campaign and the same stored file", () => {
    expect(campaignIdOfMediaUrl(SIGNED)).toBe(12);
    expect(campaignIdOfMediaUrl("/uploads/logos/7/logo.png?exp=1&sig=x")).toBeNull();
    expect(sameMediaFile(SIGNED, "/uploads/campaigns/12/visuel.JPG?exp=2&sig=y")).toBe(true);
    expect(sameMediaFile(SIGNED, "/uploads/campaigns/12/autre.jpg")).toBe(false);
    expect(sameMediaFile(null, null)).toBe(false);
  });

  it("finds the earliest signed expiry in a nested payload", () => {
    const payload = {
      items: [
        { url: "/uploads/campaigns/1/a.jpg?exp=300&sig=a" },
        { url: "/uploads/campaigns/1/b.jpg?exp=200&sig=b", note: "sig=pas une url" },
      ],
      mediaUrl: null,
    };
    expect(earliestSignedUrlExpiry(payload)).toBe(200_000);
    expect(earliestSignedUrlExpiry({ name: "rien" })).toBeNull();
  });

  it("forwards only exp and sig through the /uploads passthrough", () => {
    expect(signedMediaQuery(new URLSearchParams("exp=10&sig=abc&x=1&token=t"))).toBe(
      "?exp=10&sig=abc",
    );
    expect(signedMediaQuery(new URLSearchParams("x=1"))).toBe("");
    expect(signedMediaQuery(new URLSearchParams(`exp=1&sig=${"a".repeat(300)}`))).toBe("?exp=1");
  });
});

describe("resource cache TTL of signed payloads", () => {
  afterEach(() => {
    vi.useRealTimers();
    clearResourceCache();
  });

  it("drops an entry holding signed URLs after 30 minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T10:00:00Z"));
    primeCache("media", [{ url: SIGNED }]);
    primeCache("plain", [{ url: "/uploads/a.jpg" }]);
    expect(getCached("media")).toBeDefined();
    vi.setSystemTime(Date.now() + SIGNED_MEDIA_TTL_MS + 1);
    expect(getCached("media")).toBeUndefined();
    expect(getCached("plain")).toBeDefined();
    expect(signedPayloadExpiry({ url: SIGNED }, 1000)).toBe(1000 + SIGNED_MEDIA_TTL_MS);
    expect(signedPayloadExpiry({ url: "/uploads/a.jpg" }, 1000)).toBeNull();
  });
});

describe("player device key storage (§1.1)", () => {
  const KEY = `tpd_${"a1_-".repeat(10)}abc`;

  beforeEach(() => window.localStorage.clear());

  it("validates the key format", () => {
    expect(DEVICE_KEY_HEADER).toBe("x-zelqane-device-key");
    expect(isDeviceKey(KEY)).toBe(true);
    expect(isDeviceKey(`${KEY}x`)).toBe(false);
    expect(isDeviceKey("tpd_court")).toBe(false);
    expect(isDeviceKey(42)).toBe(false);
  });

  it("stores one key per Porteur and ignores malformed values", () => {
    expect(storeDeviceKey(3, KEY)).toBe(true);
    expect(storeDeviceKey(4, "pas-une-cle")).toBe(false);
    expect(readDeviceKey(3)).toBe(KEY);
    expect(readDeviceKey(4)).toBeNull();
    window.localStorage.setItem("zelqane.ecran.cle.5", "corrompu");
    expect(readDeviceKey(5)).toBeNull();
    clearDeviceKey(3);
    expect(readDeviceKey(3)).toBeNull();
  });
});

describe("login challenge (§3.3, §3.7)", () => {
  const auth = {
    token: "a.b.c",
    email: "admin@zelqane.local",
    nom: "Admin",
    role: "ADMINISTRATEUR",
    userId: 1,
  };

  it("never treats a challenge as a session", () => {
    expect(isAuthResponse({ ...auth, status: "AUTHENTICATED" })).toBe(true);
    // Pre-round-2 backends answer without status.
    expect(isAuthResponse(auth)).toBe(true);
    expect(isAuthResponse({ ...auth, status: "TOTP_REQUIRED" })).toBe(false);
    const challenge = {
      status: "TOTP_REQUIRED",
      challengeToken: "tpc_x",
      expiresAt: "2026-09-17T10:05:00Z",
      email: "admin@zelqane.local",
    };
    expect(isLoginChallenge(challenge)).toBe(true);
    expect(isLoginChallenge({ ...challenge, status: "AUTHENTICATED" })).toBe(false);
    expect(isLoginChallenge({ ...challenge, challengeToken: "" })).toBe(false);
  });

  it("computes the challenge cookie lifetime", () => {
    const now = Date.parse("2026-09-17T10:00:00Z");
    expect(challengeMaxAge("2026-09-17T10:05:00Z", now)).toBe(300);
    expect(challengeMaxAge("2026-09-17T09:00:00Z", now)).toBe(0);
    expect(challengeMaxAge("n'importe quoi", now)).toBe(0);
  });

  it("carries the account flags in the session user cookie", () => {
    const user = sessionUserFromAuth(
      { ...auth, role: "ADMINISTRATEUR", mustChangePassword: true, twoFactorEnabled: true },
      Date.parse("2026-09-17T10:00:00Z"),
    );
    expect(user.mustChangePassword).toBe(true);
    expect(user.twoFactorEnabled).toBe(true);
    expect(parseUserCookie(serializeUserCookie(user))).toEqual(user);
    // Cookies written before round 2 have no flags: read as false.
    const legacy = base64UrlEncode(
      JSON.stringify({ email: "a@b.tn", nom: "A", role: "ANNONCEUR", userId: 2, exp: 9 }),
    );
    expect(parseUserCookie(legacy)).toMatchObject({
      mustChangePassword: false,
      twoFactorEnabled: false,
    });
    expect(
      withAccountFlags(user, { mustChangePassword: false, twoFactorEnabled: true, nom: "Admin 2" }),
    ).toMatchObject({ mustChangePassword: false, twoFactorEnabled: true, nom: "Admin 2" });
  });

  it("normalises the session login result", () => {
    const sessionUser = {
      email: "a@b.tn",
      nom: "A",
      role: "ANNONCEUR" as const,
      userId: 2,
      exp: 9,
    };
    expect(normalizeSessionLogin({ user: sessionUser })).toEqual({
      status: "AUTHENTICATED",
      user: sessionUser,
    });
    const step = {
      status: "TOTP_REQUIRED" as const,
      email: "a@b.tn",
      expiresAt: "2026-09-17T10:05:00Z",
    };
    expect(normalizeSessionLogin(step)).toBe(step);
    expect(() => normalizeSessionLogin(null)).toThrow();
  });

  it("keeps the challenge e-mail and expiry (never the token) in sessionStorage", () => {
    window.sessionStorage.clear();
    storeChallengeInfo({
      status: "TOTP_REQUIRED",
      email: "admin@zelqane.local",
      expiresAt: "2026-09-17T10:05:00Z",
    });
    expect(readChallengeInfo("TOTP_REQUIRED")?.email).toBe("admin@zelqane.local");
    expect(readChallengeInfo("TOTP_ENROLMENT_REQUIRED")).toBeNull();
    window.sessionStorage.setItem("zelqane.connexion.verification", "{");
    expect(readChallengeInfo("TOTP_REQUIRED")).toBeNull();
    clearChallengeInfo();
    expect(window.sessionStorage.getItem("zelqane.connexion.verification")).toBeNull();
  });

  it("sends a session that must change its password to the forced change screen first", () => {
    expect(sessionDestination("/admin/utilisateurs", { role: "ADMINISTRATEUR" })).toBe(
      "/admin/utilisateurs",
    );
    expect(
      sessionDestination("/admin/utilisateurs", {
        role: "ADMINISTRATEUR",
        mustChangePassword: true,
      }),
    ).toBe("/mot-de-passe-requis?next=%2Fadmin%2Futilisateurs");
    expect(
      sessionDestination(["//evil.test"], { role: "ANNONCEUR", mustChangePassword: true }),
    ).toBe("/mot-de-passe-requis");
  });
});

describe("round 2 API errors", () => {
  it("parses Retry-After seconds only", () => {
    expect(parseRetryAfter("30")).toBe(30);
    expect(parseRetryAfter(" 7 ")).toBe(7);
    expect(parseRetryAfter("99999")).toBe(3600);
    expect(parseRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT")).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
  });

  it("does not present a wrong code or a refused device key as an expired session", () => {
    const wrongCode = new ApiError(401, "Code de vérification incorrect.", {
      code: "TOTP_CODE_INVALID",
    });
    expect(presentError(wrongCode).message).toBe("Code de vérification incorrect.");
    expect(presentError(wrongCode).title).toBe("Vérification refusée");
    const expired = new ApiError(401, "La vérification a expiré.", { code: "CHALLENGE_EXPIRED" });
    expect(isChallengeExpiredError(expired)).toBe(true);
    expect(isDeviceKeyError(new ApiError(401, "x", { code: "DEVICE_KEY_INVALID" }))).toBe(true);
    expect(isDeviceKeyError(new ApiError(401, "x", { code: "TOKEN_EXPIRED" }))).toBe(false);
  });
});
