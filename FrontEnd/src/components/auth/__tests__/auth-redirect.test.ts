import { describe, expect, it } from "vitest";

import { postAuthDestination, safeRedirectPath, withNext } from "@/components/auth/auth-redirect";

describe("safeRedirectPath", () => {
  it("keeps same-origin relative paths with query and hash", () => {
    expect(safeRedirectPath("/espace/campagnes?statut=brouillon#liste")).toBe(
      "/espace/campagnes?statut=brouillon#liste",
    );
    expect(safeRedirectPath("/tarifs")).toBe("/tarifs");
    expect(safeRedirectPath(["/espace/profil", "/admin"])).toBe("/espace/profil");
  });

  it("normalises dot segments without leaving the origin", () => {
    expect(safeRedirectPath("/espace/../admin")).toBe("/admin");
    expect(safeRedirectPath("/../../etc")).toBe("/etc");
  });

  it("refuses absolute, protocol-relative and scheme URLs", () => {
    for (const bad of [
      "https://evil.example",
      "http://localhost:3000/espace",
      "//evil.example",
      "///evil.example",
      "javascript:alert(1)",
      "data:text/html,x",
      "espace",
      "",
      "   ",
    ]) {
      expect(safeRedirectPath(bad), bad).toBeNull();
    }
  });

  it("refuses backslash and control-character tricks", () => {
    expect(safeRedirectPath("/\\evil.example")).toBeNull();
    expect(safeRedirectPath("/\t/evil.example")).toBeNull();
    expect(safeRedirectPath("/\n/evil.example")).toBeNull();
    expect(safeRedirectPath("/espace\\..\\admin")).toBeNull();
  });

  it("refuses API routes, auth screens and missing values", () => {
    expect(safeRedirectPath("/api/session")).toBeNull();
    expect(safeRedirectPath("/api")).toBeNull();
    expect(safeRedirectPath("/connexion?next=/espace")).toBeNull();
    expect(safeRedirectPath("/inscription")).toBeNull();
    expect(safeRedirectPath("/mot-de-passe-oublie")).toBeNull();
    expect(safeRedirectPath(null)).toBeNull();
    expect(safeRedirectPath(undefined)).toBeNull();
    expect(safeRedirectPath("/" + "a".repeat(3000))).toBeNull();
  });
});

describe("postAuthDestination", () => {
  it("honours next when the role may open it", () => {
    expect(postAuthDestination("/espace/campagnes/12", "ANNONCEUR")).toBe("/espace/campagnes/12");
    expect(postAuthDestination("/admin/moderation", "SUPERVISEUR")).toBe("/admin/moderation");
    expect(postAuthDestination("/fonctionnement", "OPERATEUR")).toBe("/fonctionnement");
  });

  it("falls back to the role home otherwise", () => {
    expect(postAuthDestination("/admin", "ANNONCEUR")).toBe("/espace");
    expect(postAuthDestination("/espace", "ADMINISTRATEUR")).toBe("/admin");
    expect(postAuthDestination("https://evil.example", "ANNONCEUR")).toBe("/espace");
    expect(postAuthDestination(null, "OPERATEUR")).toBe("/admin");
    expect(postAuthDestination("/connexion", "ANNONCEUR")).toBe("/espace");
  });
});

describe("withNext", () => {
  it("forwards only a safe next", () => {
    expect(withNext("/inscription", "/espace/campagnes?x=1")).toBe(
      "/inscription?next=%2Fespace%2Fcampagnes%3Fx%3D1",
    );
    expect(withNext("/inscription", "//evil.example")).toBe("/inscription");
    expect(withNext("/inscription", null)).toBe("/inscription");
  });
});
