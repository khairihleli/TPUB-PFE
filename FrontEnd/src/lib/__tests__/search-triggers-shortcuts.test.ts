import { describe, expect, it } from "vitest";

import { detectReviewTriggers, reviewTriggerHint, reviewTriggerTerms } from "@/lib/review-triggers";
import { matchScore, normalizeSearch, rankItems } from "@/lib/search";
import {
  focusPageSearch,
  isEditableTarget,
  isSingleKey,
  keyLabels,
  keysAriaLabel,
  matchesStroke,
  parseKeys,
  registerPageSearch,
  shortcutSectionsFor,
} from "@/lib/shortcuts";

describe("search ranking", () => {
  it("normalizes accents and case", () => {
    expect(normalizeSearch("  Été  à LA Marsa ")).toBe("ete a la marsa");
  });

  it("ranks prefix, then word start, then substring", () => {
    expect(matchScore("Marsa Plage", "mar")).toBe(3);
    expect(matchScore("Ouverture boutique La Marsa", "marsa")).toBe(2);
    expect(matchScore("Lamarsa", "marsa")).toBe(1);
    expect(matchScore("Tunis", "marsa")).toBe(0);
    const items = [
      { label: "Lamarsa centre" },
      { label: "Ouverture boutique La Marsa" },
      { label: "Marsa Plage" },
      { label: "Sousse" },
    ];
    expect(rankItems(items, "marsa").map((i) => i.label)).toEqual([
      "Marsa Plage",
      "Ouverture boutique La Marsa",
      "Lamarsa centre",
    ]);
    expect(rankItems(items, "", 2)).toHaveLength(2);
  });

  it("matches keywords without outranking a label prefix", () => {
    const items = [{ label: "Écran Avenue", keywords: ["Tunis Centre"] }, { label: "Tunis Nord" }];
    expect(rankItems(items, "tunis").map((i) => i.label)).toEqual(["Tunis Nord", "Écran Avenue"]);
  });
});

describe("review triggers (FLOW-05)", () => {
  it("detects word forms, accent and case insensitive", () => {
    expect(detectReviewTriggers("Entrée GRATUITE pour tous, résultat garanti !")).toEqual([
      { term: "gratuit", match: "GRATUITE", index: 7 },
      { term: "garanti", match: "garanti", index: 36 },
    ]);
    expect(reviewTriggerTerms("gratuits et gratuites, garanties")).toEqual(["gratuit", "garanti"]);
  });

  it("ignores other words containing the letters", () => {
    expect(detectReviewTriggers("Nous garantissons la qualité, ingratuit")).toEqual([]);
    expect(detectReviewTriggers(null)).toEqual([]);
  });

  it("explains how to reword", () => {
    expect(reviewTriggerHint("gratuit")).toContain("entrée gratuite pour les moins de 12 ans");
  });
});

describe("shortcut grammar", () => {
  const ev = (key: string, mods: Partial<KeyboardEvent> = {}) =>
    ({
      key,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      ...mods,
    }) as KeyboardEvent;

  it("parses sequences and modifiers", () => {
    expect(parseKeys("g d")).toHaveLength(2);
    expect(parseKeys("mod+k")[0]).toEqual({ key: "k", mod: true, shift: false, alt: false });
    expect(isSingleKey("?")).toBe(true);
    expect(isSingleKey("shift+?")).toBe(true);
    expect(isSingleKey("mod+k")).toBe(false);
  });

  it("matches ⌘K and Ctrl+K, and « ? » with Shift", () => {
    const [modK] = parseKeys("mod+k");
    expect(matchesStroke(ev("k", { ctrlKey: true }), modK!)).toBe(true);
    expect(matchesStroke(ev("K", { metaKey: true }), modK!)).toBe(true);
    expect(matchesStroke(ev("k"), modK!)).toBe(false);
    const [help] = parseKeys("shift+?");
    expect(matchesStroke(ev("?", { shiftKey: true }), help!)).toBe(true);
    const [n] = parseKeys("n");
    expect(matchesStroke(ev("n", { ctrlKey: true }), n!)).toBe(false);
  });

  it("detects editable targets", () => {
    const input = document.createElement("input");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    document.body.append(input, checkbox, div);
    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(checkbox)).toBe(false);
    expect(isEditableTarget(document.createElement("textarea"))).toBe(true);
    expect(isEditableTarget(document.body)).toBe(false);
    input.remove();
    checkbox.remove();
    div.remove();
  });

  it("labels keys per platform", () => {
    expect(keyLabels("mod+k", true)).toEqual([["⌘", "K"]]);
    expect(keyLabels("mod+k", false)).toEqual([["Ctrl", "K"]]);
    expect(keysAriaLabel("g d", false)).toBe("G puis D");
    expect(keyLabels("escape", false)).toEqual([["Échap"]]);
  });

  it("lists global + map + Studio sections on the network page only", () => {
    const ids = (p: string, v: "espace" | "admin" = "espace") =>
      shortcutSectionsFor(v, p).map((s) => s.id);
    expect(ids("/espace/reseau")).toEqual(["global", "navigation", "map", "studio"]);
    expect(ids("/espace/campagnes")).toEqual(["global", "navigation"]);
    expect(ids("/admin/moderation", "admin")).toEqual(["global", "navigation", "moderation"]);
  });

  it("lets a page search take « / »", () => {
    expect(focusPageSearch()).toBe(false);
    let focused = 0;
    const off = registerPageSearch(() => focused++);
    expect(focusPageSearch()).toBe(true);
    expect(focused).toBe(1);
    off();
    expect(focusPageSearch()).toBe(false);
  });
});
