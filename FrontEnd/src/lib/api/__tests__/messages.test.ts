import { describe, expect, it } from "vitest";

import {
  SESSION_EXPIRED_MESSAGE,
  statusFallbackMessage,
  translateFieldErrors,
  translateFieldMessage,
  translateMessage,
  UNREACHABLE_MESSAGE,
} from "@/lib/api/messages";

describe("translateMessage", () => {
  it.each([
    ["Email already registered", 400, "Un compte existe déjà avec cet e-mail."],
    ["Invalid email or password", 401, "E-mail ou mot de passe incorrect."],
    [
      "Only draft campaigns can be submitted",
      400,
      "Seules les campagnes en brouillon peuvent être soumises.",
    ],
    ["Access denied", 403, "Vous n'avez pas accès à cette action."],
  ])("translates the business message %s", (raw, status, expected) => {
    expect(translateMessage(raw, status)).toBe(expected);
  });

  it("translates every business message of contract §4 to French", () => {
    const business = [
      "Annonceur role not found",
      "User not found",
      "Client profile not found for current user",
      "Campaign is not eligible for AI analysis",
      "Campaign must be AI-analyzed before admin decision",
      "AI check required before admin decision",
      "Support already reserved for the selected period",
      "Current user not found",
      "An unexpected error occurred",
    ];
    for (const raw of business) {
      const fr = translateMessage(raw, 400);
      expect(fr).not.toBe(raw);
      expect(fr).not.toMatch(/\b(the|not found|campaign|must|error)\b/i);
    }
  });

  it("includes the French status label for « cannot be modified »", () => {
    expect(translateMessage("Campaign cannot be modified in status: PENDING_AI_CHECK", 400)).toBe(
      "Cette campagne ne peut plus être modifiée (statut : Analyse IA en cours).",
    );
  });

  it("maps not-found patterns with ids", () => {
    expect(translateMessage("Campaign not found: 12", 404)).toBe("Cette campagne est introuvable.");
    expect(translateMessage("Zone not found: 3", 404)).toBe("Cette zone est introuvable.");
    expect(translateMessage("Support not found: 5", 404)).toBe("Cet écran est introuvable.");
    expect(translateMessage("No AI report found for campaign: 9", 400)).toMatch(/Aucune analyse/);
  });

  it("maps the serialization and integrity errors", () => {
    expect(
      translateMessage('Invalid request body — use HH:mm:ss for times (e.g. "08:00:00")', 400),
    ).toMatch(/format des dates et des heures/);
    expect(translateMessage("Invalid data — check dates and times format", 400)).toMatch(
      /Données refusées/,
    );
  });

  it("falls back per status for unknown English or empty messages", () => {
    expect(translateMessage("Something weird happened", 500)).toBe(statusFallbackMessage(500));
    expect(translateMessage("", 502)).toBe(UNREACHABLE_MESSAGE);
    expect(translateMessage(undefined, 401)).toBe(SESSION_EXPIRED_MESSAGE);
    expect(translateMessage(null, 404)).toBe("Cet élément est introuvable.");
  });

  it("keeps messages that are already French (bridge responses)", () => {
    expect(translateMessage("Le service TPUB est momentanément indisponible.", 502)).toBe(
      "Le service TPUB est momentanément indisponible.",
    );
    expect(translateMessage("Session expirée", 401)).toBe(SESSION_EXPIRED_MESSAGE);
  });

  it("never promotes an HTML body", () => {
    expect(translateMessage("<html><body>Bad gateway</body></html>", 500)).toBe(
      statusFallbackMessage(500),
    );
  });
});

describe("field messages", () => {
  it.each([
    ["must not be blank", "Ce champ est requis."],
    ["must not be null", "Ce champ est requis."],
    ["must be a well-formed email address", "Adresse e-mail invalide."],
    ["size must be between 8 and 100", "Doit contenir entre 8 et 100 caractères."],
    ["must be greater than or equal to 0", "Doit être supérieur ou égal à 0."],
  ])("translates %s", (raw, expected) => {
    expect(translateFieldMessage(raw)).toBe(expected);
  });

  it("translates a Spring errors map and ignores junk", () => {
    expect(
      translateFieldErrors({
        email: "must not be blank",
        password: "size must be between 8 and 100",
        x: 3,
      }),
    ).toEqual({
      email: "Ce champ est requis.",
      password: "Doit contenir entre 8 et 100 caractères.",
      x: "Valeur invalide.",
    });
    expect(translateFieldErrors(null)).toEqual({});
    expect(translateFieldErrors(["a"])).toEqual({});
  });
});
