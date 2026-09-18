/**
 * Server-only helpers for POST /api/contact: light rate limiting and delivery
 * (CONTACT_WEBHOOK_URL when set, otherwise one JSON line in .data/contact-requests.ndjson).
 */
import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { ContactRequest } from "@/components/contact/contact-schema";

// ---------------------------------------------------------------------------
// Rate limit (per process, best effort — not a security boundary)
// ---------------------------------------------------------------------------
export const RATE_LIMIT_MAX = 6;
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const hits = new Map<string, number[]>();

export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip")?.trim() || "local";
}

/** Records a hit and returns false when the key exceeded the window budget. */
export function takeRateLimit(key: string, now: number = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    // Keep memory bounded: drop the oldest keys.
    const excess = hits.size - 5000;
    let i = 0;
    for (const k of hits.keys()) {
      if (i++ >= excess) break;
      hits.delete(k);
    }
  }
  return true;
}

export function resetRateLimit(): void {
  hits.clear();
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------
export interface ContactRecord extends ContactRequest {
  id: string;
  receivedAt: string;
  source: "site-zelqane";
}

export function buildContactRecord(data: ContactRequest, now: Date = new Date()): ContactRecord {
  return { id: randomUUID(), receivedAt: now.toISOString(), source: "site-zelqane", ...data };
}

export function contactDataFile(): string {
  return path.join(process.cwd(), ".data", "contact-requests.ndjson");
}

export type DeliveryResult = { ok: true; channel: "webhook" | "r2" | "file" } | { ok: false };

type ContactBucket = {
  put(key: string, value: string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
};

/** The CONTACT_BUCKET R2 binding when running on Cloudflare Workers, else null (Node: file fallback). */
async function contactBucket(): Promise<ContactBucket | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const env = (await getCloudflareContext({ async: true })).env as { CONTACT_BUCKET?: ContactBucket };
    return env.CONTACT_BUCKET ?? null;
  } catch {
    return null;
  }
}

const WEBHOOK_TIMEOUT_MS = 8_000;

export async function deliverContact(record: ContactRecord): Promise<DeliveryResult> {
  const webhook = (process.env.CONTACT_WEBHOOK_URL ?? "").trim();

  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(record),
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      if (!res.ok) {
        console.error(`[contact] webhook answered ${res.status} for request ${record.id}`);
        return { ok: false };
      }
      console.info(
        `[contact] request ${record.id} forwarded (${record.profil} · ${record.besoin})`,
      );
      return { ok: true, channel: "webhook" };
    } catch (e) {
      console.error(
        `[contact] webhook unreachable for request ${record.id}: ${(e as Error | null)?.message ?? "unknown error"}`,
      );
      return { ok: false };
    }
  }

  // Cloudflare Workers: no writable disk, the requests go to the CONTACT_BUCKET R2 bucket.
  const bucket = await contactBucket();
  if (bucket) {
    try {
      await bucket.put(`requests/${record.receivedAt.slice(0, 10)}/${record.id}.json`, JSON.stringify(record), {
        httpMetadata: { contentType: "application/json" },
      });
      console.info(`[contact] request ${record.id} stored in R2 (${record.profil} · ${record.besoin})`);
      return { ok: true, channel: "r2" };
    } catch (e) {
      console.error(
        `[contact] R2 refused request ${record.id}: ${(e as Error | null)?.message ?? "unknown error"}`,
      );
      return { ok: false };
    }
  }

  try {
    const file = contactDataFile();
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, `${JSON.stringify(record)}\n`, { encoding: "utf8" });
    console.info(
      `[contact] request ${record.id} stored in .data/contact-requests.ndjson (${record.profil} · ${record.besoin})`,
    );
    return { ok: true, channel: "file" };
  } catch (e) {
    console.error(
      `[contact] could not store request ${record.id}: ${(e as Error | null)?.message ?? "unknown error"}`,
    );
    return { ok: false };
  }
}
