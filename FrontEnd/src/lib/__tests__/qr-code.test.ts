import { describe, expect, it } from "vitest";

import {
  addEccAndInterleave,
  alignmentPositions,
  blockLayout,
  byteCapacity,
  encodeDataCodewords,
  encodeQr,
  formatBits,
  maskBit,
  numDataCodewords,
  type QrErrorCorrection,
  QrTooLongError,
  qrSvgPath,
  reedSolomonDivisor,
  reedSolomonRemainder,
  versionBits,
} from "@/lib/qr-code";

/** Reads a matrix back (format bits, unmask, zigzag, de-interleave): an independent check. */
function decodeBytes(text: string, ecl: QrErrorCorrection = "M"): number[] {
  const qr = encodeQr(text, ecl);
  const { size, modules, version } = qr;
  // Format bits around the top-left finder must encode the chosen level and mask.
  let read = 0;
  const bitAt = (x: number, y: number) => (modules[y]?.[x] ? 1 : 0);
  for (let i = 0; i <= 5; i++) read |= bitAt(8, i) << i;
  read |= bitAt(8, 7) << 6;
  read |= bitAt(8, 8) << 7;
  read |= bitAt(7, 8) << 8;
  for (let i = 9; i < 15; i++) read |= bitAt(14 - i, 8) << i;
  expect(read).toBe(formatBits(ecl, qr.mask));

  // Rebuild the function-module map from a matrix of the same version (mask-independent).
  const reserved = encodeQr(text, ecl);
  const isFunction = (x: number, y: number): boolean => {
    if (x === 6 || y === 6) return true;
    if ((x < 9 && y < 9) || (x >= size - 8 && y < 9) || (x < 9 && y >= size - 8)) return true;
    if (version >= 7 && ((x >= size - 11 && y < 6) || (y >= size - 11 && x < 6))) return true;
    const align = alignmentPositions(version);
    const n = align.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        if (Math.abs(x - (align[i] ?? 0)) <= 2 && Math.abs(y - (align[j] ?? 0)) <= 2) return true;
      }
    }
    return false;
  };
  expect(reserved.size).toBe(size);

  const bits: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (isFunction(x, y)) continue;
        const dark = modules[y]?.[x] === true;
        bits.push((dark !== maskBit(qr.mask, x, y) ? 1 : 0));
      }
    }
  }
  const dataCodewords = numDataCodewords(version, ecl);
  const expected = addEccAndInterleave(
    encodeDataCodewords(Array.from(new TextEncoder().encode(text)), version, ecl),
    version,
    ecl,
  );
  const codewords: number[] = [];
  for (let i = 0; i + 8 <= bits.length && codewords.length < expected.length; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((acc, b) => (acc << 1) | b, 0));
  }
  expect(codewords).toEqual(expected);
  // De-interleave the data codewords: short blocks first, long blocks hold one more codeword.
  const { numBlocks, eccPerBlock } = blockLayout(version, ecl);
  const totalCodewords = codewords.length;
  const shortLen = Math.floor(totalCodewords / numBlocks) - eccPerBlock;
  const numShort = numBlocks - (totalCodewords % numBlocks);
  const blocks: number[][] = Array.from({ length: numBlocks }, () => []);
  let index = 0;
  for (let i = 0; i < shortLen + 1; i++) {
    for (let j = 0; j < numBlocks; j++) {
      if (i === shortLen && j < numShort) continue;
      blocks[j]?.push(codewords[index++] ?? -1);
    }
  }
  const data = blocks.flat();
  expect(data).toHaveLength(dataCodewords);
  // Each block's ECC must match its data (Reed-Solomon over the de-interleaved block).
  const eccStart = dataCodewords;
  expect(codewords.length - eccStart).toBe(numBlocks * eccPerBlock);
  const divisor = reedSolomonDivisor(eccPerBlock);
  blocks.forEach((block, j) => {
    const ecc = Array.from(
      { length: eccPerBlock },
      (_, i) => codewords[eccStart + i * numBlocks + j] ?? -1,
    );
    expect(ecc).toEqual(reedSolomonRemainder(block, divisor));
  });
  const stream = data.flatMap((b) => Array.from({ length: 8 }, (_, i) => (b >>> (7 - i)) & 1));
  const take = (start: number, len: number) =>
    stream.slice(start, start + len).reduce((acc, b) => (acc << 1) | b, 0);
  expect(take(0, 4)).toBe(0b0100);
  const countBits = version < 10 ? 8 : 16;
  const count = take(4, countBits);
  return Array.from({ length: count }, (_, i) => take(4 + countBits + i * 8, 8));
}

describe("qr-code", () => {
  it("computes Reed-Solomon codewords (ISO 18004 « HELLO WORLD » 1-M example)", () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(reedSolomonRemainder(data, reedSolomonDivisor(10))).toEqual([
      196, 35, 39, 119, 235, 215, 231, 226, 93, 23,
    ]);
  });

  it("encodes format and version information", () => {
    expect(formatBits("M", 0).toString(2).padStart(15, "0")).toBe("101010000010010");
    expect(formatBits("L", 0).toString(2).padStart(15, "0")).toBe("111011111000100");
    expect(formatBits("H", 0).toString(2).padStart(15, "0")).toBe("001011010001001");
    expect(versionBits(7).toString(2).padStart(18, "0")).toBe("000111110010010100");
  });

  it("matches the byte capacities of the standard", () => {
    expect([1, 2, 3, 4, 5, 10].map((v) => byteCapacity(v, "M"))).toEqual([14, 26, 42, 62, 84, 213]);
    expect(byteCapacity(1, "L")).toBe(17);
    expect(byteCapacity(40, "L")).toBe(2953);
    expect(byteCapacity(40, "H")).toBe(1273);
  });

  it("places alignment patterns like the standard", () => {
    expect(alignmentPositions(1)).toEqual([]);
    expect(alignmentPositions(2)).toEqual([6, 18]);
    expect(alignmentPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPositions(32)).toEqual([6, 34, 60, 86, 112, 138]);
    expect(alignmentPositions(40)).toEqual([6, 30, 58, 86, 114, 142, 170]);
  });

  it("encodes an otpauth URI that reads back byte for byte", () => {
    const uri =
      "otpauth://totp/TPUB:admin%40tpub.local?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=TPUB&algorithm=SHA1&digits=6&period=30";
    const qr = encodeQr(uri);
    expect(qr.size).toBe(qr.version * 4 + 17);
    expect(qr.version).toBeGreaterThanOrEqual(6);
    // Finder pattern corners are dark, separators light.
    expect(qr.modules[0]?.[0]).toBe(true);
    expect(qr.modules[7]?.[7]).toBe(false);
    expect(qr.modules[qr.size - 1]?.[0]).toBe(true);
    const decoded = decodeBytes(uri);
    expect(new TextDecoder().decode(new Uint8Array(decoded))).toBe(uri);
  });

  it("round-trips a short UTF-8 text in a small symbol", () => {
    const text = "Écran n° 12";
    expect(new TextDecoder().decode(new Uint8Array(decodeBytes(text)))).toBe(text);
    expect(encodeQr(text).version).toBe(1);
  });

  it("interleaves multi-block symbols without losing codewords", () => {
    const text = `http://localhost:3000/ecran/12?cle=tpd_${"A".repeat(43)}`;
    const qr = encodeQr(text);
    const total = addEccAndInterleave(
      encodeDataCodewords(Array.from(new TextEncoder().encode(text)), qr.version, "M"),
      qr.version,
      "M",
    );
    expect(total).toHaveLength(Math.floor(((qr.version * 16 + 128) * qr.version + 64 - ((25 * (Math.floor(qr.version / 7) + 2) - 10) * (Math.floor(qr.version / 7) + 2) - 55)) / 8));
    expect(total.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)).toBe(true);
  });

  it("is deterministic and draws one square per dark module", () => {
    const a = encodeQr("TPUB");
    const b = encodeQr("TPUB");
    expect(a).toEqual(b);
    const dark = a.modules.flat().filter(Boolean).length;
    expect(qrSvgPath(a).match(/h1v1h-1z/g)).toHaveLength(dark);
    expect(qrSvgPath(a, 2).startsWith("M2,2")).toBe(true);
  });

  it("refuses a text too long for version 40", () => {
    expect(() => encodeQr("x".repeat(3000), "L")).toThrow(QrTooLongError);
  });
});
