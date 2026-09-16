import { describe, expect, it } from "vitest";

import { parseWizardStepParam, routes, sectionOf, withQuery } from "@/lib/routes";
import {
  nextSort,
  param,
  parseSortParam,
  readUrlState,
  serializeSort,
  writeUrlState,
} from "@/lib/url-state";

describe("routes (UX-PLAN §3.5)", () => {
  it("builds espace object and list hrefs", () => {
    expect(routes.espace.home()).toBe("/espace");
    expect(routes.espace.campaign(7)).toBe("/espace/campagnes/7");
    expect(routes.espace.campaignEdit(7)).toBe("/espace/campagnes/7/modifier");
    expect(routes.espace.campaigns()).toBe("/espace/campagnes");
    expect(routes.espace.campaigns({ statut: "toutes" })).toBe("/espace/campagnes");
    expect(routes.espace.campaigns({ statut: "en-examen", q: "la marsa" })).toBe(
      "/espace/campagnes?statut=en-examen&q=la+marsa",
    );
    expect(routes.espace.reservations({ campagne: 1, statut: "TEMPORAIRE" })).toBe(
      "/espace/reservations?statut=TEMPORAIRE&campagne=1",
    );
    expect(routes.espace.network({ porteur: 12 })).toBe("/espace/reseau?porteur=12");
  });

  it("maps wizard steps details=1 porteurs=2 verification=3 (legacy 4 → 3)", () => {
    expect(routes.espace.wizard(null)).toBe("/espace/campagnes/nouvelle");
    expect(routes.espace.wizard(7, "details")).toBe("/espace/campagnes/nouvelle?id=7&etape=1");
    expect(routes.espace.wizard(7, "porteurs")).toBe("/espace/campagnes/nouvelle?id=7&etape=2");
    expect(routes.espace.wizard(7, "verification")).toBe("/espace/campagnes/nouvelle?id=7&etape=3");
    expect(routes.espace.wizard(7, 4)).toBe("/espace/campagnes/nouvelle?id=7&etape=3");
    expect(parseWizardStepParam("4")).toBe("verification");
    expect(parseWizardStepParam(null)).toBe("details");
  });

  it("builds admin hrefs", () => {
    expect(routes.admin.moderation({ examen: 3 })).toBe("/admin/moderation?examen=3");
    expect(routes.admin.network({ onglet: "ecrans", panneau: "coherence" })).toBe(
      "/admin/reseau?onglet=ecrans&panneau=coherence",
    );
    expect(routes.player(4)).toBe("/ecran/4");
    expect(routes.login({ next: "/espace/campagnes?q=a", expire: true })).toBe(
      "/connexion?next=%2Fespace%2Fcampagnes%3Fq%3Da&expire=1",
    );
  });

  it("helpers", () => {
    expect(withQuery("/x", { a: 1, b: null, c: "" })).toBe("/x?a=1");
    expect(sectionOf("/espace/campagnes")).toBe("espace");
    expect(sectionOf("/admin")).toBe("admin");
    expect(sectionOf("/espacex")).toBeNull();
  });
});

describe("url state codecs", () => {
  const schema = {
    statut: param.enum(["toutes", "a-finaliser", "en-examen"] as const, "toutes", {
      brouillons: "a-finaliser",
    }),
    q: param.string(),
    campagne: param.id(),
    vue: param.optionalEnum(["carte", "liste"] as const),
    archive: param.boolean(),
  };

  it("reads typed state with defaults and legacy values", () => {
    expect(
      readUrlState(schema, new URLSearchParams("statut=brouillons&campagne=12&vue=liste")),
    ).toEqual({
      statut: "a-finaliser",
      q: "",
      campagne: 12,
      vue: "liste",
      archive: false,
    });
    expect(
      readUrlState(schema, new URLSearchParams("statut=zzz&campagne=-3&vue=x")).campagne,
    ).toBeNull();
  });

  it("writes partial updates, dropping defaults and keeping other params", () => {
    const next = writeUrlState(schema, new URLSearchParams("tri=-debut&statut=en-examen"), {
      statut: "toutes",
      q: "marsa",
    });
    expect(next.toString()).toBe("tri=-debut&q=marsa");
  });
});

describe("table sort param", () => {
  it("parses and serializes ?tri=colonne / ?tri=-colonne", () => {
    expect(parseSortParam("debut")).toEqual({ key: "debut", dir: "asc" });
    expect(parseSortParam("-cout")).toEqual({ key: "cout", dir: "desc" });
    expect(parseSortParam("-", ["cout"])).toBeNull();
    expect(parseSortParam("nom", ["cout"])).toBeNull();
    expect(serializeSort({ key: "cout", dir: "desc" })).toBe("-cout");
  });
  it("toggles direction on the same column", () => {
    expect(nextSort(null, "nom")).toEqual({ key: "nom", dir: "asc" });
    expect(nextSort({ key: "nom", dir: "asc" }, "nom")).toEqual({ key: "nom", dir: "desc" });
    expect(nextSort({ key: "nom", dir: "desc" }, "cout")).toEqual({ key: "cout", dir: "asc" });
  });
});
