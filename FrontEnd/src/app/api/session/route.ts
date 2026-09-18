import { NextResponse } from "next/server";

import type { SessionResponse } from "@/lib/api/types";
import { getSession } from "@/lib/session";
import { refreshSession } from "@/lib/session-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/session → { user } or 401.
 * GET /api/session?actualiser=1 → re-reads the account from the backend and rewrites the user
 * cookie (round 2: after the forced password change).
 */
export async function GET(req: Request): Promise<NextResponse> {
  if (new URL(req.url).searchParams.get("actualiser") === "1") {
    return refreshSession(req);
  }
  const user = await getSession();
  if (!user) {
    return NextResponse.json(
      { status: 401, message: "Vous n'êtes pas connecté." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.json({ user } satisfies SessionResponse, {
    headers: { "cache-control": "no-store" },
  });
}
