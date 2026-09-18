/**
 * TOTP codes for the demo scripts (RFC 6238 over RFC 4226, HMAC-SHA1, 6 digits, 30 s), same
 * parameters as the backend (docs/round2-contract.md §3.3). Node built-ins only.
 */
import { createHmac } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 Base32 (case-insensitive, spaces and padding ignored) → bytes. */
export function base32Decode(input) {
  const clean = String(input).replace(/[\s=]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error(`Caractère Base32 invalide : « ${char} »`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** HOTP value (RFC 4226) of `counter` with `digits` digits. */
export function hotp(secretBytes, counter, digits = 6, algorithm = "sha1") {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac(algorithm, secretBytes).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/** Current TOTP code of a Base32 secret (`nowMs` for tests). */
export function totp(base32Secret, nowMs = Date.now(), step = 30, digits = 6) {
  return hotp(base32Decode(base32Secret), Math.floor(nowMs / 1000 / step), digits);
}
