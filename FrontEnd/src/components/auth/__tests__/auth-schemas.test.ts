import { describe, expect, it } from "vitest";

import {
  firstIssues,
  loginSchema,
  passwordStrength,
  registerSchema,
  type RegisterValues,
} from "@/components/auth/auth-schemas";

const FIELDS = [
  "nom",
  "societe",
  "email",
  "telephone",
  "adresse",
  "password",
  "consentement",
] as const;

describe("registerSchema", () => {
  const valid = {
    nom: "Sami Ben Salah",
    societe: "Café Démo SARL",
    email: "demo@annonceur.tn",
    telephone: "+216 20 000 000",
    adresse: "",
    password: "Demo@1234",
    consentement: true,
  };

  it("accepts the backend demo payload", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it("enforces the brief's required fields and the 8-character rule", () => {
    const r = registerSchema.safeParse({
      ...valid,
      nom: "",
      societe: " ",
      telephone: "",
      password: "court",
      consentement: false,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const errs = firstIssues<RegisterValues>(r.error, FIELDS);
      expect(errs.nom).toBe("Ce champ est requis.");
      expect(errs.societe).toBe("Ce champ est requis.");
      expect(errs.telephone).toBe("Ce champ est requis.");
      expect(errs.password).toBe("8 caractères minimum.");
      expect(errs.consentement).toMatch(/CGU/);
      expect(errs.adresse).toBeUndefined();
    }
  });
});

describe("loginSchema", () => {
  it("requires a well-formed e-mail and a password", () => {
    const r = loginSchema.safeParse({ email: "x@", password: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const errs = firstIssues(r.error, ["email", "password"]);
      expect(errs.email).toBe("Adresse e-mail invalide.");
      expect(errs.password).toBe("Ce champ est requis.");
    }
  });
});

describe("passwordStrength", () => {
  it("grades passwords from too short to solid", () => {
    expect(passwordStrength("").level).toBe(0);
    expect(passwordStrength("abc").label).toBe("Trop court");
    expect(passwordStrength("abc").hint).toBe("Encore 5 caractères au minimum.");
    expect(passwordStrength("password").label).toBe("Faible");
    expect(passwordStrength("aaaaaaaaaa").label).toBe("Faible");
    expect(passwordStrength("abcdefgh").level).toBe(1);
    expect(passwordStrength("abcdefg1").level).toBe(2);
    expect(passwordStrength("Abcdefg1").level).toBe(3);
    expect(passwordStrength("Demo@1234").level).toBe(4);
  });
});
