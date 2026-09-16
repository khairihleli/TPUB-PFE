import { describe, expect, it } from "vitest";

import {
  EMAIL_MESSAGE,
  isHoneypotFilled,
  parseContactPrefill,
  REQUIRED_MESSAGE,
  validateContact,
} from "@/components/contact/contact-schema";

const valid = {
  nom: "  Leïla Ben Youssef ",
  email: "leila@exemple.tn",
  telephone: "+216 20 000 000",
  societe: "Agence Exemple",
  profil: "agence",
  besoin: "plan-media",
  zones: "Tunis Centre, Lac",
  periode: "Rentrée",
  message: "Nous préparons un plan média pour la rentrée sur deux zones.",
  consentement: true,
};

describe("validateContact", () => {
  it("accepts a complete request and trims text", () => {
    const r = validateContact(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.nom).toBe("Leïla Ben Youssef");
      expect(r.data.profil).toBe("agence");
    }
  });

  it("accepts empty optional fields", () => {
    const r = validateContact({ ...valid, telephone: "", societe: "", zones: "", periode: "" });
    expect(r.ok).toBe(true);
  });

  it("returns the brief's French messages for missing required fields", () => {
    const r = validateContact({
      nom: " ",
      email: "",
      telephone: "",
      societe: "",
      profil: "",
      besoin: "",
      zones: "",
      periode: "",
      message: "",
      consentement: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.nom).toBe(REQUIRED_MESSAGE);
      expect(r.errors.email).toBe(REQUIRED_MESSAGE);
      expect(r.errors.profil).toBe(REQUIRED_MESSAGE);
      expect(r.errors.besoin).toBe(REQUIRED_MESSAGE);
      expect(r.errors.message).toBe(REQUIRED_MESSAGE);
      expect(r.errors.consentement).toMatch(/accord/);
      expect(r.errors.telephone).toBeUndefined();
    }
  });

  it("rejects a malformed e-mail", () => {
    const r = validateContact({ ...valid, email: "pas-une-adresse" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.email).toBe(EMAIL_MESSAGE);
  });

  it("rejects unknown enum values, invalid phones, short and oversized messages", () => {
    const r = validateContact({
      ...valid,
      profil: "pirate",
      telephone: "appelez-moi",
      message: "court",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.profil).toBe(REQUIRED_MESSAGE);
      expect(r.errors.telephone).toBe("Numéro de téléphone invalide.");
      expect(r.errors.message).toMatch(/10 caractères minimum/);
    }
    const long = validateContact({ ...valid, message: "a".repeat(4001) });
    expect(long.ok).toBe(false);
  });

  it("rejects non-object payloads and consent sent as a string", () => {
    expect(validateContact(null).ok).toBe(false);
    expect(validateContact("x").ok).toBe(false);
    const r = validateContact({ ...valid, consentement: "true" });
    expect(r.ok).toBe(false);
  });
});

describe("isHoneypotFilled", () => {
  it("detects a filled honeypot only", () => {
    expect(isHoneypotFilled({ site_web: "https://spam.example" })).toBe(true);
    expect(isHoneypotFilled({ site_web: "   " })).toBe(false);
    expect(isHoneypotFilled({ site_web: "" })).toBe(false);
    expect(isHoneypotFilled({})).toBe(false);
    expect(isHoneypotFilled(null)).toBe(false);
  });
});

describe("parseContactPrefill", () => {
  it("maps known slugs and aliases", () => {
    expect(parseContactPrefill({ profil: "agence", besoin: "plan-media" })).toEqual({
      profil: "agence",
      besoin: "plan-media",
    });
    expect(parseContactPrefill({ profil: "Propriétaire", besoin: "Intérêt général" })).toEqual({
      profil: "proprietaire",
      besoin: "interet-general",
    });
    expect(parseContactPrefill({ profil: ["institution", "marque"] }).profil).toBe("institution");
  });

  it("ignores unknown or missing values", () => {
    expect(parseContactPrefill({ profil: "<script>", besoin: undefined })).toEqual({
      profil: "",
      besoin: "",
    });
    expect(parseContactPrefill({})).toEqual({ profil: "", besoin: "" });
  });
});
