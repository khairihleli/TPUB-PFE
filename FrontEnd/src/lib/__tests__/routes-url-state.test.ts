import { describe, expect, it } from "vitest";

import { parseWizardStepV2Param, routes, sectionOf, withQuery } from "@/lib/routes";
import {
  baseSearchForWrite,
  nextPendingWrite,
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

  it("maps wizard steps details=1 contenu=2 porteurs=3 verification=4", () => {
    expect(routes.espace.wizard(null)).toBe("/espace/campagnes/nouvelle");
    expect(routes.espace.wizard(7, "details")).toBe("/espace/campagnes/nouvelle?id=7&etape=1");
    expect(routes.espace.wizard(7, "porteurs")).toBe("/espace/campagnes/nouvelle?id=7&etape=3");
    expect(routes.espace.wizard(7, "verification")).toBe("/espace/campagnes/nouvelle?id=7&etape=4");
    expect(routes.espace.wizard(7, 4)).toBe("/espace/campagnes/nouvelle?id=7&etape=4");
  });

  it("maps the v2 wizard details=1 contenu=2 porteurs=3 verification=4", () => {
    expect(routes.espace.campaignWizard(7, "contenu")).toBe(
      "/espace/campagnes/nouvelle?id=7&etape=2",
    );
    expect(routes.espace.campaignWizard(null)).toBe("/espace/campagnes/nouvelle");
    expect(parseWizardStepV2Param("3")).toBe("porteurs");
    expect(parseWizardStepV2Param(4)).toBe("verification");
    expect(parseWizardStepV2Param("contenu")).toBe("contenu");
    expect(parseWizardStepV2Param("9")).toBe("details");
  });

  it("builds the v2 back-office hrefs", () => {
    expect(routes.admin.users()).toBe("/admin/utilisateurs");
    expect(routes.admin.users({ onglet: "equipe" })).toBe("/admin/utilisateurs?onglet=equipe");
    expect(routes.admin.journal({ onglet: "decisions-ia", campagne: 3 })).toBe(
      "/admin/journal?onglet=decisions-ia&campagne=3",
    );
    expect(routes.admin.reservations({ onglet: "conflits" })).toBe(
      "/admin/reservations?onglet=conflits",
    );
    expect(routes.admin.aiRules()).toBe("/admin/regles-ia");
    expect(routes.admin.statistics()).toBe("/admin/statistiques");
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

describe("url writes not yet committed by the router", () => {
  const path = "/admin/moderation";

  it("chains a second write on top of an uncommitted one (examen kept by a debounced search)", () => {
    // « Examiner » pushes ?examen=3 while the address bar still shows ?onglet=a-traiter.
    const live = "?onglet=a-traiter";
    const base1 = baseSearchForWrite(path, live, null);
    expect(base1).toBe("onglet=a-traiter");
    const first = "onglet=a-traiter&examen=3";
    const pending1 = nextPendingWrite(path, live, base1, first, null);

    // The debounced search commits before the router: it must start from the pending write.
    const base2 = baseSearchForWrite(path, live, pending1);
    expect(base2).toBe(first);
    const second = "onglet=a-traiter&examen=3&q=Ouverture";
    const pending2 = nextPendingWrite(path, live, base2, second, pending1);
    expect(pending2.uncommitted).toEqual(["onglet=a-traiter", first]);

    // The router commits the first write only: a third write still sees the second.
    expect(baseSearchForWrite(path, `?${first}`, pending2)).toBe(second);
  });

  it("uses the live URL once committed, after another navigation or on another page", () => {
    const pending = nextPendingWrite(path, "", "", "q=marsa", null);
    expect(baseSearchForWrite(path, "?q=marsa", pending)).toBe("q=marsa");
    expect(baseSearchForWrite(path, "?onglet=toutes", pending)).toBe("onglet=toutes");
    expect(baseSearchForWrite("/admin/journal", "", pending)).toBe("");
    // A write starting from the live URL (not the pending one) starts a new chain.
    expect(
      nextPendingWrite(path, "?onglet=toutes", "onglet=toutes", "x=1", pending).uncommitted,
    ).toEqual(["onglet=toutes"]);
  });
});
