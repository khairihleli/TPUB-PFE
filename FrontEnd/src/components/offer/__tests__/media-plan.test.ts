import { describe, expect, it } from "vitest";

import {
  BUILDER_CRITERIA,
  buildMediaPlanHref,
  buildMediaPlanMessage,
  buildPeriodSummary,
  countSpecifiedCriteria,
  EMPTY_SELECTION,
  type MediaPlanSelection,
  toggleValue,
} from "@/components/offer/media-plan";
import { PRICE_CRITERIA } from "@/components/offer/tarifs-content";

function parse(href: string): URLSearchParams {
  const [path, query = ""] = href.split("?");
  expect(path).toBe("/contact");
  return new URLSearchParams(query);
}

const FULL: MediaPlanSelection = {
  profil: "agence",
  emplacements: ["rue-quartier", "grand-axe"],
  zones: "  Tunis Centre, La Marsa ",
  ecrans: ["hauteur-yeux"],
  pression: "reguliere",
  creneaux: ["soiree", "matin"],
  duree: "semaines",
  saison: ["rentree"],
  formats: ["video"],
};

describe("media plan builder model", () => {
  it("routes an empty brief to the plan-media contact need only", () => {
    expect(buildMediaPlanHref(EMPTY_SELECTION)).toBe("/contact?besoin=plan-media");
    expect(countSpecifiedCriteria(EMPTY_SELECTION)).toBe(0);
  });

  it("serialises every criterion with repeated keys, in option order", () => {
    const params = parse(buildMediaPlanHref(FULL));
    expect(params.get("besoin")).toBe("plan-media");
    expect(params.get("profil")).toBe("agence");
    expect(params.getAll("emplacements")).toEqual(["grand-axe", "rue-quartier"]);
    expect(params.getAll("creneaux")).toEqual(["matin", "soiree"]);
    expect(params.getAll("ecrans")).toEqual(["hauteur-yeux"]);
    expect(params.get("pression")).toBe("reguliere");
    expect(params.get("duree")).toBe("semaines");
    expect(params.getAll("formats")).toEqual(["video"]);
    expect(params.get("zones")).toBe("Tunis Centre, La Marsa");
    expect(params.get("periode")).toBe("Quelques semaines · Rentrée");
    expect(countSpecifiedCriteria(FULL)).toBe(6);
  });

  it("drops unknown slugs and duplicates (tampered state)", () => {
    const params = parse(
      buildMediaPlanHref({
        ...EMPTY_SELECTION,
        profil: "pirate",
        emplacements: ["grand-axe", "grand-axe", "<script>"],
        pression: "maximum",
      }),
    );
    expect(params.get("profil")).toBeNull();
    expect(params.getAll("emplacements")).toEqual(["grand-axe"]);
    expect(params.get("pression")).toBeNull();
  });

  it("builds a readable French message without any price", () => {
    const message = buildMediaPlanMessage(FULL);
    expect(message).toContain("Profil : Agence média");
    expect(message).toContain(
      "Emplacement et zone : Grand axe, Rue de quartier, Tunis Centre, La Marsa",
    );
    expect(message).toContain("Créneaux et période : Matin, Soirée, Quelques semaines");
    expect(message).not.toMatch(/\d+\s?(DT|TND|dinars)/i);
    expect(parse(buildMediaPlanHref(FULL)).get("message")).toBe(message);
  });

  it("summarises the period from duration and seasons only", () => {
    expect(buildPeriodSummary(EMPTY_SELECTION)).toBe("");
    expect(buildPeriodSummary({ ...EMPTY_SELECTION, saison: ["ramadan", "fetes"] })).toBe(
      "Fêtes de fin d'année · Ramadan",
    );
  });

  it("toggles values", () => {
    expect(toggleValue(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"]);
  });

  it("keeps the builder aligned with the six pricing criteria cards", () => {
    expect(BUILDER_CRITERIA.map((c) => [c.id, c.number, c.title])).toEqual(
      PRICE_CRITERIA.map((c) => [c.id, c.number, c.title]),
    );
  });
});
