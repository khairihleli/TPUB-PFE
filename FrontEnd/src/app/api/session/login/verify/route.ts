import type { NextResponse } from "next/server";

import { forwardChallenge } from "@/lib/session-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/session/login/verify { code } → { status: "AUTHENTICATED", user, recoveryCodeUsed }
 * + session cookies. The challenge token is read from the httpOnly `tpub_challenge` cookie.
 */
export function POST(req: Request): Promise<NextResponse> {
  return forwardChallenge(req, "verify");
}
