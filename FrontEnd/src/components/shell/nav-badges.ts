"use client";

/**
 * Sidebar / tab bar badges (UX-PLAN §3.1) computed from resources already used by the screens,
 * through the shared cache (30 s) and revalidated on focus. Hidden at 0. No new endpoint.
 */
import { useCallback, useEffect, useState } from "react";

import type { NavBadgeKey } from "@/content/nav";
import {
  campaignsApi,
  emergencyApi,
  reservationsApi,
  supportsApi,
  zonesApi,
} from "@/lib/api/endpoints";
import type {
  CampaignResponse,
  EmergencyResponse,
  ReservationConflict,
  ReservationResponse,
  RoleCode,
} from "@/lib/api/types";
import { approvalsApi, supervisionApi } from "@/lib/api/endpoints-supervision";
import type { PendingApprovals, SupervisionAlert } from "@/lib/api/types-supervision";
import { runWithConcurrency } from "@/lib/network/use-supports-availability";
import { fetchCached, resourceKeys } from "@/lib/resource-cache";

export type NavBadges = Partial<Record<NavBadgeKey, number>>;

const ACTIVE_RESERVATION = new Set(["TEMPORAIRE", "CONFIRMEE"]);

/** « À finaliser »: drafts without an active créneau + campaigns rejected by the AI. */
export function countDraftsToFinalise(
  campaigns: readonly Pick<CampaignResponse, "id" | "status">[],
  reservationsByCampaign: ReadonlyMap<
    number,
    readonly Pick<ReservationResponse, "reservationStatus">[]
  >,
): number {
  let n = 0;
  for (const c of campaigns) {
    if (c.status === "REJECTED_BY_AI") n++;
    else if (c.status === "BROUILLON") {
      const list = reservationsByCampaign.get(c.id);
      // Unknown reservations (request failed) → do not count: never inflate a badge.
      if (list && !list.some((r) => ACTIVE_RESERVATION.has(r.reservationStatus))) n++;
    }
  }
  return n;
}

/** Same filter as the admin overview hero: APPROVED_BY_AI + REVIEW_REQUIRED. */
export function countModerationQueue(
  campaigns: readonly Pick<CampaignResponse, "status">[],
): number {
  return campaigns.filter((c) => c.status === "APPROVED_BY_AI" || c.status === "REVIEW_REQUIRED")
    .length;
}

/** Messages still able to reach a screen: v2 `state` (PROGRAMME | EN_COURS) wins over `isActive`. */
export function countActiveEmergencies(
  messages: readonly Pick<EmergencyResponse, "isActive" | "state">[],
): number {
  return messages.filter((m) =>
    m.state ? m.state === "PROGRAMME" || m.state === "EN_COURS" : m.isActive,
  ).length;
}

/** Réservations badge: CONFLIT groups only (SATURE is full capacity, not an error). */
export function countConflicts(
  conflicts: readonly Pick<ReservationConflict, "severity">[],
): number {
  return conflicts.filter((c) => c.severity === "CONFLIT").length;
}

/** Approbations badge: campaigns and emergency messages still waiting for an administrator. */
export function countPendingApprovals(pending: PendingApprovals): number {
  return pending.campaigns.length + pending.emergencies.length;
}

/** Supervision badge: open alerts that nobody acknowledged yet. */
export function countOpenAlerts(alerts: readonly Pick<SupervisionAlert, "acknowledgedAt">[]): number {
  return alerts.filter((a) => a.acknowledgedAt === null).length;
}

/** Roles allowed to list every campaign (api-contract: ADMINISTRATEUR, SUPERVISEUR). */
function canListAllCampaigns(role: RoleCode): boolean {
  return role === "ADMINISTRATEUR" || role === "SUPERVISEUR";
}

async function loadEspaceBadges(signal: AbortSignal): Promise<NavBadges> {
  const campaigns = await fetchCached(
    resourceKeys.campaignsMine,
    (s) => campaignsApi.mine({ signal: s }),
    {
      signal,
    },
  );
  const drafts = campaigns.filter((c) => c.status === "BROUILLON");
  const byCampaign = new Map<number, ReservationResponse[]>();
  await runWithConcurrency(
    drafts,
    4,
    async (c) => {
      try {
        byCampaign.set(
          c.id,
          await fetchCached(
            resourceKeys.reservationsByCampaign(c.id),
            (s) => reservationsApi.byCampaign(c.id, { signal: s }),
            { signal },
          ),
        );
      } catch {
        /* partial: this draft is not counted */
      }
    },
    signal,
  );
  return { drafts: countDraftsToFinalise(campaigns, byCampaign) };
}

async function loadAdminBadges(role: RoleCode, signal: AbortSignal): Promise<NavBadges> {
  const out: NavBadges = {};
  const tasks: Promise<void>[] = [];
  if (canListAllCampaigns(role)) {
    tasks.push(
      fetchCached(resourceKeys.campaignsAll, (s) => campaignsApi.all({ signal: s }), { signal })
        .then((list) => {
          out.moderation = countModerationQueue(list);
        })
        .catch(() => undefined),
    );
    tasks.push(
      fetchCached(
        resourceKeys.reservationConflicts,
        (s) => reservationsApi.conflicts({ signal: s }),
        { signal },
      )
        .then((list) => {
          out.conflicts = countConflicts(list);
        })
        .catch(() => undefined),
    );
  }
  tasks.push(
    Promise.all([
      fetchCached(resourceKeys.zonesAll, (s) => zonesApi.all({ signal: s }), { signal }),
      fetchCached(resourceKeys.supportsAll, (s) => supportsApi.all({ signal: s }), { signal }),
    ])
      // Loaded on demand: the coherence rules only matter to staff, so /espace never ships them.
      .then(async ([zones, supports]) => {
        const { checkNetworkCoherence } = await import("@/components/admin/network-coherence");
        const report = checkNetworkCoherence(zones, supports);
        out.coherence = report.bySeverity.danger + report.bySeverity.warning;
      })
      .catch(() => undefined),
  );
  tasks.push(
    supervisionApi
      .snapshot({ signal })
      .then((snapshot) => {
        out.alerts = countOpenAlerts(snapshot.alerts);
      })
      .catch(() => undefined),
  );
  if (canListAllCampaigns(role)) {
    tasks.push(
      approvalsApi
        .pending({ signal })
        .then((pending) => {
          out.approvals = countPendingApprovals(pending);
        })
        .catch(() => undefined),
    );
  }
  tasks.push(
    fetchCached(resourceKeys.emergencies, (s) => emergencyApi.all({ signal: s }), { signal })
      .then((list) => {
        out.emergencies = countActiveEmergencies(list);
      })
      .catch(() => undefined),
  );
  await Promise.all(tasks);
  return out;
}

const FOCUS_THROTTLE_MS = 30_000;

/** `const badges = useNavBadges("espace", role)` → `{ drafts: 2 }`. Errors hide the badge. */
export function useNavBadges(
  variant: "espace" | "admin",
  role: RoleCode,
  enabled = true,
): NavBadges {
  const [badges, setBadges] = useState<NavBadges>({});
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const load =
        variant === "admin"
          ? loadAdminBadges(role, controller.signal)
          : loadEspaceBadges(controller.signal);
      load
        .then((next) => {
          if (!controller.signal.aborted) setBadges(next);
        })
        .catch(() => undefined);
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [variant, role, enabled, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let last = Date.now();
    const onFocus = () => {
      if (document.visibilityState === "hidden" || Date.now() - last < FOCUS_THROTTLE_MS) return;
      last = Date.now();
      refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [enabled, refresh]);

  return badges;
}

/** aria-label for a badge (« 2 à finaliser »…). */
export function badgeAriaLabel(key: NavBadgeKey, count: number): string {
  switch (key) {
    case "drafts":
      return `${count} à finaliser`;
    case "moderation":
      return `${count} ${count >= 2 ? "campagnes" : "campagne"} à décider`;
    case "coherence":
      return `${count} ${count >= 2 ? "incohérences" : "incohérence"} réseau`;
    case "emergencies":
      return `${count} ${count >= 2 ? "messages actifs" : "message actif"}`;
    case "conflicts":
      return `${count} ${count >= 2 ? "conflits de réservation" : "conflit de réservation"}`;
    case "approvals":
      return `${count} ${count >= 2 ? "approbations en attente" : "approbation en attente"}`;
    case "alerts":
      return `${count} ${count >= 2 ? "alertes ouvertes" : "alerte ouverte"}`;
  }
}
