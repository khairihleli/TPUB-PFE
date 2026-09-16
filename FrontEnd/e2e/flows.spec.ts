import { expect, test } from "@playwright/test";

import { ADMIN, ANNONCEUR, isoDay } from "./fixtures/demo-data";
import { captureConsoleErrors, prepare, waitForContent } from "./fixtures/setup";

test.describe("parcours annonceur", () => {
  test("connexion → tableau de bord", async ({ page }) => {
    const errors = captureConsoleErrors(page);
    await prepare(page, "visiteur");
    await page.goto("/connexion?next=/espace");

    await page.getByLabel("E-mail").fill(ANNONCEUR.email);
    await page
      .getByRole("textbox", { name: "Mot de passe", exact: true })
      .fill("mauvais-mot-de-passe");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByText("E-mail ou mot de passe incorrect.")).toBeVisible();

    await page.getByRole("textbox", { name: "Mot de passe", exact: true }).fill(ANNONCEUR.password);
    await page.getByRole("button", { name: "Se connecter" }).click();

    await expect(page).toHaveURL(/\/espace$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Bonjour, Amira/);
    await waitForContent(page);
    await expect(page.getByText("Ouverture boutique La Marsa").first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("assistant : brouillon → réservation → soumission → résultat IA", async ({ page }) => {
    const errors = captureConsoleErrors(page);
    const api = await prepare(page, "annonceur", { aiDelayMs: 1200 });
    await page.goto("/espace/campagnes/nouvelle");
    await waitForContent(page);

    // Step 1 — Détails (French date entry, 24 h time selects)
    const fr = (iso: string) => iso.split("-").reverse().join("/");
    await page.getByLabel("Nom de la campagne").fill("Journées portes ouvertes — Clinique du Lac");
    await page
      .getByLabel("Objectif")
      .fill("Inviter les habitants des Berges du Lac à découvrir le nouveau service de pédiatrie.");
    await page.getByLabel("Budget déclaré").fill("2800");
    await page.getByLabel(/^Date de début/).fill(fr(isoDay(40)));
    await page.getByLabel(/^Date de fin/).fill(fr(isoDay(60)));
    await page.getByLabel(/^Heure de début/).selectOption("09:00");
    await page.getByLabel(/^Heure de fin/).selectOption("19:00");
    await page.getByRole("button", { name: "Continuer vers les Porteurs" }).click();

    await expect(page).toHaveURL(/[?&]id=7/);
    const created = api.state.campaigns.find((c) => c.id === 7);
    expect(created?.status).toBe("BROUILLON");
    expect(created?.startDate).toBe(isoDay(40));
    expect(created?.startTime).toBe("09:00:00");

    // Step 2 — Porteurs: availability first, booking only on the explicit « Réserver … » click
    await expect(page.getByRole("heading", { level: 2, name: "Porteurs" })).toBeVisible();
    const porteur = page.getByRole("checkbox", { name: /Écran Promenade du Lac 2/ });
    await expect(porteur).toBeEnabled({ timeout: 15_000 });
    // The card (label) is the click target; the checkbox itself is visually hidden.
    await porteur.locator("xpath=ancestor::label").click();
    await expect(porteur).toBeChecked();
    expect(api.state.reservations.filter((r) => r.campaignId === 7)).toHaveLength(0);
    const bar = page.getByRole("region", { name: "Réservation des Porteurs" });
    await bar.getByRole("button", { name: "Réserver 1 Porteur et continuer" }).click();

    // Step 3 — Vérification & envoi (single checkbox gate, no confirmation dialog)
    await expect(
      page.getByRole("heading", { level: 2, name: "Vérification & envoi" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/[?&]etape=3/);
    expect(
      api.state.reservations
        .filter((r) => r.campaignId === 7)
        .map((r) => [r.supportId, r.startDate]),
    ).toEqual([[3, isoDay(40)]]);
    await page.getByLabel("J'ai relu ma campagne au regard de ces règles.").check();
    await page.getByRole("button", { name: "Soumettre à la modération" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    await expect(page.getByRole("heading", { name: "Analyse favorable" })).toBeVisible({
      timeout: 15_000,
    });
    expect(api.state.campaigns.find((c) => c.id === 7)?.status).toBe("APPROVED_BY_AI");
    expect(
      api.calls.filter((c) => /POST \/api\/(campaigns\/7\/submit|ai\/check-content\/7)/.test(c)),
    ).toEqual(["POST /api/campaigns/7/submit", "POST /api/ai/check-content/7"]);
    expect(api.unhandled).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe("parcours back-office", () => {
  test("un administrateur valide une campagne approuvée par l'IA", async ({ page }) => {
    const errors = captureConsoleErrors(page);
    const api = await prepare(page, "admin");
    await page.goto("/admin/moderation");
    await waitForContent(page);
    await expect(page.getByText(ADMIN.nom).first()).toBeAttached();

    await page
      .getByRole("searchbox", { name: "Rechercher une campagne" })
      .or(page.getByRole("textbox", { name: "Rechercher une campagne" }))
      .fill("Ouverture boutique");
    await page
      .getByRole("button", { name: /^Examiner/ })
      .filter({ visible: true })
      .first()
      .click();

    const review = page.getByRole("dialog", { name: "Ouverture boutique La Marsa" });
    await expect(review).toBeVisible();
    await expect(review.getByText("Contenu conforme pour diffusion")).toBeVisible();
    // One-click decision in the dialog footer (no nested confirmation modal).
    await review.getByRole("button", { name: "Valider", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByText("« Ouverture boutique La Marsa » validée").first()).toBeVisible();

    const campaign = api.state.campaigns.find((c) => c.id === 3);
    expect(campaign?.status).toBe("ACTIVE");
    expect(campaign?.adminStatus).toBe("VALIDATED");
    expect(
      api.state.reservations.filter((r) => r.campaignId === 3).map((r) => r.reservationStatus),
    ).toEqual(["CONFIRMEE", "CONFIRMEE"]);
    expect(api.unhandled).toEqual([]);
    expect(errors).toEqual([]);
  });
});
