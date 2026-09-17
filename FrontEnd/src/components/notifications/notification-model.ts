/** Labels and pure rules of the notification centre (docs/round2-contract.md §5.5). */
import type {
  AlertSeverity,
  NotificationResponse,
  NotificationType,
} from "@/lib/api/types-supervision";

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  EMERGENCY_APPROVAL_REQUIRED: "Message prioritaire à approuver",
  EMERGENCY_BROADCAST: "Message prioritaire diffusé",
  EMERGENCY_REFUSED: "Message prioritaire refusé",
  CAMPAIGN_APPROVAL_REQUIRED: "Validation de campagne à confirmer",
  SUPPORT_OFFLINE: "Écran hors ligne",
  ZONE_SATURATION: "Zone saturée",
};

export const SEVERITY_TONE: Record<AlertSeverity, "neutral" | "warning" | "danger"> = {
  INFO: "neutral",
  AVERTISSEMENT: "warning",
  CRITIQUE: "danger",
};

export function typeLabel(type: string): string {
  return NOTIFICATION_TYPE_LABEL[type as NotificationType] ?? "Notification";
}

/** « 3 notifications non lues », « 1 notification non lue », « Aucune notification non lue ». */
export function unreadAriaLabel(count: number): string {
  if (count <= 0) return "Aucune notification non lue";
  return `${count} notification${count >= 2 ? "s" : ""} non lue${count >= 2 ? "s" : ""}`;
}

/** Badge text: « 9+ » above 9. */
export function badgeText(count: number): string {
  return count > 9 ? "9+" : String(count);
}

/** Newest first, deduplicated, at most `limit` (used by the live push). */
export function mergeNotification(
  list: readonly NotificationResponse[],
  incoming: NotificationResponse,
  limit = 10,
): NotificationResponse[] {
  return [incoming, ...list.filter((n) => n.id !== incoming.id)].slice(0, limit);
}

export function markReadLocally(
  list: readonly NotificationResponse[],
  id: number,
  readAt: string,
): NotificationResponse[] {
  return list.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? readAt } : n));
}

export function unreadCount(list: readonly NotificationResponse[]): number {
  return list.filter((n) => n.readAt === null).length;
}
