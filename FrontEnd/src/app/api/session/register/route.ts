import type { NextResponse } from "next/server";

import { forwardAuth } from "@/lib/session-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/session/register RegisterRequest → 201 { user } + httpOnly cookies. */
export function POST(req: Request): Promise<NextResponse> {
  return forwardAuth(req, "register");
}
