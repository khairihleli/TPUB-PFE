/** Shared e2e helpers: mocked API + session, route catalogue, console-error capture. */
import { expect, type Page, test } from "@playwright/test";

import { loginAs, mockApi, type MockApi, type MockApiOptions } from "./api";
import { ADMIN, ANNONCEUR } from "./demo-data";

export type Persona = "visiteur" | "annonceur" | "admin";

export function currentBaseURL(): string {
  const base = test.info().project.use.baseURL;
  if (!base) throw new Error("baseURL manquante dans playwright.config.ts");
  return base;
}

/**
 * External basemap tile hosts (NETWORK-MAP-SPEC §3). Blocked in every test so runs are
 * deterministic and offline: the map must still render its own zone/Porteur layers.
 */
export const TILE_HOSTS = /(^|\.)basemaps\.cartocdn\.com$|(^|\.)arcgisonline\.com$/;

export async function blockExternalTiles(page: Page): Promise<void> {
  await page.route(
    (u) => TILE_HOSTS.test(u.hostname),
    (route) => route.abort("blockedbyclient"),
  );
}

/** Installs the mocked backend and (optionally) a logged-in session. */
export async function prepare(
  page: Page,
  persona: Persona,
  options: Omit<MockApiOptions, "baseURL" | "user"> = {},
): Promise<MockApi> {
  const baseURL = currentBaseURL();
  const account = persona === "annonceur" ? ANNONCEUR : persona === "admin" ? ADMIN : null;
  const user = account ? await loginAs(page, account, baseURL) : null;
  await blockExternalTiles(page);
  // Keep onboarding / dismissed banners deterministic between runs.
  await page.addInitScript(() => {
    try {
      window.sessionStorage.clear();
      // Round 2: the /ecran player needs a device key (docs/round2-contract.md §1.1).
      for (let id = 1; id <= 50; id++) {
        window.localStorage.setItem(`tpub.ecran.cle.${id}`, `tpd_${"e2e".repeat(14)}x`);
      }
    } catch {
      /* storage unavailable */
    }
  });
  return mockApi(page, { ...options, baseURL, user });
}

export interface RouteEntry {
  path: string;
  persona: Persona;
  /** File-name slug for screenshots. */
  slug: string;
}

const PUBLIC_ROUTES = [
  "/",
  "/annonceurs",
  "/reseau",
  "/fonctionnement",
  "/tarifs",
  "/faq",
  "/a-propos",
  "/contact",
  "/mentions-legales",
  "/confidentialite",
  "/cgu",
  "/cookies",
  "/connexion",
  "/inscription",
  "/mot-de-passe-oublie",
];

const ESPACE_ROUTES = [
  "/espace",
  "/espace/campagnes",
  "/espace/campagnes/nouvelle",
  "/espace/campagnes/3",
  "/espace/campagnes/3/modifier",
  "/espace/reservations",
  "/espace/statistiques",
  "/espace/reseau",
  "/espace/profil",
];

const ADMIN_ROUTES = ["/admin", "/admin/moderation", "/admin/reseau", "/admin/urgences"];

export function slugOf(path: string): string {
  if (path === "/") return "accueil";
  return path.replace(/^\//, "").replace(/[/[\]]+/g, "-");
}

/** Every route of SPEC §3.2 with the persona that can open it (player uses supportId 1). */
export const ROUTES: readonly RouteEntry[] = [
  ...PUBLIC_ROUTES.map((path) => ({ path, persona: "visiteur" as const, slug: slugOf(path) })),
  ...ESPACE_ROUTES.map((path) => ({ path, persona: "annonceur" as const, slug: slugOf(path) })),
  ...ADMIN_ROUTES.map((path) => ({ path, persona: "admin" as const, slug: slugOf(path) })),
  { path: "/ecran/1", persona: "visiteur", slug: "ecran-1" },
];

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** Collects console errors and uncaught page errors (ignores intentional mocked 4xx responses). */
export function captureConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    const location = msg.location().url ?? "";
    if (/Failed to load resource/.test(text)) {
      // Browsers log every non-2xx fetch; mocked API errors (e.g. 400 « no AI report ») are expected.
      if (/\/api\//.test(location)) return;
      // Basemap tiles are blocked on purpose (blockExternalTiles).
      if (TILE_HOSTS.test(hostnameOf(location))) return;
      // Studio 3D probes /models/porteur-*.glb with HEAD; 404 → procedural Porteur (PORTEUR-3D.md).
      if (/\/models\/porteur[\w-]*\.glb/.test(location)) return;
    }
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

/** Waits until client data has loaded: no busy regions and network idle. */
export async function waitForContent(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(page.locator("h1").first()).toBeAttached();
  await expect
    .poll(async () => page.locator('[aria-busy="true"]').count(), { timeout: 15_000 })
    .toBe(0);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}
