import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import * as aproposContent from "@/components/story/a-propos-content";
import { ChannelsStrip } from "@/components/story/channels-strip";
import { DiffusionCascade } from "@/components/story/diffusion-cascade";
import { EmplacementTypes } from "@/components/story/emplacement-types";
import * as fonctionnementContent from "@/components/story/fonctionnement-content";
import {
  buildStatusRows,
  JOURNEY_STEPS,
  STATUS_TABLE_ORDER,
  statusNextAction,
} from "@/components/story/fonctionnement-content";
import { JourneyTimeline, summarizePhases } from "@/components/story/journey-timeline";
import { MaturityPanel } from "@/components/story/maturity-panel";
import { PriorityTakeoverSchema, TAKEOVER_ROWS } from "@/components/story/priority-takeover";
import * as reseauContent from "@/components/story/reseau-content";
import { StatusTable } from "@/components/story/status-table";
import { ZonesExplainer } from "@/components/story/zones-explainer";
import type { CampaignStatus } from "@/lib/api/types";
import { CAMPAIGN_STATUS } from "@/lib/campaign-status";

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === "object")
    Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

describe("story copy guardrails (brief §6)", () => {
  const strings = [reseauContent, fonctionnementContent, aproposContent]
    .flatMap((m) => collectStrings(m))
    // CSS object positions (« 64% center ») are not copy.
    .filter(
      (s) =>
        !/^(center|top|bottom|left|right|\d+%)(\s+(center|top|bottom|left|right|\d+%))?$/.test(s),
    );
  const text = strings.join("\n");

  it.each([
    ["LIVE badge", /\bLIVE\b/],
    ["« en direct »", /en direct/i],
    ["percentages", /\d\s?%/],
    ["inflated counts (500+, 1M+)", /\d+\s?[kKmM]?\+/],
    ["superlatives", /\b(leader|n°\s?1|révolution|le meilleur|premier réseau)/i],
    [
      "guaranteed precision / certified audience",
      /(précision garantie|mesure exacte|certifiée|auditée)/i,
    ],
    ["ROI claims", /\bROI\b/],
    ["confusing acronym", /Tunisian Public Broadcasting/i],
    ["operating present tense", /(nous diffusons|le réseau couvre)/i],
    ["prices", /\d+\s?(DT|TND|dinars)\b/i],
    ["partnership claims", /partenariat avec|en partenariat/i],
    ["facial recognition", /reconnaissance faciale/i],
  ])("contains no %s", (_label, pattern) => {
    expect(text).not.toMatch(pattern);
  });

  it("keeps the brief headlines", () => {
    expect(`${reseauContent.RESEAU_HERO.title} ${reseauContent.RESEAU_HERO.highlight}`).toBe(
      "Un réseau d'écrans conçu sur les Porteurs.",
    );
    expect(
      `${fonctionnementContent.FONCTIONNEMENT_HERO.title} ${fonctionnementContent.FONCTIONNEMENT_HERO.highlight}`,
    ).toBe("De la réservation à la preuve de diffusion.");
    expect(`${aproposContent.APROPOS_HERO.title} ${aproposContent.APROPOS_HERO.highlight}`).toBe(
      "Transformer une présence en portée vérifiable.",
    );
  });

  it("uses local routes only (no localhost)", () => {
    const hrefs = strings.filter((s) => s.startsWith("/") || s.startsWith("#"));
    expect(hrefs.length).toBeGreaterThan(5);
    for (const href of hrefs) expect(href).not.toMatch(/localhost/);
  });
});

describe("public status table", () => {
  const ALL: CampaignStatus[] = [
    "BROUILLON",
    "PENDING_AI_CHECK",
    "APPROVED_BY_AI",
    "REVIEW_REQUIRED",
    "REJECTED_BY_AI",
    "ACTIVE",
    "TERMINATED",
    "BLOCKED",
  ];

  it("covers every status an advertiser can see plus « Programmée », without duplicate labels", () => {
    for (const s of ALL) expect(STATUS_TABLE_ORDER).toContain(s);
    expect(STATUS_TABLE_ORDER).toContain("SCHEDULED");
    // Never set by the backend (contract §7.15): validation goes straight to ACTIVE.
    expect(STATUS_TABLE_ORDER).not.toContain("VALIDATED_BY_ADMIN");
    expect(JOURNEY_STEPS.flatMap((s) => s.statuses ?? [])).not.toContain("VALIDATED_BY_ADMIN");
    const labels = buildStatusRows().map((r) => r.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("takes labels, tones and descriptions verbatim from campaign-status.ts", () => {
    for (const row of buildStatusRows()) {
      expect(row.label).toBe(CAMPAIGN_STATUS[row.key].label);
      expect(row.tone).toBe(CAMPAIGN_STATUS[row.key].tone);
      expect(row.description).toBe(CAMPAIGN_STATUS[row.key].description);
    }
  });

  it("maps next actions from the editing rules", () => {
    expect(statusNextAction("BROUILLON")).toMatch(/soumettre/i);
    expect(statusNextAction("REJECTED_BY_AI")).toMatch(/Dupliquer/);
    expect(statusNextAction("APPROVED_BY_AI")).toMatch(/expert ZELQANE/);
    expect(statusNextAction("REVIEW_REQUIRED")).toMatch(/expert ZELQANE/);
    expect(statusNextAction("PENDING_AI_CHECK")).toMatch(/analyse/);
    expect(statusNextAction("ACTIVE")).toMatch(/diffusions/);
    expect(statusNextAction("SCHEDULED")).toMatch(/date de début/);
    expect(statusNextAction("ENDED")).toBe(statusNextAction("TERMINATED"));
    expect(statusNextAction("BLOCKED")).toMatch(/motif/);
  });

  it("renders one row per status with its French label", () => {
    render(<StatusTable />);
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(STATUS_TABLE_ORDER.length + 1);
    expect(within(table).getByText("Revue manuelle")).toBeInTheDocument();
    expect(within(table).getByText("À corriger")).toBeInTheDocument();
  });
});

describe("journey timeline", () => {
  it("has the nine brief steps in order", () => {
    expect(JOURNEY_STEPS.map((s) => s.title)).toEqual([
      "Inscription",
      "Exploration",
      "Création de campagne",
      "Créations",
      "Réservation",
      "Soumission et analyse IA",
      "Validation ZELQANE",
      "Diffusion",
      "Suivi",
    ]);
  });

  it("summarizes consecutive phases with 1-based ranges", () => {
    expect(summarizePhases(JOURNEY_STEPS)).toEqual([
      { phase: "acces", label: "Accès", from: 1, to: 2 },
      { phase: "preparation", label: "Préparation", from: 3, to: 5 },
      { phase: "controle", label: "Contrôle", from: 6, to: 7 },
      { phase: "diffusion", label: "Diffusion et suivi", from: 8, to: 9 },
    ]);
  });

  it("renders nine steps and flags self-service upload as not yet available", () => {
    render(<JourneyTimeline />);
    const list = screen.getByRole("list", { name: "Parcours en neuf étapes" });
    expect(within(list).getAllByRole("heading", { level: 3 })).toHaveLength(9);
    expect(screen.getByText(/bientôt disponible/)).toBeInTheDocument();
  });
});

describe("réseau sections", () => {
  it("renders the four emplacement types, D without image or inventory", () => {
    render(<EmplacementTypes />);
    const list = screen.getByRole("list", { name: "Types d'emplacements du Porteur" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(within(items[0]!).getByRole("img")).toHaveAttribute("alt");
    expect(within(items[0]!).getByText("Illustration")).toBeInTheDocument();
    expect(within(items[3]!).queryByRole("img")).toBeNull();
    expect(within(items[3]!).getByText("Pas d'inventaire ZELQANE")).toBeInTheDocument();
  });

  it("orders diffusion as message prioritaire → publicité → contenu par défaut", () => {
    render(<DiffusionCascade />);
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["Message prioritaire", "Publicité", "Contenu par défaut"]);
    expect(screen.getAllByText("Illustration").length).toBeGreaterThan(0);
  });

  it("labels the zones map as an illustration and shows the empty-state wording", () => {
    render(<ZonesExplainer />);
    expect(screen.getByText("Illustration")).toBeInTheDocument();
    expect(
      screen.getByText(/La carte des zones s'affichera ici dès que les premières zones/),
    ).toBeInTheDocument();
  });

  it("lists the five support types with interactions only on connected channels", () => {
    render(<ChannelsStrip />);
    const list = screen.getByRole("list", { name: "Types de supports prévus par la plateforme" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(within(list).getAllByText("Clics et interactions")).toHaveLength(3);
  });
});

describe("fonctionnement & à propos visuals", () => {
  it("takes over only the in-zone screen during the priority phase", () => {
    const inZone = TAKEOVER_ROWS.find((r) => r.key === "in")!;
    const outZone = TAKEOVER_ROWS.find((r) => r.key === "out")!;
    expect(inZone.phases[1]!.every((s) => s.kind === "message")).toBe(true);
    expect(outZone.phases.flat().some((s) => s.kind === "message")).toBe(false);
    render(<PriorityTakeoverSchema />);
    expect(screen.getByText(/écrans hors zone continuent normalement/)).toBeInTheDocument();
  });

  it("states the maturity status and what is not claimed", () => {
    render(<MaturityPanel />);
    expect(
      screen.getByRole("heading", { level: 2, name: /au stade de la conception/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Aucun nombre d'écrans ni de zones")).toBeInTheDocument();
  });

  it("places ZELQANE in the pôle with AFRIVA and INFINTRA", () => {
    expect(aproposContent.GROUP_SECTION.text).toMatch(/AFRIVA/);
    expect(aproposContent.GROUP_SECTION.text).toMatch(/INFINTRA/);
    expect(aproposContent.GROUP_CHAIN.filter((n) => n.self).map((n) => n.name)).toEqual(["ZELQANE"]);
  });
});
