import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

import { expect, type Page, test } from "@playwright/test";

import {
  captureConsoleErrors,
  prepare,
  ROUTES,
  type RouteEntry,
  waitForContent,
} from "./fixtures/setup";

/**
 * Visual QA captures (run with `npx playwright test --grep @screens`).
 * Output: .qa/screens/<project>/<slug>.png (full page) + <slug>-part<N>.png (viewport slices).
 */
const OUT_DIR = path.resolve(process.cwd(), ".qa", "screens");

interface Shot extends RouteEntry {
  diffusion?: "publicite" | "urgence";
}

const SHOTS: readonly Shot[] = [
  ...ROUTES.map((r) => (r.path === "/ecran/1" ? { ...r, diffusion: "publicite" as const } : r)),
  {
    path: "/ecran/1",
    persona: "visiteur",
    slug: "ecran-1-urgence",
    diffusion: "urgence",
  },
  {
    path: "/espace/campagnes/1/modifier",
    persona: "annonceur",
    slug: "espace-campagnes-1-modifier",
  },
];

async function waitForImages(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () =>
        Array.from(document.images).every(
          (img) =>
            img.complete || img.loading === "lazy" || img.getBoundingClientRect().width === 0,
        ),
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => undefined);
}

/** Removes slices left by a previous, longer capture of the same route. */
async function removeStaleSlices(dir: string, slug: string): Promise<void> {
  const pattern = new RegExp(`^${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-part\\d+\\.png$`);
  const entries = await readdir(dir);
  await Promise.all(
    entries.filter((name) => pattern.test(name)).map((name) => rm(path.join(dir, name))),
  );
}

async function capture(page: Page, dir: string, slug: string): Promise<string[]> {
  await removeStaleSlices(dir, slug);
  const files: string[] = [];
  const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
  const total = await page.evaluate(() =>
    Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
  );
  const parts = Math.max(1, Math.ceil(total / viewport.height));

  // Slices first: scrolling also triggers lazy images and reveal-on-scroll observers.
  if (parts > 1) {
    for (let i = 0; i < parts; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), i * viewport.height);
      await page.waitForTimeout(250);
      await waitForImages(page);
      const file = path.join(dir, `${slug}-part${i + 1}.png`);
      await page.screenshot({ path: file, animations: "disabled", caret: "hide" });
      files.push(file);
    }
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  await page
    .waitForFunction(() => Array.from(document.images).every((img) => img.complete), undefined, {
      timeout: 15_000,
    })
    .catch(() => undefined);
  const full = path.join(dir, `${slug}.png`);
  await page.screenshot({ path: full, fullPage: true, animations: "disabled", caret: "hide" });
  files.unshift(full);
  return files;
}

/** Map region mounted with its own layers (one marker per Porteur, no clusters), tiles blocked. */
async function waitForMap(page: Page, name: string): Promise<void> {
  const map = page.getByRole("region", { name, exact: true });
  await expect(map).toHaveAttribute("data-map-engine", /^(webgl|svg)$/);
  // Bring the map into the viewport (mobile: it sits below the page header).
  await map.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await expect(map.locator("button[data-support-id]").first()).toBeVisible({ timeout: 30_000 });
  await expect(map.locator('button[aria-label^="Groupe de "]')).toHaveCount(0);
  // Let MapLibre settle its first frames (fit bounds, zone layers).
  await page.waitForTimeout(1200);
}

async function waitForStudio(page: Page, dialogName: string): Promise<void> {
  const dialog = page.getByRole("dialog", { name: dialogName });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Chargement du Porteur…")).toHaveCount(0, { timeout: 45_000 });
  await page.waitForTimeout(1500);
}

interface InteractiveShot {
  slug: string;
  persona: "annonceur" | "admin";
  path: string;
  /** Brings the page into the state to capture. */
  arrange: (page: Page) => Promise<void>;
}

/** NETWORK-MAP-SPEC §9 captures: explorer, studio (jour + nuit), wizard « Carte », admin map. */
const NETWORK_SHOTS: readonly InteractiveShot[] = [
  {
    slug: "reseau-explorateur",
    persona: "annonceur",
    path: "/espace/reseau",
    arrange: (page) => waitForMap(page, "Carte du réseau TPUB"),
  },
  {
    // ?zone= deep link frames « Tunis Centre »: zone circle, orientation cones, markers.
    slug: "reseau-explorateur-zone",
    persona: "annonceur",
    path: "/espace/reseau?zone=1",
    arrange: async (page) => {
      await waitForMap(page, "Carte du réseau TPUB");
      await expect(
        page.locator('[aria-label="Carte du réseau TPUB"] button[data-support-id="1"]'),
      ).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(1500);
    },
  },
  {
    slug: "reseau-studio-jour",
    persona: "annonceur",
    path: "/espace/reseau?porteur=3",
    arrange: (page) => waitForStudio(page, "Écran Promenade du Lac 2"),
  },
  {
    slug: "reseau-studio-nuit",
    persona: "annonceur",
    path: "/espace/reseau?porteur=1",
    arrange: async (page) => {
      await waitForStudio(page, "Écran Avenue Habib Bourguiba");
      await page
        .getByRole("dialog", { name: "Écran Avenue Habib Bourguiba" })
        .getByRole("button", { name: "Nuit", exact: true })
        .click();
      await page.waitForTimeout(1500);
    },
  },
  {
    slug: "assistant-carte",
    persona: "annonceur",
    path: "/espace/campagnes/nouvelle?id=1&etape=3",
    arrange: (page) =>
      waitForMap(page, "Carte de ciblage : cliquez pour placer ou déplacer la zone"),
  },
  {
    slug: "admin-reseau-carte",
    persona: "admin",
    path: "/admin/reseau",
    arrange: (page) => waitForMap(page, "Carte du réseau TPUB (administration)"),
  },
];

test.describe("@screens @network carte du réseau, studio 3D, assistant, back-office", () => {
  for (const shot of NETWORK_SHOTS) {
    test(`@screens @network ${shot.slug}`, async ({ page }, testInfo) => {
      test.setTimeout(150_000);
      await prepare(page, shot.persona);
      const dir = path.join(OUT_DIR, testInfo.project.name);
      await mkdir(dir, { recursive: true });

      await page.goto(shot.path);
      await waitForContent(page);
      await shot.arrange(page);

      // Viewport capture: the studio sheet and the map are fixed/fill-height surfaces.
      const file = path.join(dir, `${shot.slug}.png`);
      await page.screenshot({ path: file, animations: "disabled", caret: "hide" });
      await testInfo.attach("captures", {
        body: path.relative(process.cwd(), file),
        contentType: "text/plain",
      });
    });
  }
});

test.describe("@screens captures de toutes les routes", () => {
  for (const shot of SHOTS) {
    test(`@screens ${shot.slug}`, async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      captureConsoleErrors(page);
      await prepare(page, shot.persona, { diffusion: shot.diffusion });
      const dir = path.join(OUT_DIR, testInfo.project.name);
      await mkdir(dir, { recursive: true });

      await page.goto(shot.path);
      await waitForContent(page);
      if (shot.path.startsWith("/ecran/")) {
        const expected = shot.diffusion === "urgence" ? /Alerte météo/ : /prévention santé/;
        await expect(page.getByText(expected).first()).toBeVisible();
      }

      const files = await capture(page, dir, shot.slug);
      await testInfo.attach("captures", {
        body: files.map((f) => path.relative(process.cwd(), f)).join("\n"),
        contentType: "text/plain",
      });
      expect(files.length).toBeGreaterThan(0);
    });
  }
});
