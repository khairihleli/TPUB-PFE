import { NextResponse } from "next/server";

import {
  clientKey,
  buildContactRecord,
  deliverContact,
  takeRateLimit,
} from "@/app/api/contact/contact-store";
import {
  CONTACT_MAX_BODY_BYTES,
  isHoneypotFilled,
  validateContact,
} from "@/components/contact/contact-schema";
import { CONTACT } from "@/content/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEND_FAILED = `L'envoi n'a pas abouti. Réessayez ou écrivez-nous à ${CONTACT.email}.`;

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * POST /api/contact — brief §8.7 contact request.
 * Guards: same-origin, JSON only, body ≤ 20 KB, per-IP rate limit, honeypot (silently dropped),
 * zod validation (French field errors). Delivery: CONTACT_WEBHOOK_URL or .data ndjson file.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (!sameOrigin(req)) {
    return json({ status: 403, message: "Requête refusée." }, 403);
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return json({ status: 415, message: "Format de requête non pris en charge." }, 415);
  }

  const tooLarge = json(
    { status: 413, message: "Votre demande est trop volumineuse. Raccourcissez votre message." },
    413,
  );
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > CONTACT_MAX_BODY_BYTES) return tooLarge;

  let text: string;
  try {
    text = await req.text();
  } catch {
    return json({ status: 400, message: "Requête invalide." }, 400);
  }
  if (new TextEncoder().encode(text).byteLength > CONTACT_MAX_BODY_BYTES) return tooLarge;

  if (!takeRateLimit(clientKey(req))) {
    return json(
      {
        status: 429,
        message: "Trop de demandes envoyées. Patientez quelques minutes puis réessayez.",
      },
      429,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    return json({ status: 400, message: "Requête invalide." }, 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json({ status: 400, message: "Requête invalide." }, 400);
  }

  // Bots fill the hidden field: answer like a success, store nothing.
  if (isHoneypotFilled(payload)) {
    return json({ ok: true }, 201);
  }

  const result = validateContact(payload);
  if (!result.ok) {
    return json(
      {
        status: 400,
        message: "Certains champs sont à vérifier.",
        errors: result.errors,
      },
      400,
    );
  }

  const record = buildContactRecord(result.data);
  const delivery = await deliverContact(record);
  if (!delivery.ok) {
    return json({ status: 502, message: SEND_FAILED }, 502);
  }

  return json({ ok: true, id: record.id }, 201);
}
