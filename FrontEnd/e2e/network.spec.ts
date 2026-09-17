import { expect, type Locator, type Page, test } from "@playwright/test";

import { isoDay } from "./fixtures/demo-data";
import { captureConsoleErrors, prepare, waitForContent } from "./fixtures/setup";

/**
 * NETWORK-MAP-SPEC §9 — explorer (map or SVG fallback, list ↔ map, Studio 3D, day-part, quick
 * draft + reservation), wizard « Carte » tab, admin « Placer un Porteur ». Basemap tiles are
 * blocked (fixtures/setup.ts): the map must still draw its own zones and Porteurs.
 */

/**
 * Map region is mounted with an engine and its Porteur markers. Porteurs are never grouped by
 * default: no count bubble, one marker per Porteur at its exact position.
 */
async function waitForMap(page: Page, name: string): Promise<Locator> {
  const map = page.getByRole("region", { name, exact: true });
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute("data-map-engine", /^(webgl|svg)$/);
  await expect(map.locator("button[data-support-id]").first()).toBeVisible({ timeout: 30_000 });
  await expect(map.locator('button[aria-label^="Groupe de "]')).toHaveCount(0);
  return map;
}

/** Centre of an element's bounding box (px, page coordinates). */
async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("élément sans boîte englobante");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Studio 3D finished loading (WebGL procedural Porteur or static fallback). */
async function waitForStudio(scope: Locator): Promise<void> {
  await expect(scope.getByText("Chargement du Porteur…")).toHaveCount(0, { timeout: 45_000 });
}

test.describe("réseau — explorateur /espace/reseau", () => {
  test("rend la carte (WebGL ou simplifiée) avec zones, Porteurs et liste accessible", async ({
    page,
  }, testInfo) => {
    const errors = captureConsoleErrors(page);
    const api = await prepare(page, "annonceur");
    await page.goto("/espace/reseau");
    await waitForContent(page);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Réseau/);
    const map = await waitForMap(page, "Carte du réseau TPUB");
    // Every Porteur (A–D, maintenance / hors ligne / inactif included) has its own marker.
    await expect(map.getByText("8 Porteurs affichés sur 8")).toBeVisible();
    await expect(map.locator("button[data-support-id]")).toHaveCount(8);
    await expect(map.getByText(/masqués? par les filtres/)).toHaveCount(0);

    if (testInfo.project.name === "mobile") {
      await page.getByRole("button", { name: /^Porteurs\s*8$/ }).click();
      const sheet = page.getByRole("dialog", { name: "Réseau" });
      await expect(
        sheet.getByRole("list", { name: "Porteurs du réseau" }).locator("li"),
      ).toHaveCount(8);
    } else {
      const panel = page.getByRole("complementary", { name: "Panneau du réseau" });
      await expect(
        panel.getByRole("list", { name: "Porteurs du réseau" }).locator("li"),
      ).toHaveCount(8);
      // Inferred type is flagged (support 5 has no declared porteurType).
      await expect(panel.getByText(/typologie estimée/).first()).toBeVisible();
      // Advertiser rows carry « zone · adresse »; raw coordinates are staff-only (VD-18).
      await expect(panel.getByText(/36[.,]7999/)).toHaveCount(0);
    }

    // First render only needs the catalogue: availability loads on demand, and the only campaign
    // call is the shell's « À finaliser » badge (one shared, cached GET /campaigns/mine).
    expect(api.calls.filter((c) => c.includes("/availability"))).toEqual([]);
    const campaignCalls = api.calls.filter((c) => c.startsWith("GET /api/campaigns"));
    expect(campaignCalls.length).toBeLessThanOrEqual(1);
    expect(campaignCalls.every((c) => c === "GET /api/campaigns/mine")).toBe(true);
    expect(api.unhandled).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("mobile : feuille « Porteurs » → Studio 3D plein écran", async ({ page, isMobile }) => {
    test.skip(!isMobile, "variante mobile");
    const errors = captureConsoleErrors(page);
    const api = await prepare(page, "annonceur");
    await page.goto("/espace/reseau");
    await waitForContent(page);
    await waitForMap(page, "Carte du réseau TPUB");

    await page.getByRole("button", { name: /^Porteurs\s*8$/ }).click();
    const sheet = page.getByRole("dialog", { name: "Réseau" });
    await sheet.getByRole("button", { name: "Ouvrir Écran Promenade du Lac 2" }).click();
    await expect(sheet).toHaveCount(0);

    const studio = page.getByRole("dialog", { name: "Écran Promenade du Lac 2" });
    await expect(studio).toBeVisible();
    await waitForStudio(studio);
    const box = await studio.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual((page.viewportSize()?.width ?? 390) - 1);
    await expect(studio.getByRole("button", { name: "Réserver ce Porteur" })).toBeAttached();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    expect(api.unhandled).toEqual([]);
    expect(errors).toEqual([]);
  });

  test.describe("bureau", () => {
    test.skip(({ isMobile }) => isMobile, "parcours détaillé couvert sur bureau");

    test("liste ↔ carte : localiser, survol, filtres partagés, zones", async ({ page }) => {
      const errors = captureConsoleErrors(page);
      const api = await prepare(page, "annonceur");
      await page.goto("/espace/reseau");
      await waitForContent(page);
      const map = await waitForMap(page, "Carte du réseau TPUB");
      const panel = page.getByRole("complementary", { name: "Panneau du réseau" });

      // « Localiser » flies to the Porteur: its own marker becomes visible (no cluster).
      await panel
        .getByRole("button", { name: "Localiser Écran Promenade du Lac 2 sur la carte" })
        .click();
      const marker = map.getByRole("button", {
        name: /^Porteur Type B — Écran Promenade du Lac 2/,
      });
      await expect(marker).toBeVisible({ timeout: 15_000 });

      // Hovering the list row highlights the marker (ring + scale).
      await panel.getByRole("button", { name: "Ouvrir Écran Promenade du Lac 2" }).hover();
      await expect(marker).toHaveClass(/scale-110/);

      // Type filter in the panel drives the map counter (same state) and says what is hidden.
      await panel.getByRole("button", { name: "Type B · Double face", exact: false }).click();
      await expect(map.getByText("2 Porteurs affichés sur 8")).toBeVisible();
      await expect(map.getByText("6 masqués par les filtres")).toBeVisible();
      await expect(
        panel.getByRole("list", { name: "Porteurs du réseau" }).locator("li"),
      ).toHaveCount(2);
      await map.getByRole("button", { name: "Tout afficher" }).click();
      // Exact: the sr-only status also announces « 8 Porteurs affichés sur 8 : filtres réinitialisés. »
      await expect(map.getByText("8 Porteurs affichés sur 8", { exact: true })).toBeVisible();
      await expect(
        map.getByRole("status").filter({ hasText: "filtres réinitialisés" }),
      ).toHaveCount(1);
      await expect(
        panel.getByRole("list", { name: "Porteurs du réseau" }).locator("li"),
      ).toHaveCount(8);

      // Zones tab: select a zone's bookable Porteurs → selection tab + footer.
      await panel.getByRole("tab", { name: /Zones/ }).click();
      await panel
        .getByRole("button", { name: "Sélectionner les Porteurs réservables de Tunis Centre" })
        .click();
      await panel.getByRole("button", { name: "Tunis Centre", exact: false }).first().click();
      await expect(page).toHaveURL(/[?&]zone=1/);
      await panel.getByRole("tab", { name: /Sélection/ }).click();
      await expect(
        panel.getByRole("region", { name: "Zone Tunis Centre" }).locator("li"),
      ).toHaveCount(2);
      await expect(panel.getByRole("button", { name: "Réserver la sélection" })).toBeEnabled();

      expect(api.unhandled).toEqual([]);
      expect(errors).toEqual([]);
    });

    test("chaque Porteur à sa position exacte : points compacts, éventail, cadrage, coordonnées", async ({
      page,
      context,
    }) => {
      test.setTimeout(90_000);
      const errors = captureConsoleErrors(page);
      const api = await prepare(page, "annonceur");
      await page.goto("/espace/reseau");
      await waitForContent(page);
      const map = await waitForMap(page, "Carte du réseau TPUB");
      const markers = map.locator("button[data-support-id]");
      await expect(markers).toHaveCount(8);

      if ((await map.getAttribute("data-map-engine")) === "webgl") {
        // Framed on the Porteurs (Tunis → Sfax), not all of Tunisia: country-scale compact dots.
        await expect(map.locator('button[data-marker-variant="compact"]')).toHaveCount(8);

        // Porteurs piled up in Grand Tunis are fanned out; each keeps a leader to its exact point.
        const fanned = map.locator("[data-spider-group]");
        await expect.poll(() => fanned.count()).toBeGreaterThan(1);
        await expect(map.locator("[data-spider-leg]")).toHaveCount(await fanned.count());
        // Anchor check: leader dot (exact point) + line vector = marker centre (no CSS drift).
        const legs = map.locator("[data-spider-leg]");
        for (let i = 0; i < (await legs.count()); i++) {
          const leg = legs.nth(i);
          const line = leg.locator("line");
          const dx = Number(await line.getAttribute("x2"));
          const dy = Number(await line.getAttribute("y2"));
          const exact = await centerOf(leg);
          const target = { x: exact.x + dx, y: exact.y + dy };
          const centres = await Promise.all(
            (await fanned.all()).map((f) => centerOf(f.locator("button[data-support-id]"))),
          );
          const nearest = Math.min(
            ...centres.map((c) => Math.hypot(c.x - target.x, c.y - target.y)),
          );
          expect(nearest).toBeLessThan(2);
        }

        // Hover/focus on a compact dot shows the mini card with the exact coordinates.
        await map.getByRole("button", { name: /— Écran Promenade du Lac 2 —/ }).focus();
        const card = map.getByRole("group", { name: "Aperçu : Écran Promenade du Lac 2" });
        await expect(card).toBeVisible();
        await expect(card.getByText("36,8455° N", { exact: true })).toBeVisible();
        const osm = card.getByRole("link", { name: /Ouvrir dans OpenStreetMap/ });
        await expect(osm).toHaveAttribute("href", /mlat=36\.8455&mlon=10\.2721#map=18\//);
        await expect(osm).toHaveAttribute("target", "_blank");
        await context
          .grantPermissions(["clipboard-read", "clipboard-write"])
          .catch(() => undefined);
        await card.getByRole("button", { name: /Copier les coordonnées/ }).click();
        await expect(card.getByText(/Coordonnées copiées|Copie impossible/)).toBeVisible();
        await page.keyboard.press("Escape");

        // « Recentrer » : toute la Tunisie, then back to every Porteur (all still displayed).
        await map
          .getByRole("toolbar")
          .getByRole("button", { name: "Recentrer : toute la Tunisie" })
          .click();
        await map
          .getByRole("toolbar")
          .getByRole("button", { name: "Recentrer : tous les Porteurs" })
          .click();
        await expect(markers).toHaveCount(8);

        // From zoom 9 the full lettered marker is used; « Localiser » zooms in: no fan left there.
        const panel = page.getByRole("complementary", { name: "Panneau du réseau" });
        await panel
          .getByRole("button", { name: "Localiser Écran Promenade du Lac 2 sur la carte" })
          .click();
        const lac = map.locator('button[data-support-id="3"]');
        await expect(lac).toHaveAttribute("data-marker-variant", "full", { timeout: 15_000 });
        await expect(lac.locator("xpath=ancestor::*[@data-spider-group]")).toHaveCount(0, {
          timeout: 15_000,
        });
      } else {
        // SVG fallback: exact projected points, Grand Tunis inset when Porteurs pile up.
        await expect(map.getByRole("region", { name: /^Vue rapprochée/ })).toBeVisible();
      }

      // Opt-in grouping from « Couches », kept in the URL (?regrouper=1).
      await map.getByRole("toolbar").getByRole("button", { name: "Couches" }).click();
      await map.getByRole("checkbox", { name: /Regrouper les Porteurs proches/ }).check();
      await expect(page).toHaveURL(/[?&]regrouper=1/);
      await map.getByRole("checkbox", { name: /Regrouper les Porteurs proches/ }).uncheck();
      await expect(page).not.toHaveURL(/[?&]regrouper=/);
      await expect(markers).toHaveCount(8);

      expect(api.unhandled).toEqual([]);
      expect(errors).toEqual([]);
    });

    test("studio : jour/nuit, créneau indisponible, tranche horaire, brouillon rapide et réservation", async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const errors = captureConsoleErrors(page);
      const api = await prepare(page, "annonceur");
      await page.goto("/espace/reseau");
      await waitForContent(page);
      await waitForMap(page, "Carte du réseau TPUB");

      const panel = page.getByRole("complementary", { name: "Panneau du réseau" });
      await panel.getByRole("button", { name: "Ouvrir Écran Promenade du Lac 2" }).click();
      await expect(page).toHaveURL(/[?&]porteur=3/);
      const studio = page.getByRole("dialog", { name: "Écran Promenade du Lac 2" });
      await expect(studio).toBeVisible();
      await expect(studio).toHaveAttribute("data-studio-sheet", "");
      await waitForStudio(studio);
      await expect(studio.getByText("Type B · Double face").first()).toBeVisible();
      // Identité: exact latitude / longitude with copy + OpenStreetMap actions.
      await expect(studio.getByText("36,8455° N", { exact: true })).toBeVisible();
      await expect(studio.getByText("10,2721° E", { exact: true })).toBeVisible();
      await expect(
        studio.getByRole("link", { name: /Ouvrir dans OpenStreetMap.*\(nouvel onglet\)/ }),
      ).toHaveAttribute("rel", /noopener/);

      // Aperçu: night ambiance + B faces.
      await studio.getByRole("button", { name: "Nuit", exact: true }).click();
      await expect(studio.getByRole("button", { name: "Nuit", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await studio.getByRole("button", { name: "Face 1", exact: true }).click();

      // Availability strip comes from GET /supports/3/availability.
      await expect(
        studio.getByRole("group", { name: "Calendrier des disponibilités du Porteur" }),
      ).toBeVisible();
      expect(api.calls.some((c) => c.startsWith("GET /api/supports/3/availability?"))).toBe(true);

      // With no campaign, the default slot is the Porteur's first free week: a neutral start,
      // no alert before any user action (FFA-08).
      await expect(studio.locator('[data-conflict="alert"]')).toHaveCount(0);
      const fr = (iso: string) => iso.split("-").reverse().join("/");
      const start = studio.getByLabel(/^Début/);
      const end = studio.getByLabel(/^Fin/);

      // A range across the TEMPORAIRE reservation (campaign 2, J+10 → J+24) is refused inline.
      await start.fill(fr(isoDay(3)));
      await end.fill(fr(isoDay(14)));
      await expect(studio.getByText(/Ce Porteur est déjà réservé (du|le) /)).toBeVisible();

      // Free period (start first: a start after the end moves the end with it) + « Soirée ».
      await start.fill(fr(isoDay(40)));
      await end.fill(fr(isoDay(46)));
      await expect(studio.getByText(/Ce Porteur est déjà réservé (du|le) /)).toHaveCount(0);
      await expect(studio.locator("[data-conflict]")).toHaveCount(0);
      const evening = studio.getByRole("group", { name: "Plages horaires" }).getByRole("button", {
        name: /Soirée/,
      });
      await evening.click();
      await expect(evening).toHaveAttribute("aria-pressed", "true");
      await expect(studio.getByText("de 19:00 à 23:00 · 4 h")).toBeVisible();

      // Quick draft (campaign dates/times = créneau).
      await studio.getByRole("button", { name: "Créer un brouillon rapide" }).click();
      const form = studio.getByRole("form", { name: "Créer un brouillon rapide" });
      await form.getByLabel("Nom de la campagne").fill("Nocturnes du Lac — Galerie Yasmine");
      await form
        .getByLabel("Objectif")
        .fill("Annoncer les ouvertures en soirée de la galerie aux promeneurs des Berges du Lac.");
      await form.getByLabel("Budget déclaré").fill("1500");
      await form.getByRole("button", { name: "Créer le brouillon" }).click();
      await expect(form).toHaveCount(0);

      const draft = api.state.campaigns.find(
        (c) => c.name === "Nocturnes du Lac — Galerie Yasmine",
      );
      expect(draft?.status).toBe("BROUILLON");
      expect(draft?.startDate).toBe(isoDay(40));
      expect(draft?.endDate).toBe(isoDay(46));
      expect(draft?.startTime?.slice(0, 5)).toBe("19:00");

      await studio.getByRole("button", { name: "Réserver ce Porteur" }).click();
      await expect(
        studio.getByText(`Porteur réservé pour « Nocturnes du Lac — Galerie Yasmine »`),
      ).toBeVisible();
      const reservation = api.state.reservations.find((r) => r.campaignId === draft?.id);
      expect(reservation).toMatchObject({
        supportId: 3,
        zoneId: 2,
        startDate: isoDay(40),
        endDate: isoDay(46),
        startTime: "19:00:00",
        endTime: "23:00:00",
        reservationStatus: "TEMPORAIRE",
      });
      await expect(
        studio.getByRole("link", { name: /Continuer dans l'assistant/ }),
      ).toHaveAttribute("href", `/espace/campagnes/nouvelle?id=${draft?.id}&etape=4`);

      // Closing the studio clears ?porteur=.
      await studio.getByRole("button", { name: "Fermer le studio" }).click();
      await expect(page).not.toHaveURL(/[?&]porteur=/);

      expect(api.unhandled).toEqual([]);
      expect(errors).toEqual([]);
    });

    test("?porteur= inconnu → « Porteur introuvable »", async ({ page }) => {
      const api = await prepare(page, "annonceur");
      await page.goto("/espace/reseau?porteur=999");
      await expect(page.getByText("Porteur introuvable")).toBeVisible({ timeout: 20_000 });
      expect(api.unhandled).toEqual([]);
    });

    test("assistant étape 3 : zone recommandée → carte de ciblage → marqueur → réservation explicite", async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const errors = captureConsoleErrors(page);
      const api = await prepare(page, "annonceur");
      // Draft campaign 1 moved to a period where « Promenade du Lac 2 » is free.
      const draft = api.state.campaigns.find((c) => c.id === 1);
      if (!draft) throw new Error("campagne 1 manquante");
      Object.assign(draft, { startDate: isoDay(40), endDate: isoDay(50) });

      await page.goto("/espace/campagnes/nouvelle?id=1&etape=3");
      await waitForContent(page);
      const map = await waitForMap(
        page,
        "Carte de ciblage : cliquez pour placer ou déplacer la zone",
      );

      // The recommended zone becomes a circle wide enough to hold the zone's Porteurs.
      await page.getByRole("button", { name: "Cibler cette zone : Les Berges du Lac" }).click();
      await page.getByRole("button", { name: "Enregistrer les zones" }).click();
      const checkbox = page.getByRole("checkbox", {
        name: "Sélectionner Écran Promenade du Lac 2",
      });
      await expect(checkbox).toBeVisible({ timeout: 15_000 });
      expect(api.calls.some((c) => c.startsWith("PUT /api/campaigns/1/zones"))).toBe(true);
      expect(api.calls.some((c) => c.startsWith("GET /api/availability?"))).toBe(true);

      // Clicking the Porteur marker selects it; selecting books nothing.
      await map.getByRole("button", { name: /^Porteur Type B — Écran Promenade du Lac 2/ }).click();
      await expect(checkbox).toBeChecked();
      expect(api.state.reservations.filter((r) => r.campaignId === 1)).toEqual([]);

      await page
        .getByRole("region", { name: "Réservation des Porteurs" })
        .getByRole("button", { name: "Réserver 1 Porteur" })
        .click();
      await expect(page.getByText("Réservé pour cette campagne").first()).toBeVisible();
      expect(
        api.state.reservations.filter((r) => r.campaignId === 1).map((r) => r.supportId),
      ).toEqual([3]);
      expect(api.unhandled).toEqual([]);
      expect(errors).toEqual([]);
    });

    test("back-office : « Placer un Porteur » ouvre le formulaire prérempli", async ({ page }) => {
      const errors = captureConsoleErrors(page);
      const api = await prepare(page, "admin");
      await page.goto("/admin/reseau");
      await waitForContent(page);
      const map = await waitForMap(page, "Carte du réseau TPUB (administration)");

      await map.getByRole("toolbar").getByRole("button", { name: "Placer un Porteur" }).click();
      await expect(
        // exact: the polite status region repeats the hint with « Échap pour annuler. »
        map.getByText("Cliquez sur la carte pour placer le nouveau Porteur.", { exact: true }),
      ).toBeVisible();
      if ((await map.getAttribute("data-map-engine")) === "webgl") {
        await map.getByRole("button", { name: "Utiliser le centre de la vue" }).click();
      } else {
        await map.locator("[data-map-frame]").click({ position: { x: 200, y: 160 } });
      }

      const form = page.getByRole("dialog", { name: "Nouveau Porteur" });
      await expect(form).toBeVisible();
      await expect(form.getByLabel("Latitude")).not.toHaveValue("");
      await expect(form.getByLabel("Longitude")).not.toHaveValue("");

      // Coherence panel lists the network findings (e.g. Porteurs without declared type).
      await form.getByRole("button", { name: "Annuler" }).click();
      await page.getByRole("tab", { name: /Cohérence/ }).click();
      const undeclared = page.getByRole("region", { name: /^Type ou orientation non déclarés/ });
      await expect(undeclared.getByText("Porteur Écran Corniche de La Marsa")).toBeVisible();
      await expect(
        undeclared.getByRole("button", { name: "Corriger Écran Corniche de La Marsa" }),
      ).toBeVisible();

      expect(api.unhandled).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
});
