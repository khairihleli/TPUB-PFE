import type { NextResponse } from "next/server";

import { forwardChallenge } from "@/lib/session-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/session/enrolment/enable { code } → { status: "AUTHENTICATED", user, recoveryCodes }
 * + session cookies (mandatory 2FA enrolment completed).
 */
export function POST(req: Request): Promise<NextResponse> {
  return forwardChallenge(req, "enrolment-enable");
}
