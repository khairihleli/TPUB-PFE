import { describe, expect, it } from "vitest";

import {
  badgeText,
  markReadLocally,
  mergeNotification,
  typeLabel,
  unreadAriaLabel,
  unreadCount,
} from "@/components/notifications/notification-model";
import type { NotificationResponse } from "@/lib/api/types-supervision";

function notification(id: number, readAt: string | null = null): NotificationResponse {
  return {
    id,
    type: "SUPPORT_OFFLINE",
    severity: "CRITIQUE",
    title: `Alerte ${id}`,
    message: "Écran silencieux",
    link: "/admin/supervision",
    entityType: "SUPPORT",
    entityId: "7",
    createdAt: "2026-09-16T10:00:00Z",
    readAt,
  };
}

describe("notification model", () => {
  it("labels the known types and falls back for the others", () => {
    expect(typeLabel("ZONE_SATURATION")).toBe("Zone saturée");
    expect(typeLabel("AUTRE_CHOSE")).toBe("Notification");
  });

  it("announces the unread count", () => {
    expect(unreadAriaLabel(0)).toBe("Aucune notification non lue");
    expect(unreadAriaLabel(1)).toBe("1 notification non lue");
    expect(unreadAriaLabel(3)).toBe("3 notifications non lues");
    expect(badgeText(3)).toBe("3");
    expect(badgeText(12)).toBe("9+");
  });

  it("merges a pushed notification newest first without duplicates", () => {
    const list = [notification(1), notification(2)];
    expect(mergeNotification(list, notification(3)).map((n) => n.id)).toEqual([3, 1, 2]);
    expect(mergeNotification(list, notification(2)).map((n) => n.id)).toEqual([2, 1]);
    expect(mergeNotification(list, notification(3), 2).map((n) => n.id)).toEqual([3, 1]);
  });

  it("marks one notification as read and counts the rest", () => {
    const list = [notification(1), notification(2, "2026-09-16T11:00:00Z")];
    expect(unreadCount(list)).toBe(1);
    const next = markReadLocally(list, 1, "2026-09-16T12:00:00Z");
    expect(next[0]?.readAt).toBe("2026-09-16T12:00:00Z");
    expect(unreadCount(next)).toBe(0);
    // An already read notification keeps its first timestamp.
    expect(markReadLocally(next, 2, "2026-09-16T13:00:00Z")[1]?.readAt).toBe("2026-09-16T11:00:00Z");
  });
});
