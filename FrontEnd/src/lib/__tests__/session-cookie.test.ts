import { describe, expect, it } from "vitest";

import type { SessionUser } from "@/lib/api/types";
import {
  base64UrlDecode,
  base64UrlEncode,
  canAccessPath,
  decodeJwtExp,
  isAuthResponse,
  parseUserCookie,
  readSession,
  roleHome,
  safeNextPath,
  serializeUserCookie,
  sessionMaxAge,
  sessionUserFromAuth,
} from "@/lib/session-cookie";

const NOW = Date.UTC(2026, 8, 12, 10, 0, 0); // 2026-09-12T10:00:00Z
const nowS = NOW / 1000;

function jwt(payload: Record<string, unknown>): string {
  return `${base64UrlEncode(JSON.stringify({ alg: "HS512" }))}.${base64UrlEncode(JSON.stringify(payload))}.sig`;
}

const user: SessionUser = {
  email: "demo@annonceur.tn",
  nom: "Sami Ben Salah — Café Démo",
  role: "ANNONCEUR",
  userId: 7,
  exp: nowS + 3600,
  // Round 2 flags: parseUserCookie always returns them (false for pre-round-2 cookies).
  mustChangePassword: false,
  twoFactorEnabled: false,
};

describe("base64url", () => {
  it("round-trips UTF-8 (accents)", () => {
    const s = "Réservez l'écran — ça marche";
    expect(base64UrlDecode(base64UrlEncode(s))).toBe(s);
  });
  it("returns null on garbage", () => {
    expect(base64UrlDecode("%%%")).toBeNull();
  });
});

describe("decodeJwtExp", () => {
  it("reads exp", () => {
    expect(decodeJwtExp(jwt({ sub: "a", exp: nowS + 10 }))).toBe(nowS + 10);
  });
  it("returns null for malformed tokens", () => {
    expect(decodeJwtExp("abc")).toBeNull();
    expect(decodeJwtExp(jwt({ sub: "a" }))).toBeNull();
    expect(decodeJwtExp(null)).toBeNull();
  });
});

describe("user cookie", () => {
  it("serializes and parses", () => {
    expect(parseUserCookie(serializeUserCookie(user))).toEqual(user);
  });
  it("rejects invalid shapes", () => {
    expect(parseUserCookie(undefined)).toBeNull();
    expect(parseUserCookie("not-base64!")).toBeNull();
    expect(
      parseUserCookie(base64UrlEncode(JSON.stringify({ ...user, role: "ROLE_ANNONCEUR" }))),
    ).toBeNull();
    expect(parseUserCookie(base64UrlEncode(JSON.stringify({ ...user, exp: "soon" })))).toBeNull();
  });
});

describe("readSession", () => {
  const token = jwt({ sub: user.email, exp: nowS + 3600 });

  it("returns the user when token + cookie are valid", () => {
    expect(readSession(token, serializeUserCookie(user), NOW)).toEqual(user);
  });
  it("returns null without token", () => {
    expect(readSession(undefined, serializeUserCookie(user), NOW)).toBeNull();
  });
  it("returns null when the user cookie is expired", () => {
    expect(readSession(token, serializeUserCookie({ ...user, exp: nowS - 1 }), NOW)).toBeNull();
  });
  it("returns null when the JWT is expired", () => {
    const old = jwt({ sub: user.email, exp: nowS - 5 });
    expect(readSession(old, serializeUserCookie(user), NOW)).toBeNull();
  });
});

describe("auth response → session", () => {
  it("validates AuthResponse", () => {
    expect(isAuthResponse({ token: "x", email: "a", nom: "b", role: "ANNONCEUR", userId: 1 })).toBe(
      true,
    );
    expect(isAuthResponse({ token: "", email: "a", nom: "b", role: "ANNONCEUR", userId: 1 })).toBe(
      false,
    );
    expect(isAuthResponse({ token: "x", email: "a", nom: "b", role: "ROOT", userId: 1 })).toBe(
      false,
    );
  });
  it("derives exp from the JWT, or falls back to 24 h", () => {
    const withExp = sessionUserFromAuth(
      { token: jwt({ exp: nowS + 100 }), email: "a", nom: "b", role: "ADMINISTRATEUR", userId: 1 },
      NOW,
    );
    expect(withExp.exp).toBe(nowS + 100);
    const noExp = sessionUserFromAuth(
      { token: "opaque", email: "a", nom: "b", role: "ANNONCEUR", userId: 1 },
      NOW,
    );
    expect(noExp.exp).toBe(nowS + 86400);
  });
  it("uses the v2 session expiresAt when it is earlier than the JWT exp", () => {
    const early = sessionUserFromAuth(
      {
        token: jwt({ exp: nowS + 1000 }),
        email: "a",
        nom: "b",
        role: "ANNONCEUR",
        userId: 1,
        sessionId: "3f0c",
        expiresAt: new Date((nowS + 600) * 1000).toISOString(),
      },
      NOW,
    );
    expect(early.exp).toBe(nowS + 600);
    const opaque = sessionUserFromAuth(
      {
        token: "opaque",
        email: "a",
        nom: "b",
        role: "ANNONCEUR",
        userId: 1,
        expiresAt: new Date((nowS + 7200) * 1000).toISOString(),
      },
      NOW,
    );
    expect(opaque.exp).toBe(nowS + 7200);
  });
  it("computes max-age", () => {
    expect(sessionMaxAge(nowS + 100, NOW)).toBe(100);
    expect(sessionMaxAge(nowS - 100, NOW)).toBe(0);
    expect(sessionMaxAge(null, NOW)).toBe(86400);
  });
});

describe("routing helpers", () => {
  it("role homes", () => {
    expect(roleHome("ANNONCEUR")).toBe("/espace");
    expect(roleHome("SUPERVISEUR")).toBe("/admin");
  });
  it("safeNextPath refuses open redirects", () => {
    expect(safeNextPath("/espace/campagnes?x=1")).toBe("/espace/campagnes?x=1");
    expect(safeNextPath("//evil.com")).toBeNull();
    expect(safeNextPath("https://evil.com")).toBeNull();
    expect(safeNextPath("/\\evil.com")).toBeNull();
    expect(safeNextPath("/api/session")).toBeNull();
  });
  it("canAccessPath by role", () => {
    expect(canAccessPath("ANNONCEUR", "/espace/profil")).toBe(true);
    expect(canAccessPath("ANNONCEUR", "/admin")).toBe(false);
    expect(canAccessPath("OPERATEUR", "/admin/urgences")).toBe(true);
    expect(canAccessPath("OPERATEUR", "/espace")).toBe(false);
    expect(canAccessPath("OPERATEUR", "/tarifs")).toBe(true);
  });
});
