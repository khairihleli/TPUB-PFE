import { render } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";

import AProposPage, { metadata as aproposMeta } from "@/app/(marketing)/a-propos/page";
import FonctionnementPage, {
  metadata as fonctionnementMeta,
} from "@/app/(marketing)/fonctionnement/page";
import ReseauPage, { metadata as reseauMeta } from "@/app/(marketing)/reseau/page";

const PAGES: [string, ComponentType, { title?: unknown }][] = [
  ["/reseau", ReseauPage, reseauMeta],
  ["/fonctionnement", FonctionnementPage, fonctionnementMeta],
  ["/a-propos", AProposPage, aproposMeta],
];

describe.each(PAGES)("page %s", (_path, Page, meta) => {
  it("renders exactly one h1, unique ids and resolvable aria-labelledby", () => {
    const { container } = render(<Page />);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("main")).toBeNull();

    const ids = Array.from(container.querySelectorAll("[id]")).map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const el of Array.from(container.querySelectorAll("[aria-labelledby]"))) {
      const ref = el.getAttribute("aria-labelledby")!;
      expect(container.querySelector(`[id="${ref}"]`), ref).not.toBeNull();
    }
  });

  it("has a French metadata title", () => {
    expect(typeof meta.title).toBe("string");
  });

  it("gives every image an alt attribute and never shows a LIVE badge", () => {
    const { container } = render(<Page />);
    for (const img of Array.from(container.querySelectorAll("img"))) {
      expect(img.hasAttribute("alt")).toBe(true);
    }
    expect(container.textContent).not.toMatch(/\bLIVE\b|en direct/i);
  });

  it("links in-page anchors to existing sections", () => {
    const { container } = render(<Page />);
    for (const a of Array.from(container.querySelectorAll('a[href^="#"]'))) {
      const id = a.getAttribute("href")!.slice(1);
      expect(container.querySelector(`[id="${id}"]`), id).not.toBeNull();
    }
  });
});
