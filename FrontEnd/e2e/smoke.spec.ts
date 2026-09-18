import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { captureConsoleErrors, prepare, ROUTES, waitForContent } from "./fixtures/setup";

test.describe("smoke — chaque route rend son h1 sans erreur console", () => {
  for (const route of ROUTES) {
    test(`${route.path} (${route.persona})`, async ({ page }) => {
      const errors = captureConsoleErrors(page);
      const api = await prepare(page, route.persona);

      const response = await page.goto(route.path);
      expect(response?.status(), "statut HTTP").toBeLessThan(400);
      await expect(page).toHaveURL(new RegExp(`${route.path.replace(/[/[\]]/g, "\\$&")}(\\?|$)`));

      await waitForContent(page);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).not.toBeEmpty();
      // No generic error boundary / unreachable-service message.
      await expect(page.getByText("Le service ZELQANE est momentanément indisponible.")).toHaveCount(
        0,
      );

      // No horizontal scroll (SPEC §4 responsive bar).
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, "débordement horizontal (px)").toBeLessThanOrEqual(1);

      expect(api.unhandled, "appels API non simulés").toEqual([]);
      expect(errors, "erreurs console").toEqual([]);
    });
  }
});

test.describe("smoke — garde des rôles", () => {
  test("un visiteur est renvoyé vers /connexion avec ?next=", async ({ page }) => {
    await prepare(page, "visiteur");
    await page.goto("/espace/campagnes");
    await expect(page).toHaveURL(/\/connexion\?next=%2Fespace%2Fcampagnes/);
    await expect(page.locator("h1")).toHaveCount(1);
  });

  test("un annonceur ne peut pas ouvrir le back-office", async ({ page }) => {
    await prepare(page, "annonceur");
    await page.goto("/admin/moderation");
    await expect(page).toHaveURL(/\/espace$/);
  });

  test("un administrateur est renvoyé de /espace vers /admin", async ({ page }) => {
    await prepare(page, "admin");
    await page.goto("/espace");
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("/connexion avec une session valide redirige vers l'espace du rôle", async ({ page }) => {
    await prepare(page, "annonceur");
    await page.goto("/connexion");
    await expect(page).toHaveURL(/\/espace$/);
  });
});

const AXE_PAGES = [
  { path: "/", persona: "visiteur" },
  { path: "/connexion", persona: "visiteur" },
  { path: "/espace", persona: "annonceur" },
  { path: "/espace/campagnes/nouvelle", persona: "annonceur" },
  { path: "/admin/moderation", persona: "admin" },
] as const;

test.describe("accessibilité — WCAG 2.1 AA (axe) : 0 violation sérieuse ou critique", () => {
  for (const { path, persona } of AXE_PAGES) {
    test(`axe ${path}`, async ({ page }) => {
      await prepare(page, persona);
      await page.goto(path);
      await waitForContent(page);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const blocking = results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
        }));
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    });
  }
});
