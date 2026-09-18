/**
 * Pure rules of the supervision screen (docs/round2-contract.md §5.3): live merge of the SSE events
 * into the snapshot, labels and filters. No React, no fetch: unit-tested.
 */
import type {
  AlertSeverity,
  DiffusionLiveEvent,
  EmergencyLiveEvent,
  PresenceEvent,
  PresenceState,
  SupervisionAlert,
  SupervisionAlertType,
  SupervisionSnapshot,
  SupervisionStats,
  SupervisionSupportRow,
} from "@/lib/api/types-supervision";

/** Lines kept in the live feed. */
export const FEED_LIMIT = 50;
/** Open alerts kept in the side panel. */
export const ALERT_LIMIT = 50;

export const PRESENCE_LABEL: Record<PresenceState, string> = {
  EN_LIGNE: "En ligne",
  HORS_LIGNE: "Hors ligne",
  INCONNU: "Inconnu",
};

export const PRESENCE_TONE: Record<PresenceState, "success" | "danger" | "neutral"> = {
  EN_LIGNE: "success",
  HORS_LIGNE: "danger",
  INCONNU: "neutral",
};

export const CONTENT_TYPE_LABEL: Record<DiffusionLiveEvent["contentType"], string> = {
  PUBLICITE: "Publicité",
  URGENCE: "Message prioritaire",
  DEFAUT: "Contenu ZELQANE",
};

export const ALERT_TYPE_LABEL: Record<SupervisionAlertType, string> = {
  SUPPORT_OFFLINE: "Écran hors ligne",
  ZONE_SATURATION: "Zone saturée",
  EMERGENCY_PENDING_APPROVAL: "Message à approuver",
  CAMPAIGN_PENDING_APPROVAL: "Validation à confirmer",
};

export const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  INFO: "Information",
  AVERTISSEMENT: "Avertissement",
  CRITIQUE: "Critique",
};

export const SEVERITY_TONE: Record<AlertSeverity, "neutral" | "warning" | "danger"> = {
  INFO: "neutral",
  AVERTISSEMENT: "warning",
  CRITIQUE: "danger",
};

export type PresenceFilter = "tous" | PresenceState;

export const PRESENCE_FILTERS: readonly { value: PresenceFilter; label: string }[] = [
  { value: "tous", label: "Tous" },
  { value: "EN_LIGNE", label: "En ligne" },
  { value: "HORS_LIGNE", label: "Hors ligne" },
  { value: "INCONNU", label: "Inconnu" },
];

/** Applies a `presence` event to the support rows (unknown support: rows unchanged). */
export function applyPresence(
  rows: readonly SupervisionSupportRow[],
  event: PresenceEvent,
): SupervisionSupportRow[] {
  return rows.map((row) =>
    row.supportId === event.supportId
      ? { ...row, presence: event.presence, lastHeartbeatAt: event.lastHeartbeatAt }
      : row,
  );
}

/** Applies a `diffusion` event: the Porteur now shows this content. */
export function applyDiffusion(
  rows: readonly SupervisionSupportRow[],
  event: DiffusionLiveEvent,
): SupervisionSupportRow[] {
  return rows.map((row) =>
    row.supportId === event.supportId
      ? {
          ...row,
          current: {
            contentType: event.contentType,
            title: event.title,
            campaignId: event.campaignId,
            emergencyId: event.emergencyId,
            diffusedAt: event.diffusedAt,
          },
        }
      : row,
  );
}

/** Newest first, no duplicate, at most `limit` lines. */
export function pushFeed(
  feed: readonly DiffusionLiveEvent[],
  event: DiffusionLiveEvent,
  limit = FEED_LIMIT,
): DiffusionLiveEvent[] {
  const without = feed.filter((f) => f.diffusionLogId !== event.diffusionLogId);
  return [event, ...without].slice(0, limit);
}

/** Inserts or updates an alert; a resolved alert leaves the open list. */
export function applyAlert(
  alerts: readonly SupervisionAlert[],
  alert: SupervisionAlert,
  limit = ALERT_LIMIT,
): SupervisionAlert[] {
  const without = alerts.filter((a) => a.id !== alert.id);
  if (alert.resolvedAt) return without;
  return [alert, ...without]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/** Inserts or updates an emergency; the ones that ended leave the list. */
export function applyEmergency(
  emergencies: readonly EmergencyLiveEvent[],
  event: EmergencyLiveEvent,
): EmergencyLiveEvent[] {
  const without = emergencies.filter((e) => e.emergencyId !== event.emergencyId);
  const live =
    event.state === "EN_COURS" ||
    event.state === "PROGRAMME" ||
    event.state === "EN_ATTENTE_APPROBATION";
  return live ? [event, ...without] : without;
}

/** Counters recomputed from the rows the browser holds (the server refreshes them every minute). */
export function recountStats(
  stats: SupervisionStats,
  rows: readonly SupervisionSupportRow[],
  alerts: readonly SupervisionAlert[],
  emergencies: readonly EmergencyLiveEvent[],
): SupervisionStats {
  return {
    ...stats,
    onlineSupports: rows.filter((r) => r.presence === "EN_LIGNE").length,
    offlineSupports: rows.filter((r) => r.presence === "HORS_LIGNE").length,
    unknownSupports: rows.filter((r) => r.presence === "INCONNU").length,
    openAlerts: alerts.length,
    activeEmergencies: emergencies.filter((e) => e.state === "EN_COURS").length,
  };
}

export function filterSupports(
  rows: readonly SupervisionSupportRow[],
  presence: PresenceFilter,
  query: string,
): SupervisionSupportRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (presence !== "tous" && row.presence !== presence) return false;
    if (!q) return true;
    return (
      row.name.toLowerCase().includes(q) ||
      (row.zoneName ?? "").toLowerCase().includes(q) ||
      String(row.supportId) === q
    );
  });
}

/** Empty snapshot used before the first event (keeps the screen renderable). */
export function emptySnapshot(serverTime = new Date().toISOString()): SupervisionSnapshot {
  return {
    serverTime,
    supports: [],
    emergencies: [],
    alerts: [],
    recentDiffusions: [],
    stats: {
      onlineSupports: 0,
      offlineSupports: 0,
      unknownSupports: 0,
      diffusionsLastHour: 0,
      activeEmergencies: 0,
      openAlerts: 0,
    },
  };
}

/** « il y a 12 s », « il y a 4 min », « il y a 2 h », « — » when never seen. */
export function sinceLabel(iso: string | null | undefined, now: number): string {
  if (!iso) return "—";
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "à l'instant";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `il y a ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
}
