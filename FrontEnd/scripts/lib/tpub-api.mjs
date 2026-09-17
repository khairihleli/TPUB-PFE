/**
 * Shared helpers for the Node scripts that talk to a running TPUB backend directly
 * (seed-demo.mjs, demo-scenario.mjs). No dependency beyond Node ≥ 22 (fetch, FormData, Blob, zlib).
 */
import { deflateSync } from "node:zlib";

export const API = (process.env.TPUB_API_URL ?? "http://localhost:8080").replace(/\/$/, "");

/** Error thrown for any non-2xx answer; carries the backend error body (`code`, `errors`). */
export class ApiCallError extends Error {
  constructor(method, path, status, data) {
    super(
      `${method} ${path} → ${status}${data?.code ? ` ${data.code}` : ""}${data?.message ? ` : ${data.message}` : ""}`,
    );
    this.status = status;
    this.data = data;
    this.code = data?.code ?? null;
  }
}

/**
 * Calls the backend. `body` is sent as JSON, `form` (FormData) as multipart, `query` is appended
 * (null/undefined values skipped). Returns `{ status, data, headers }` when `raw` is set, else the
 * parsed JSON (or text) body.
 */
export async function call(method, path, { token, body, form, query, raw = false } = {}) {
  const qs = query
    ? new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== null && v !== undefined && v !== "")
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : "";
  const url = `${API}${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const contentType = res.headers.get("content-type") ?? "";
  let data = null;
  if (contentType.includes("json")) {
    const text = await res.text();
    data = text ? JSON.parse(text) : null;
  } else if (contentType.startsWith("text/")) {
    data = await res.text();
  } else {
    data = Buffer.from(await res.arrayBuffer());
  }
  if (!res.ok) throw new ApiCallError(method, path, res.status, data);
  return raw ? { status: res.status, data, headers: res.headers } : data;
}

/** Items of a PageResponse, or the array itself for list endpoints. */
export function items(pageOrList) {
  return Array.isArray(pageOrList) ? pageOrList : (pageOrList?.items ?? []);
}

/** Local (Africa/Tunis ≈ machine) calendar date `days` from today, "YYYY-MM-DD". */
export function day(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Same time-slot presets as the backend (contract §2.4) and src/lib/time-slots.ts. */
export const SLOT_PRESETS = {
  MATIN: { startTime: "07:00:00", endTime: "12:00:00" },
  APRES_MIDI: { startTime: "12:00:00", endTime: "18:00:00" },
  SOIR: { startTime: "18:00:00", endTime: "23:00:00" },
  JOURNEE: { startTime: "07:00:00", endTime: "23:00:00" },
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

/**
 * A valid RGB PNG (readable by Java ImageIO) with a diagonal two-colour gradient and a light
 * block texture so the file is not trivially small. `seed` varies the colours so two
 * generated visuals never share a checksum (the AI flags identical media across campaigns).
 */
export function makePng(width = 1280, height = 720, seed = Date.now()) {
  const s = Math.abs(Math.floor(seed)) % 997;
  const from = [20 + (s % 60), 60 + ((s * 7) % 80), 140 + ((s * 13) % 100)];
  const to = [230 - ((s * 3) % 50), 120 + ((s * 5) % 90), 40 + ((s * 11) % 60)];
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2;
      const jitter = (((x >> 5) * 7 + (y >> 5) * 13 + s) % 24) * (((x >> 5) + (y >> 5)) % 2);
      for (let c = 0; c < 3; c++) {
        raw[offset++] = Math.max(
          0,
          Math.min(255, Math.round(from[c] + (to[c] - from[c]) * t) + jitter - 12),
        );
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Multipart body for POST /api/campaigns/{id}/media with a generated PNG. */
export function pngForm(fileName, seed) {
  const form = new FormData();
  form.append("file", new Blob([makePng(1280, 720, seed)], { type: "image/png" }), fileName);
  return form;
}
