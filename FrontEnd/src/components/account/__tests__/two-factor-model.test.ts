import { describe, expect, it } from "vitest";

import {
  codeError,
  codeForSubmit,
  formatRemaining,
  groupSecret,
  isRecoveryCode,
  isTotpCode,
  normalizeRecoveryCode,
  recoveryCodesFileName,
  recoveryCodesRemainingLabel,
  recoveryCodesText,
  sanitizeTotpInput,
  secondsUntilIso,
} from "@/components/account/two-factor-model";

describe("two-factor model", () => {
  it("accepts exactly 6 digits for a TOTP code", () => {
    expect(sanitizeTotpInput("12 34-56 78")).toBe("123456");
    expect(isTotpCode("123 456")).toBe(true);
    expect(isTotpCode("12345")).toBe(false);
    expect(isTotpCode("abcdef")).toBe(false);
  });

  it("normalises recovery codes (case, spaces, missing hyphen) with the Crockford alphabet", () => {
    expect(normalizeRecoveryCode(" ABCDE 12345 ")).toBe("abcde-12345");
    expect(normalizeRecoveryCode("abcde-12345")).toBe("abcde-12345");
    expect(isRecoveryCode("ABCDE12345")).toBe(true);
    // i, l, o, u are not in the alphabet.
    expect(isRecoveryCode("abcdi-12345")).toBe(false);
    expect(isRecoveryCode("abcd-12345")).toBe(false);
  });

  it("explains invalid codes in French and prepares the submitted value", () => {
    expect(codeError("", "totp")).toBe("Saisissez le code à 6 chiffres de votre application.");
    expect(codeError("", "recovery")).toBe("Saisissez un code de secours.");
    expect(codeError("123", "totp")).toBe("Le code comporte exactement 6 chiffres.");
    expect(codeError("xyz", "recovery")).toBe("Un code de secours a la forme xxxxx-xxxxx.");
    expect(codeError("123456", "totp")).toBeNull();
    expect(codeForSubmit("123 456", "totp")).toBe("123456");
    expect(codeForSubmit("ABCDE12345", "recovery")).toBe("abcde-12345");
  });

  it("groups the Base32 secret by 4 for manual entry", () => {
    expect(groupSecret("jbswy3dpehpk3pxp")).toBe("JBSW Y3DP EHPK 3PXP");
    expect(groupSecret("ABCDEF")).toBe("ABCD EF");
  });

  it("computes and formats the remaining challenge time", () => {
    const now = Date.parse("2026-09-17T10:00:00Z");
    expect(secondsUntilIso("2026-09-17T10:04:05Z", now)).toBe(245);
    expect(secondsUntilIso("2026-09-17T09:00:00Z", now)).toBe(0);
    expect(secondsUntilIso("pas une date", now)).toBeNull();
    expect(secondsUntilIso(null, now)).toBeNull();
    expect(formatRemaining(245)).toBe("4 min 05 s");
    expect(formatRemaining(42)).toBe("42 s");
    expect(formatRemaining(0)).toBe("expiré");
    expect(formatRemaining(null)).toBe("—");
  });

  it("builds the recovery codes download", () => {
    const at = new Date("2026-09-17T10:00:00Z");
    const text = recoveryCodesText(["abcde-12345", "fghjk-67890"], "admin@zelqane.local", at);
    expect(text).toContain("Compte : admin@zelqane.local");
    expect(text).toContain(" 1. abcde-12345\r\n 2. fghjk-67890");
    expect(recoveryCodesFileName(at)).toMatch(/^zelqane-codes-de-secours-2026091[78]\.txt$/);
    expect(recoveryCodesRemainingLabel(0)).toBe("Aucun code de secours restant");
    expect(recoveryCodesRemainingLabel(1)).toBe("1 code de secours restant");
    expect(recoveryCodesRemainingLabel(7)).toBe("7 codes de secours restants");
  });
});
