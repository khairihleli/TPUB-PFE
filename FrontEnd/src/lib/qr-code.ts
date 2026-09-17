/**
 * Dependency-free QR Code encoder (ISO/IEC 18004), byte mode, used for the 2FA enrolment URI and
 * the player pairing link (docs/round2-contract.md §3.7). Pure and deterministic: text → module
 * matrix, then `qrSvgPath` draws it. The structure follows the reference algorithm (Reed-Solomon
 * over GF(256) with the 0x11D polynomial, BCH-coded format/version bits, penalty-based mask choice).
 */

export type QrErrorCorrection = "L" | "M" | "Q" | "H";

/** 2-bit format indicator of each level (not in alphabetical order). */
const ECC_FORMAT_BITS: Record<QrErrorCorrection, number> = { L: 1, M: 0, Q: 3, H: 2 };
const ECC_INDEX: Record<QrErrorCorrection, number> = { L: 0, M: 1, Q: 2, H: 3 };

// Index [level][version]; version 0 unused.
const ECC_CODEWORDS_PER_BLOCK: readonly (readonly number[])[] = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

const NUM_ERROR_CORRECTION_BLOCKS: readonly (readonly number[])[] = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

export const QR_MIN_VERSION = 1;
export const QR_MAX_VERSION = 40;

/** Raw data modules of a version (everything but function patterns), in bits. */
export function numRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** Error correction blocks of `version` at `ecl`. */
export function blockLayout(
  version: number,
  ecl: QrErrorCorrection,
): { numBlocks: number; eccPerBlock: number } {
  const e = ECC_INDEX[ecl];
  return {
    numBlocks: NUM_ERROR_CORRECTION_BLOCKS[e]?.[version] ?? 1,
    eccPerBlock: ECC_CODEWORDS_PER_BLOCK[e]?.[version] ?? 0,
  };
}

/** Data codewords available for `version` at `ecl`. */
export function numDataCodewords(version: number, ecl: QrErrorCorrection): number {
  const e = ECC_INDEX[ecl];
  return (
    Math.floor(numRawDataModules(version) / 8) -
    (ECC_CODEWORDS_PER_BLOCK[e]?.[version] ?? 0) * (NUM_ERROR_CORRECTION_BLOCKS[e]?.[version] ?? 0)
  );
}

/** Largest byte-mode payload of `version` at `ecl`. */
export function byteCapacity(version: number, ecl: QrErrorCorrection): number {
  const countBits = version < 10 ? 8 : 16;
  return Math.floor((numDataCodewords(version, ecl) * 8 - 4 - countBits) / 8);
}

// ---------------------------------------------------------------------------
// Reed-Solomon over GF(2^8), primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D)
// ---------------------------------------------------------------------------
function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

/** Generator polynomial of `degree` (coefficients high to low, leading 1 omitted). */
export function reedSolomonDivisor(degree: number): number[] {
  const result: number[] = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j] ?? 0, root);
      if (j + 1 < result.length) result[j] = (result[j] ?? 0) ^ (result[j + 1] ?? 0);
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

/** Error correction codewords of `data` for `divisor`. */
export function reedSolomonRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result: number[] = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() ?? 0);
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] = (result[i] ?? 0) ^ gfMultiply(coef, factor);
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------
export class QrTooLongError extends Error {
  override readonly name = "QrTooLongError";
  constructor() {
    super("Texte trop long pour un QR code.");
  }
}

/** UTF-8 bytes of `text`. */
function utf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function appendBits(bits: number[], value: number, length: number): void {
  for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
}

/** Smallest version that holds `byteLength` bytes at `ecl`, or null. */
export function chooseVersion(byteLength: number, ecl: QrErrorCorrection): number | null {
  for (let v = QR_MIN_VERSION; v <= QR_MAX_VERSION; v++) {
    if (byteLength <= byteCapacity(v, ecl)) return v;
  }
  return null;
}

/** Data codewords (mode, count, bytes, terminator, padding) of a byte-mode segment. */
export function encodeDataCodewords(
  bytes: readonly number[],
  version: number,
  ecl: QrErrorCorrection,
): number[] {
  const capacityBits = numDataCodewords(version, ecl) * 8;
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) appendBits(bits, b, 8);
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  appendBits(bits, 0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) appendBits(bits, pad, 8);
  const codewords: number[] = new Array<number>(bits.length / 8).fill(0);
  bits.forEach((bit, i) => {
    codewords[i >>> 3] = (codewords[i >>> 3] ?? 0) | (bit << (7 - (i & 7)));
  });
  return codewords;
}

/** Splits data into blocks, adds ECC to each and interleaves (final codeword sequence). */
export function addEccAndInterleave(
  data: readonly number[],
  version: number,
  ecl: QrErrorCorrection,
): number[] {
  const e = ECC_INDEX[ecl];
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[e]?.[version] ?? 1;
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[e]?.[version] ?? 0;
  const rawCodewords = Math.floor(numRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks: number[][] = [];
  const divisor = reedSolomonDivisor(blockEccLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = reedSolomonRemainder(dat, divisor);
    // Short blocks get a placeholder so every block has the same length when interleaving.
    blocks.push([...dat, ...(i < numShortBlocks ? [0] : []), ...ecc]);
  }

  const result: number[] = [];
  for (let i = 0; i < (blocks[0]?.length ?? 0); i++) {
    blocks.forEach((block, j) => {
      // Short blocks have no codeword at the last data position.
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
        const value = block[i];
        if (value !== undefined) result.push(value);
      }
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------
export interface QrMatrix {
  version: number;
  size: number;
  mask: number;
  /** `modules[y][x]`: true = dark. */
  modules: boolean[][];
}

/** 15-bit format information (level + mask, BCH-coded, XOR 0x5412). */
export function formatBits(ecl: QrErrorCorrection, mask: number): number {
  const data = (ECC_FORMAT_BITS[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** 18-bit version information (versions ≥ 7). */
export function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

/** Centre coordinates of the alignment patterns of `version`. */
export function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = version * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

class MatrixBuilder {
  readonly size: number;
  readonly modules: boolean[][];
  readonly isFunction: boolean[][];

  constructor(readonly version: number) {
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.isFunction = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false),
    );
  }

  set(x: number, y: number, dark: boolean): void {
    const row = this.modules[y];
    const fn = this.isFunction[y];
    if (!row || !fn) return;
    row[x] = dark;
    fn[x] = true;
  }

  drawFunctionPatterns(ecl: QrErrorCorrection): void {
    for (let i = 0; i < this.size; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    this.drawFinder(3, 3);
    this.drawFinder(this.size - 4, 3);
    this.drawFinder(3, this.size - 4);
    const align = alignmentPositions(this.version);
    const n = align.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        this.drawAlignment(align[i] ?? 0, align[j] ?? 0);
      }
    }
    this.drawFormat(ecl, 0);
    this.drawVersion();
  }

  private drawFinder(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.set(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  private drawAlignment(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  drawFormat(ecl: QrErrorCorrection, mask: number): void {
    const bits = formatBits(ecl, mask);
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(i));
    this.set(8, 7, bit(6));
    this.set(8, 8, bit(7));
    this.set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.set(this.size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.set(8, this.size - 15 + i, bit(i));
    this.set(8, this.size - 8, true);
  }

  private drawVersion(): void {
    if (this.version < 7) return;
    const bits = versionBits(this.version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.set(a, b, dark);
      this.set(b, a, dark);
    }
  }

  drawCodewords(codewords: readonly number[]): void {
    let i = 0;
    const totalBits = codewords.length * 8;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          const row = this.modules[y];
          if (!this.isFunction[y]?.[x] && row && i < totalBits) {
            row[x] = (((codewords[i >>> 3] ?? 0) >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
  }

  applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      const row = this.modules[y];
      if (!row) continue;
      for (let x = 0; x < this.size; x++) {
        if (this.isFunction[y]?.[x]) continue;
        if (maskBit(mask, x, y)) row[x] = !row[x];
      }
    }
  }
}

/** Whether mask pattern `mask` (0..7) inverts module (x, y). */
export function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      throw new RangeError("Masque QR invalide.");
  }
}

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

/** Penalty score of a matrix (ISO/IEC 18004 §7.8.3): lower is better. */
export function penaltyScore(modules: readonly (readonly boolean[])[]): number {
  const size = modules.length;
  const at = (x: number, y: number) => modules[y]?.[x] === true;
  let result = 0;

  const lineScore = (get: (i: number) => boolean) => {
    let score = 0;
    let runColor = false;
    let runLen = 0;
    const history = new Array<number>(7).fill(0);
    const push = (len: number) => {
      // The first run of a line also counts the light border before it.
      const withBorder = history[0] === 0 ? len + size : len;
      history.pop();
      history.unshift(withBorder);
    };
    const finderLike = () => {
      const n = history[1] ?? 0;
      const core =
        n > 0 &&
        history[2] === n &&
        history[3] === n * 3 &&
        history[4] === n &&
        history[5] === n;
      return (
        (core && (history[0] ?? 0) >= n * 4 && (history[6] ?? 0) >= n ? 1 : 0) +
        (core && (history[6] ?? 0) >= n * 4 && (history[0] ?? 0) >= n ? 1 : 0)
      );
    };
    for (let i = 0; i < size; i++) {
      if (get(i) === runColor) {
        runLen++;
        if (runLen === 5) score += PENALTY_N1;
        else if (runLen > 5) score++;
      } else {
        push(runLen);
        if (!runColor) score += finderLike() * PENALTY_N3;
        runColor = get(i);
        runLen = 1;
      }
    }
    // Terminate the line: light border of `size` modules.
    if (runColor) {
      push(runLen);
      runLen = 0;
    }
    runLen += size;
    push(runLen);
    score += finderLike() * PENALTY_N3;
    return score;
  };

  for (let y = 0; y < size; y++) result += lineScore((x) => at(x, y));
  for (let x = 0; x < size; x++) result += lineScore((y) => at(x, y));

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = at(x, y);
      if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) result += PENALTY_N2;
    }
  }

  let dark = 0;
  for (const row of modules) for (const m of row) if (m) dark++;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += Math.max(0, k) * PENALTY_N4;
  return result;
}

/**
 * Encodes `text` (UTF-8, byte mode) at `ecl` in the smallest version; the mask with the lowest
 * penalty wins (ties → lowest mask number).
 * @throws QrTooLongError when no version up to 40 fits
 */
export function encodeQr(text: string, ecl: QrErrorCorrection = "M"): QrMatrix {
  const bytes = utf8(text);
  const version = chooseVersion(bytes.length, ecl);
  if (version === null) throw new QrTooLongError();
  const codewords = addEccAndInterleave(encodeDataCodewords(bytes, version, ecl), version, ecl);

  let best: QrMatrix | null = null;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const builder = new MatrixBuilder(version);
    builder.drawFunctionPatterns(ecl);
    builder.drawCodewords(codewords);
    builder.applyMask(mask);
    builder.drawFormat(ecl, mask);
    const penalty = penaltyScore(builder.modules);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      best = { version, size: builder.size, mask, modules: builder.modules };
    }
  }
  if (!best) throw new QrTooLongError();
  return best;
}

/**
 * SVG path data of the dark modules (one `h1v1h-1z` square per module, offset by `quietZone`),
 * for a `viewBox="0 0 {size + 2·quietZone} {size + 2·quietZone}"`.
 */
export function qrSvgPath(matrix: QrMatrix, quietZone = 4): string {
  const parts: string[] = [];
  matrix.modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) parts.push(`M${x + quietZone},${y + quietZone}h1v1h-1z`);
    });
  });
  return parts.join("");
}
