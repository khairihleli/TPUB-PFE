import { type NextRequest, NextResponse } from "next/server";

import {
  CHALLENGE_MARKER_COOKIE,
  isStaffRole,
  readSession,
  roleHome,
  TOKEN_COOKIE,
  USER_COOKIE,
} from "@/lib/session-cookie";

/** Forced password change screen (docs/round2-contract.md §3.2, §3.7). */
const PASSWORD_REQUIRED_PATH = "/mot-de-passe-requis";
/** Second login step and mandatory 2FA enrolment (§3.7). */
const CHALLENGE_PATHS: readonly string[] = [
  "/connexion/verification",
  "/connexion/activer-2fa",
];

/**
 * Route gate (presence + role only; Spring stays the authority):
 * - /espace/**  → ANNONCEUR (staff → /admin?acces=reserve)
 * - /admin/**   → ADMINISTRATEUR | SUPERVISEUR | OPERATEUR (annonceur → /espace?acces=reserve)
 * - unauthenticated → /connexion?next=<path>
 * - /connexion, /inscription with a valid session → role home, except /connexion?renouveler=1
 *   (re-login from the session-expiry banner, UX-PLAN §7.5)
 * Round 2:
 * - a session flagged `mustChangePassword` on /espace/** or /admin/** → /mot-de-passe-requis
 * - /mot-de-passe-requis without a session → /connexion
 * - /connexion/verification and /connexion/activer-2fa without a challenge in progress →
 *   /connexion?expire=1 (the httpOnly challenge cookie is scoped to /api/session: pages see its
 *   token-free marker cookie)
 */
export function middleware(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  const token = req.cookies.get(TOKEN_COOKIE)?.value;
  const user = readSession(token, req.cookies.get(USER_COOKIE)?.value);

  if (CHALLENGE_PATHS.includes(pathname)) {
    if (!req.cookies.get(CHALLENGE_MARKER_COOKIE)?.value) {
      const url = req.nextUrl.clone();
      url.pathname = "/connexion";
      url.search = "";
      url.searchParams.set("expire", "1");
      const next = req.nextUrl.searchParams.get("next");
      if (next) url.searchParams.set("next", next);
      return NextResponse.redirect(url);
    }
    return privatePage(NextResponse.next());
  }

  if (pathname === PASSWORD_REQUIRED_PATH) {
    if (!user) return NextResponse.redirect(new URL("/connexion", req.url));
    return privatePage(NextResponse.next());
  }

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
    if (user.mustChangePassword === true) {
      return NextResponse.redirect(new URL(PASSWORD_REQUIRED_PATH, req.url));
    }
    if (isEspace && user.role !== "ANNONCEUR") {
      return NextResponse.redirect(new URL("/admin?acces=reserve", req.url));
    }
    if (isAdmin && !isStaffRole(user.role)) {
      return NextResponse.redirect(new URL("/espace?acces=reserve", req.url));
    }
    return privatePage(NextResponse.next());
  }

  const renewing = pathname === "/connexion" && req.nextUrl.searchParams.get("renouveler") === "1";
  if ((pathname === "/connexion" || pathname === "/inscription") && user && !renewing) {
    return NextResponse.redirect(
      new URL(user.mustChangePassword === true ? PASSWORD_REQUIRED_PATH : roleHome(user.role), req.url),
    );
  }

  return NextResponse.next();
}

function privatePage(res: NextResponse): NextResponse {
  res.headers.set("x-robots-tag", "noindex, nofollow");
  res.headers.set("cache-control", "private, no-store");
  return res;
}

export const config = {
  matcher: [
    "/espace",
    "/espace/:path*",
    "/admin",
    "/admin/:path*",
    "/connexion",
    "/connexion/verification",
    "/connexion/activer-2fa",
    "/inscription",
    "/mot-de-passe-requis",
  ],
};
