// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { middleware } from "@/middleware";
import { base64UrlEncode, serializeUserCookie } from "@/lib/session-cookie";

const future = Math.floor(Date.now() / 1000) + 3600;
const token = `${base64UrlEncode('{"alg":"HS512"}')}.${base64UrlEncode(JSON.stringify({ exp: future }))}.sig`;

function cookieOf(mustChangePassword: boolean) {
  const user = serializeUserCookie({
    email: "admin@zelqane.local",
    nom: "Admin",
    role: "ADMINISTRATEUR",
    userId: 1,
    exp: future,
    mustChangePassword,
  });
  return `zelqane_token=${token}; zelqane_user=${user}`;
}

function run(path: string, cookie?: string) {
  const res = middleware(
    new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} }),
  );
  return { status: res.status, location: res.headers.get("location") };
}

describe("middleware — round 2 (§3.7)", () => {
  it("forces the password change before any private page", () => {
    expect(run("/admin/reseau", cookieOf(true)).location).toBe(
      "http://localhost:3000/mot-de-passe-requis",
    );
    expect(run("/admin/reseau", cookieOf(false)).location).toBeNull();
    expect(run("/connexion", cookieOf(true)).location).toBe(
      "http://localhost:3000/mot-de-passe-requis",
    );
  });

  it("requires a session on /mot-de-passe-requis", () => {
    expect(run("/mot-de-passe-requis").location).toBe("http://localhost:3000/connexion");
    const ok = run("/mot-de-passe-requis", cookieOf(true));
    expect(ok.location).toBeNull();
  });

  it("requires a challenge in progress on the verification pages", () => {
    expect(run("/connexion/verification?next=%2Fadmin").location).toBe(
      "http://localhost:3000/connexion?expire=1&next=%2Fadmin",
    );
    expect(run("/connexion/activer-2fa").location).toBe("http://localhost:3000/connexion?expire=1");
    expect(run("/connexion/verification", "zelqane_challenge_actif=1").location).toBeNull();
  });
});
