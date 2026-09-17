import type { NextResponse } from "next/server";

import { logoutSession } from "@/lib/session-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/session/logout → revokes the backend session (best-effort), clears the cookies. */
export function POST(req: Request): Promise<NextResponse> {
  return logoutSession(req);
}
