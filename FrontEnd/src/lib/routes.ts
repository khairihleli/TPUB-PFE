/**
 * Typed internal hrefs (UX-PLAN §3.5). The only way to build links to objects and filtered lists.
 * Ids from the URL are never trusted for authorization: detail pages resolve from `/mine`.
 */
import type { ReservationStatus } from "@/lib/api/types";
import type { CampaignFilterValue } from "@/lib/campaign-status";

type QueryValue = string | number | boolean | null | undefined;

/** Builds "path?a=1&b=2", skipping null/undefined/"" and default values. */
export function withQuery(path: string, query: Record<string, QueryValue> = {}): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === null || v === undefined || v === "" || v === false) continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export type WizardStep = "details" | "porteurs" | "verification";

/** Wizard steps in the URL: details=1, porteurs=2, verification=3 (legacy 4 → 3). */
export const WIZARD_STEP_NUMBER: Readonly<Record<WizardStep, 1 | 2 | 3>> = {
  details: 1,
  porteurs: 2,
  verification: 3,
};

/** `?etape=` → step. Accepts "1".."3", legacy "4" (→ verification) and step names. Default details. */
export function parseWizardStepParam(raw: string | number | null | undefined): WizardStep {
  const value = typeof raw === "number" ? String(raw) : (raw ?? "").trim();
  if (value === "2" || value === "porteurs") return "porteurs";
  if (value === "3" || value === "4" || value === "verification") return "verification";
  return "details";
}

export type ModerationTab = "a-traiter" | "revue" | "ia" | "toutes";
export type AdminNetworkTab = "carte" | "ecrans" | "zones";

export const routes = {
  home: () => "/",
  /** `renew`: re-login while the session is still valid (session banner, new tab). */
  login: (q?: { next?: string; expire?: boolean; renew?: boolean }) =>
    withQuery("/connexion", {
      next: q?.next,
      expire: q?.expire ? 1 : undefined,
      renouveler: q?.renew ? 1 : undefined,
    }),
  espace: {
    home: () => "/espace",
    campaigns: (q?: { statut?: CampaignFilterValue; q?: string; tri?: string }) =>
      withQuery("/espace/campagnes", {
        statut: q?.statut === "toutes" ? undefined : q?.statut,
        q: q?.q,
        tri: q?.tri,
      }),
    campaign: (id: number) => `/espace/campagnes/${id}`,
    campaignEdit: (id: number) => `/espace/campagnes/${id}/modifier`,
    /** `wizard(null)` → new campaign; `wizard(7, "porteurs")` → ?id=7&etape=2. Numbers 1–4 accepted. */
    wizard: (id: number | null, step?: WizardStep | 1 | 2 | 3 | 4) =>
      withQuery("/espace/campagnes/nouvelle", {
        id: id ?? undefined,
        etape:
          step === undefined
            ? undefined
            : WIZARD_STEP_NUMBER[typeof step === "number" ? parseWizardStepParam(step) : step],
      }),
    reservations: (q?: {
      statut?: ReservationStatus;
      campagne?: number;
      zone?: number;
      tri?: string;
    }) =>
      withQuery("/espace/reservations", {
        statut: q?.statut,
        campagne: q?.campagne,
        zone: q?.zone,
        tri: q?.tri,
      }),
    statistics: () => "/espace/statistiques",
    network: (q?: { zone?: number; porteur?: number; vue?: string; fond?: string }) =>
      withQuery("/espace/reseau", {
        zone: q?.zone,
        porteur: q?.porteur,
        vue: q?.vue,
        fond: q?.fond,
      }),
    profile: () => "/espace/profil",
  },
  admin: {
    home: () => "/admin",
    moderation: (q?: { onglet?: ModerationTab; q?: string; examen?: number; tri?: string }) =>
      withQuery("/admin/moderation", {
        onglet: q?.onglet,
        q: q?.q,
        examen: q?.examen,
        tri: q?.tri,
      }),
    network: (q?: { onglet?: AdminNetworkTab; porteur?: number; panneau?: "coherence" }) =>
      withQuery("/admin/reseau", { onglet: q?.onglet, porteur: q?.porteur, panneau: q?.panneau }),
    emergencies: () => "/admin/urgences",
  },
  player: (supportId: number) => `/ecran/${supportId}`,
} as const;

export type AppSection = "espace" | "admin";

/** Section home for a pathname (null outside app areas). */
export function sectionOf(pathname: string): AppSection | null {
  if (pathname === "/espace" || pathname.startsWith("/espace/")) return "espace";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  return null;
}
