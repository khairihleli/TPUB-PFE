import { NextResponse } from "next/server";

import type { SessionResponse } from "@/lib/api/types";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/session → { user } or 401. */
export async function GET(): Promise<NextResponse> {
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
