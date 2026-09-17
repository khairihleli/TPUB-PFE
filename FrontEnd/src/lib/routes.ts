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

/**
 * v2 wizard (contract §5 F1/F2): details → contenu → porteurs → verification (?etape=1..4).
 */
export type WizardStepV2 = "details" | "contenu" | "porteurs" | "verification";

export const WIZARD_V2_STEPS: readonly WizardStepV2[] = [
  "details",
  "contenu",
  "porteurs",
  "verification",
];

export const WIZARD_V2_STEP_NUMBER: Readonly<Record<WizardStepV2, 1 | 2 | 3 | 4>> = {
  details: 1,
  contenu: 2,
  porteurs: 3,
  verification: 4,
};

/** `?etape=` → v2 step. Accepts "1".."4" and step names. Default details. */
export function parseWizardStepV2Param(raw: string | number | null | undefined): WizardStepV2 {
  const value = typeof raw === "number" ? String(raw) : (raw ?? "").trim();
  const byName = WIZARD_V2_STEPS.find((s) => s === value);
  if (byName) return byName;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 4
    ? (WIZARD_V2_STEPS[n - 1] as WizardStepV2)
    : "details";
}

export type AdminUsersTab = "annonceurs" | "equipe";
export type AdminJournalTab = "audit" | "decisions-ia" | "diffusions";
export type AdminReservationsTab = "toutes" | "conflits";

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
    /** `wizard(null)` → new campaign; `wizard(7, "porteurs")` → ?id=7&etape=3. Numbers 1–4 accepted. */
    wizard: (id: number | null, step?: WizardStepV2 | 1 | 2 | 3 | 4) =>
      withQuery("/espace/campagnes/nouvelle", {
        id: id ?? undefined,
        etape:
          step === undefined
            ? undefined
            : WIZARD_V2_STEP_NUMBER[
                typeof step === "number" ? parseWizardStepV2Param(step) : step
              ],
      }),
    /** Same as `wizard` with a step name: `campaignWizard(7, "contenu")` → ?id=7&etape=2. */
    campaignWizard: (id: number | null, step?: WizardStepV2) =>
      withQuery("/espace/campagnes/nouvelle", {
        id: id ?? undefined,
        etape: step === undefined ? undefined : WIZARD_V2_STEP_NUMBER[step],
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
    users: (q?: { onglet?: AdminUsersTab; q?: string; utilisateur?: number }) =>
      withQuery("/admin/utilisateurs", {
        onglet: q?.onglet === "annonceurs" ? undefined : q?.onglet,
        q: q?.q,
        utilisateur: q?.utilisateur,
      }),
    journal: (q?: { onglet?: AdminJournalTab; campagne?: number }) =>
      withQuery("/admin/journal", {
        onglet: q?.onglet === "audit" ? undefined : q?.onglet,
        campagne: q?.campagne,
      }),
    aiRules: () => "/admin/regles-ia",
    reservations: (q?: { onglet?: AdminReservationsTab; campagne?: number; porteur?: number }) =>
      withQuery("/admin/reservations", {
        onglet: q?.onglet === "toutes" ? undefined : q?.onglet,
        campagne: q?.campagne,
        porteur: q?.porteur,
      }),
    statistics: () => "/admin/statistiques",
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
