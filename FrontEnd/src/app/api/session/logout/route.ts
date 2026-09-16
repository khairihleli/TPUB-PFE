import { NextResponse } from "next/server";

import { clearSessionCookies } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/session/logout → clears the session cookies (the backend has no logout). */
export function POST(): NextResponse {
  const res = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  clearSessionCookies(res);
  return res;
}
