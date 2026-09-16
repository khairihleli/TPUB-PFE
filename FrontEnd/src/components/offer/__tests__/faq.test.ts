import { describe, expect, it } from "vitest";

import { PERSONAS, SIGNING_QUESTIONS, CAPABILITIES } from "@/components/offer/annonceurs-content";
import { FAQ_THEMES } from "@/components/offer/faq-content";
import { buildFaqJsonLd, serializeJsonLd } from "@/components/offer/faq-jsonld";
import { COMPARE_POINTS, PRICE_CRITERIA } from "@/components/offer/tarifs-content";

describe("FAQ JSON-LD", () => {
  it("lists every question of every theme as a schema.org Question", () => {
    const data = buildFaqJsonLd(FAQ_THEMES);
    const total = FAQ_THEMES.reduce((n, t) => n + t.entries.length, 0);
    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity).toHaveLength(total);
    expect(data.mainEntity[0]).toEqual({
      "@type": "Question",
      name: "TPUB est-il déjà en service ?",
      acceptedAnswer: { "@type": "Answer", text: expect.stringContaining("phase de conception") },
    });
  });

  it("never lets the payload close the script element", () => {
    const out = serializeJsonLd({ text: "</script><script>alert(1)</script> & co" });
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(JSON.parse(out)).toEqual({ text: "</script><script>alert(1)</script> & co" });
  });

  it("covers the five objection themes with unique anchors and questions", () => {
    expect(FAQ_THEMES.map((t) => t.id)).toEqual([
      "statut",
      "prix",
      "mesure",
      "moderation",
      "ciblage",
    ]);
    const questions = FAQ_THEMES.flatMap((t) => t.entries.map((e) => e.question));
    expect(new Set(questions).size).toBe(questions.length);
  });
});

describe("offer copy guardrails (brief §6)", () => {
  const corpus = JSON.stringify([
    FAQ_THEMES,
    PERSONAS.map(({ icon: _icon, ...p }) => p),
    SIGNING_QUESTIONS,
    CAPABILITIES.map(({ icon: _icon, ...c }) => c),
    PRICE_CRITERIA.map(({ icon: _icon, ...c }) => c),
    COMPARE_POINTS,
  ]);

  it.each([
    ["LIVE badge", /\blive\b/i],
    ["superlatives", /\b(leader|n°\s?1|révolutionn|le meilleur|premier réseau)/i],
    ["amounts", /\d[\d\s.,]*\s?(DT|TND|dinars|€)/i],
    ["percentages", /\d+\s?%/],
    ["guarantees", /(précision garantie|mesure exacte|audience certifiée|audience auditée)/i],
    ["screen counts", /\d+\s?\+?\s?(écrans|gouvernorats|campagnes|annonceurs)/i],
  ])("contains no %s", (_label, pattern) => {
    expect(corpus).not.toMatch(pattern);
  });
});
