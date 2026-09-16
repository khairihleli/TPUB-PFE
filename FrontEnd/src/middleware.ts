import { type NextRequest, NextResponse } from "next/server";

import {
  isStaffRole,
  readSession,
  roleHome,
  TOKEN_COOKIE,
  USER_COOKIE,
} from "@/lib/session-cookie";

/**
 * Route gate (presence + role only; Spring stays the authority):
 * - /espace/**  → ANNONCEUR (staff → /admin?acces=reserve)
 * - /admin/**   → ADMINISTRATEUR | SUPERVISEUR | OPERATEUR (annonceur → /espace?acces=reserve)
 * - unauthenticated → /connexion?next=<path>
 * - /connexion, /inscription with a valid session → role home, except /connexion?renouveler=1
 *   (re-login from the session-expiry banner, UX-PLAN §7.5)
 */
export function middleware(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  const token = req.cookies.get(TOKEN_COOKIE)?.value;
  const user = readSession(token, req.cookies.get(USER_COOKIE)?.value);

  const isEspace = pathname === "/espace" || pathname.startsWith("/espace/");
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isEspace || isAdmin) {
    if (!user) {
      const url = req.nextUrl.clone();
      url.pathname = "/connexion";
      url.search = "";
      url.searchParams.set("next", `${pathname}${search}`);
      if (token) url.searchParams.set("expire", "1");
      const res = NextResponse.redirect(url);
      if (token) {
        res.cookies.delete(TOKEN_COOKIE);
        res.cookies.delete(USER_COOKIE);
      }
      return res;
    }
    if (isEspace && user.role !== "ANNONCEUR") {
      return NextResponse.redirect(new URL("/admin?acces=reserve", req.url));
    }
    if (isAdmin && !isStaffRole(user.role)) {
      return NextResponse.redirect(new URL("/espace?acces=reserve", req.url));
    }
    const res = NextResponse.next();
    res.headers.set("x-robots-tag", "noindex, nofollow");
    res.headers.set("cache-control", "private, no-store");
    return res;
  }

  const renewing = pathname === "/connexion" && req.nextUrl.searchParams.get("renouveler") === "1";
  if ((pathname === "/connexion" || pathname === "/inscription") && user && !renewing) {
    return NextResponse.redirect(new URL(roleHome(user.role), req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/espace", "/espace/:path*", "/admin", "/admin/:path*", "/connexion", "/inscription"],
};
