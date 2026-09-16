import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import * as content from "@/components/home/content";
import { HomeFaq } from "@/components/home/home-faq";
import { LogAnatomy } from "@/components/home/home-intro";
import { HomeMeasurement } from "@/components/home/home-measurement";
import { HomePersonas } from "@/components/home/home-personas";
import { StepsTrack } from "@/components/home/home-steps";
import {
  buildOrganizationJsonLd,
  OrganizationJsonLd,
  serializeJsonLd,
} from "@/components/home/organization-json-ld";

/** Recursively collect every string in the copy module. */
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === "object")
    Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

describe("home copy guardrails (brief §6)", () => {
  // Ignore CSS object-position values (« center 55% »), which are not copy.
  const strings = collectStrings(content).filter(
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
  ])("contains no %s", (_label, pattern) => {
    expect(text).not.toMatch(pattern);
  });

  it("uses local French routes or anchors only", () => {
    const hrefs = strings.filter((s) => s.startsWith("/") || s.startsWith("#"));
    expect(hrefs.length).toBeGreaterThan(5);
    for (const href of hrefs) {
      expect(href).not.toMatch(/localhost|mailto:/);
    }
  });

  it("has the 8 FAQ entries, 4 steps, 4 pillars and 4 personas", () => {
    expect(content.FAQ_ITEMS).toHaveLength(8);
    expect(content.STEPS).toHaveLength(4);
    expect(content.PILLARS).toHaveLength(4);
    expect(content.PERSONAS).toHaveLength(4);
    expect(content.MECHANISMS.map((m) => m.label)).toEqual([
      "Par zone",
      "Par créneau",
      "Double contrôle",
      "Journalisé",
    ]);
  });
});

describe("Organization JSON-LD", () => {
  it("describes TPUB with Tukhnanutha as parent organization", () => {
    const data = buildOrganizationJsonLd("https://tpub.example/");
    expect(data["@type"]).toBe("Organization");
    expect(data.name).toBe("TPUB");
    expect(data.url).toBe("https://tpub.example/");
    expect(data.logo).toBe("https://tpub.example/brand/tpub.png");
    expect(data.parentOrganization).toMatchObject({
      "@type": "Organization",
      name: "Tukhnanutha",
      url: "https://www.tukhnanutha.com",
    });
  });

  it("escapes < so the payload cannot close the script element", () => {
    const out = serializeJsonLd({ x: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual({ x: "</script><script>alert(1)</script>" });
  });

  it("renders a parseable ld+json script as a text child", () => {
    const { container } = render(<OrganizationJsonLd />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const parsed = JSON.parse(script?.textContent ?? "") as {
      parentOrganization: { name: string };
    };
    expect(parsed.parentOrganization.name).toBe("Tukhnanutha");
  });
});

describe("home sections", () => {
  it("renders the four numbered steps as an ordered list with h3 titles", () => {
    render(<StepsTrack />);
    const list = screen.getByRole("list");
    expect(list.tagName).toBe("OL");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(
      screen.getByRole("heading", { level: 3, name: /Étape 1 : Choisissez vos zones/ }),
    ).toBeInTheDocument();
  });

  it("labels the simulated log line as an illustration", () => {
    render(<LogAnatomy />);
    expect(screen.getByText("Illustration")).toBeInTheDocument();
    expect(screen.getByText("Quel écran")).toBeInTheDocument();
    expect(screen.getByText("Écran A-12")).toBeInTheDocument();
  });

  it("gives each persona its differentiated CTA", () => {
    render(<HomePersonas />);
    expect(screen.getByRole("link", { name: /Demander un plan média/ })).toHaveAttribute(
      "href",
      "/contact",
    );
    expect(screen.getByRole("link", { name: /Créer mon compte/ })).toHaveAttribute(
      "href",
      "/inscription",
    );
    expect(screen.getByRole("link", { name: /Nous contacter/ })).toHaveAttribute(
      "href",
      "/contact",
    );
  });

  it("renders the FAQ with the first answer open", () => {
    render(<HomeFaq />);
    const first = screen.getByRole("button", { name: /^TPUB est-il déjà en service\s\?$/ });
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("button")).toHaveLength(8);
    expect(screen.getByText(/TPUB est en phase de conception/)).toBeInTheDocument();
  });

  it("separates what is proven from what is only estimated", () => {
    render(<HomeMeasurement />);
    expect(screen.getByText("Prouvé par la plateforme")).toBeInTheDocument();
    expect(screen.getByText("Estimé, avec sa méthode")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Disponibilité.",
      "Diffusions.",
      "Suivi de campagne.",
      "Audience, exposition.",
    ]);
    expect(screen.getByRole("link", { name: /échelle de confiance/ })).toHaveAttribute(
      "href",
      "/fonctionnement#mesure",
    );
  });

  it("does not repeat the step number as a visible label next to the disc", () => {
    render(<StepsTrack />);
    expect(screen.queryByText(/^Étape 0\d$/)).not.toBeInTheDocument();
  });
});
