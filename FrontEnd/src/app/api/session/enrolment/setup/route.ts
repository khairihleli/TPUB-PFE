import type { NextResponse } from "next/server";

import { forwardChallenge } from "@/lib/session-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/session/enrolment/setup → { secret, otpauthUri, expiresAt } (mandatory 2FA enrolment). */
export function POST(req: Request): Promise<NextResponse> {
  return forwardChallenge(req, "enrolment-setup");
}
