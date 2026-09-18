// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** scripts/lib are plain Node ESM files (no TypeScript): their surface is typed here. */
interface TotpModule {
  base32Decode(input: string): Uint8Array;
  hotp(secret: Uint8Array, counter: number, digits?: number): string;
  totp(base32Secret: string, nowMs?: number): string;
}
interface DemoAuthModule {
  readKeyValueFile(path: string): Record<string, string>;
  adminCredentials(
    env: Record<string, string | undefined>,
    secretsFile: string,
  ): { email: string; password: string };
  generatePassword(length?: number): string;
  demoPassword(
    email: string,
    options: { create?: boolean; env?: Record<string, string | undefined>; file?: string },
  ): string | null;
}

const load = async <T>(relative: string): Promise<T> =>
  (await import(/* @vite-ignore */ new URL(relative, import.meta.url).href)) as T;

describe("demo scripts — TOTP (RFC 6238 SHA1 vectors)", () => {
  it("matches the RFC 6238 test vectors and decodes Base32", async () => {
    const { hotp, totp, base32Decode } = await load<TotpModule>("../../../scripts/lib/totp.mjs");
    const secret = new TextEncoder().encode("12345678901234567890");
    const vectors: [number, string][] = [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
      [20000000000, "65353130"],
    ];
    for (const [t, expected] of vectors) {
      expect(hotp(secret, Math.floor(t / 30), 8)).toBe(expected);
      expect(hotp(secret, Math.floor(t / 30), 6)).toBe(expected.slice(2));
    }
    // "12345678901234567890" in Base32.
    const b32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(Buffer.from(base32Decode(b32.toLowerCase())).toString()).toBe("12345678901234567890");
    expect(totp(b32, 59_000)).toBe("287082");
    expect(() => base32Decode("1")).toThrow(/Base32/);
  });
});

describe("demo scripts — credentials without password literals", () => {
  it("reads the administrator password from the environment or the secrets file", async () => {
    const auth = await load<DemoAuthModule>("../../../scripts/lib/demo-auth.mjs");
    const dir = mkdtempSync(join(tmpdir(), "zelqane-demo-"));
    const secrets = join(dir, ".zelqane-local.secrets");
    writeFileSync(
      secrets,
      "# commentaire\nJWT_SECRET=abc\nZELQANE_ADMIN_INITIAL_PASSWORD=Fichier2026x\n",
    );
    expect(auth.readKeyValueFile(secrets).JWT_SECRET).toBe("abc");
    expect(auth.adminCredentials({}, secrets)).toEqual({
      email: "admin@zelqane.local",
      password: "Fichier2026x",
    });
    expect(
      auth.adminCredentials(
        { ZELQANE_ADMIN_PASSWORD: "Env2026x", ZELQANE_ADMIN_EMAIL: "a@b.tn" },
        secrets,
      ),
    ).toEqual({ email: "a@b.tn", password: "Env2026x" });
    expect(() => auth.adminCredentials({}, join(dir, "absent"))).toThrow(/ZELQANE_ADMIN_PASSWORD/);
  });

  it("generates demo passwords once and reuses them", async () => {
    const auth = await load<DemoAuthModule>("../../../scripts/lib/demo-auth.mjs");
    const file = join(mkdtempSync(join(tmpdir(), "zelqane-demo-")), ".demo-accounts.json");
    const generated = auth.generatePassword();
    expect(generated).toMatch(/^[A-HJ-NP-Za-km-z2-9]{16}$/);
    expect(generated).toMatch(/\d/);
    expect(auth.demoPassword("x@zelqane.local", { create: false, env: {}, file })).toBeNull();
    const first = auth.demoPassword("x@zelqane.local", { env: {}, file });
    expect(auth.demoPassword("x@zelqane.local", { env: {}, file })).toBe(first);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ "x@zelqane.local": first });
    expect(
      auth.demoPassword("x@zelqane.local", { env: { ZELQANE_DEMO_PASSWORD: "Commun2026" }, file }),
    ).toBe("Commun2026");
  });
});
