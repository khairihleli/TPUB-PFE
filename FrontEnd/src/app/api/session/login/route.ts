import type { NextResponse } from "next/server";

import { forwardAuth } from "@/lib/session-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/session/login { email, password } → { user } + httpOnly cookies. */
export function POST(req: Request): Promise<NextResponse> {
  return forwardAuth(req, "login");
}
