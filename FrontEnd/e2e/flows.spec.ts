import { expect, test } from "@playwright/test";

import { ADMIN, ANNONCEUR, isoDay } from "./fixtures/demo-data";
import { captureConsoleErrors, prepare, waitForContent } from "./fixtures/setup";

/** Smallest valid PNG (1×1, opaque) for the upload step. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

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

  test("assistant 4 étapes : détails → contenu → zone & Porteurs → soumission avec analyse IA", async ({
    page,
  }) => {
    const errors = captureConsoleErrors(page);
    const api = await prepare(page, "annonceur", { aiDelayMs: 1200 });
    await page.goto("/espace/campagnes/nouvelle");
    await waitForContent(page);

    // Step 1 — Détails (French date entry, time-slot preset)
    const fr = (iso: string) => iso.split("-").reverse().join("/");
    await page.getByLabel("Nom de la campagne").fill("Journées portes ouvertes — Clinique du Lac");
    await page
      .getByLabel("Objectif")
      .fill("Inviter les habitants des Berges du Lac à découvrir le nouveau service de pédiatrie.");
    await page.getByLabel("Budget déclaré").fill("2800");
    await page.getByLabel(/^Date de début/).fill(fr(isoDay(40)));
    await page.getByLabel(/^Date de fin/).fill(fr(isoDay(60)));
    await page.getByRole("radio", { name: "Journée complète (7 h – 23 h)" }).check();
    await page.getByRole("button", { name: "Continuer vers le contenu" }).click();

    await expect(page).toHaveURL(/[?&]id=7/);
    await expect(page).toHaveURL(/[?&]etape=2/);
    const created = api.state.campaigns.find((c) => c.id === 7);
    expect(created?.status).toBe("BROUILLON");
    expect(created?.startDate).toBe(isoDay(40));
    expect([created?.startTime, created?.endTime]).toEqual(["07:00:00", "23:00:00"]);

    // Step 2 — Contenu: real multipart upload
    await expect(
      page.getByRole("heading", { level: 2, name: "Contenu de la campagne" }),
    ).toBeVisible();
    await page.locator('input[type="file"]').first().setInputFiles({
      name: "portes-ouvertes-clinique.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    });
    await expect(
      page
        .getByRole("list", { name: "Médias de la campagne" })
        .getByText("portes-ouvertes-clinique.png")
        .first(),
    ).toBeVisible({ timeout: 15_000 });
    expect(api.calls).toContain("POST /api/campaigns/7/media");
    await page.getByRole("button", { name: "Continuer vers la zone" }).click();

    // Step 3 — Zone & Porteurs: target a recommended zone, save it, then book explicitly
    await expect(page).toHaveURL(/[?&]etape=3/);
    await page.getByRole("button", { name: "Cibler cette zone : Les Berges du Lac" }).click();
    await page.getByRole("button", { name: "Enregistrer les zones" }).click();
    const porteur = page.getByRole("checkbox", { name: "Sélectionner Écran Promenade du Lac 2" });
    await expect(porteur).toBeEnabled({ timeout: 15_000 });
    expect(api.state.campaigns.find((c) => c.id === 7)?.zones).toHaveLength(1);
    await porteur.check();
    expect(api.state.reservations.filter((r) => r.campaignId === 7)).toHaveLength(0);
    const bar = page.getByRole("region", { name: "Réservation des Porteurs" });
    await bar.getByRole("button", { name: "Réserver 1 Porteur" }).click();
    await expect(page.getByText("Réservé pour cette campagne").first()).toBeVisible();
    expect(
      api.state.reservations
        .filter((r) => r.campaignId === 7)
        .map((r) => [r.supportId, r.startDate, r.reservationStatus]),
    ).toEqual([[3, isoDay(40), "TEMPORAIRE"]]);
    await page.getByRole("button", { name: "Continuer vers la vérification" }).click();

    // Step 4 — Vérification & envoi: single submit call, the backend runs the AI analysis
    await expect(
      page.getByRole("heading", { level: 2, name: "Vérification & envoi" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/[?&]etape=4/);
    await page.getByLabel("J'ai relu ma campagne au regard de ces règles.").check();
    await page.getByRole("button", { name: "Soumettre", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    await expect(page.getByRole("heading", { name: "Analyse favorable" })).toBeVisible({
      timeout: 15_000,
    });
    expect(api.state.campaigns.find((c) => c.id === 7)?.status).toBe("APPROVED_BY_AI");
    expect(
      api.calls.filter((c) => /POST \/api\/(campaigns\/7\/submit|ai\/check-content\/7)/.test(c)),
    ).toEqual(["POST /api/campaigns/7/submit"]);
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
    // Inline decision in the dialog footer (no nested confirmation modal): optional comment and
    // priority, then confirm (contract §5 F3).
    await review.getByRole("button", { name: "Valider…", exact: true }).click();
    await review.getByRole("button", { name: "Confirmer la validation", exact: true }).click();
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
