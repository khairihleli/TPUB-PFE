import { describe, expect, it } from "vitest";

import {
  applyAlert,
  applyDiffusion,
  applyEmergency,
  applyPresence,
  emptySnapshot,
  filterSupports,
  pushFeed,
  recountStats,
  sinceLabel,
} from "@/components/supervision/supervision-model";
import type {
  DiffusionLiveEvent,
  EmergencyLiveEvent,
  SupervisionAlert,
  SupervisionSupportRow,
} from "@/lib/api/types-supervision";

function support(id: number, presence: SupervisionSupportRow["presence"]): SupervisionSupportRow {
  return {
    supportId: id,
    name: `Écran ${id}`,
    zoneId: 1,
    zoneName: "Tunis Centre",
    latitude: 36.8,
    longitude: 10.18,
    technicalStatus: "ACTIF",
    presence,
    lastHeartbeatAt: null,
    playerVersion: null,
    current: null,
  };
}

function diffusion(logId: number, supportId = 1): DiffusionLiveEvent {
  return {
    diffusionLogId: logId,
    supportId,
    supportName: `Écran ${supportId}`,
    zoneName: "Tunis Centre",
    contentType: "PUBLICITE",
    campaignId: 3,
    campaignName: "Collection",
    emergencyId: null,
    title: "Collection",
    diffusedAt: `2026-09-16T10:0${logId % 10}:00Z`,
  };
}

function alert(id: number, createdAt: string, resolvedAt: string | null = null): SupervisionAlert {
  return {
    id,
    type: "SUPPORT_OFFLINE",
    severity: "CRITIQUE",
    title: `Alerte ${id}`,
    message: "Écran silencieux",
    supportId: 1,
    zoneId: null,
    emergencyId: null,
    campaignId: null,
    createdAt,
    resolvedAt,
    acknowledgedAt: null,
    acknowledgedByName: null,
  };
}

function emergency(id: number, state: EmergencyLiveEvent["state"]): EmergencyLiveEvent {
  return {
    emergencyId: id,
    title: "Route fermée",
    urgencyLevel: "CRITICAL",
    state,
    approvalStatus: state === "EN_ATTENTE_APPROBATION" ? "EN_ATTENTE" : "APPROUVE",
    approvalsCount: 1,
    approvalsRequired: 2,
    affectedSupports: 4,
  };
}

describe("supervision live merge", () => {
  it("applies a presence event to the right Porteur only", () => {
    const rows = [support(1, "INCONNU"), support(2, "EN_LIGNE")];
    const next = applyPresence(rows, {
      supportId: 1,
      presence: "EN_LIGNE",
      lastHeartbeatAt: "2026-09-16T10:00:00Z",
      changedAt: "2026-09-16T10:00:00Z",
    });
    expect(next[0]?.presence).toBe("EN_LIGNE");
    expect(next[0]?.lastHeartbeatAt).toBe("2026-09-16T10:00:00Z");
    expect(next[1]).toEqual(rows[1]);
    expect(applyPresence(rows, {
      supportId: 99,
      presence: "HORS_LIGNE",
      lastHeartbeatAt: null,
      changedAt: "2026-09-16T10:00:00Z",
    })).toEqual(rows);
  });

  it("shows the current content of a Porteur", () => {
    const next = applyDiffusion([support(1, "EN_LIGNE")], diffusion(7));
    expect(next[0]?.current).toEqual({
      contentType: "PUBLICITE",
      title: "Collection",
      campaignId: 3,
      emergencyId: null,
      diffusedAt: "2026-09-16T10:07:00Z",
    });
  });

  it("keeps the feed newest first, deduplicated and capped", () => {
    let feed = pushFeed([], diffusion(1), 3);
    feed = pushFeed(feed, diffusion(2), 3);
    feed = pushFeed(feed, diffusion(3), 3);
    feed = pushFeed(feed, diffusion(4), 3);
    expect(feed.map((f) => f.diffusionLogId)).toEqual([4, 3, 2]);
    expect(pushFeed(feed, diffusion(3), 3).map((f) => f.diffusionLogId)).toEqual([3, 4, 2]);
  });

  it("removes a resolved alert and sorts the open ones", () => {
    const open = applyAlert([], alert(1, "2026-09-16T09:00:00Z"));
    const both = applyAlert(open, alert(2, "2026-09-16T10:00:00Z"));
    expect(both.map((a) => a.id)).toEqual([2, 1]);
    expect(applyAlert(both, alert(2, "2026-09-16T10:00:00Z", "2026-09-16T10:05:00Z")).map((a) => a.id))
      .toEqual([1]);
  });

  it("keeps only the emergencies that can still reach a screen", () => {
    const live = applyEmergency([], emergency(5, "EN_ATTENTE_APPROBATION"));
    expect(live).toHaveLength(1);
    expect(applyEmergency(live, emergency(5, "EN_COURS"))[0]?.state).toBe("EN_COURS");
    expect(applyEmergency(live, emergency(5, "TERMINE"))).toHaveLength(0);
    expect(applyEmergency(live, emergency(5, "REFUSE"))).toHaveLength(0);
  });

  it("recounts the tiles from what the browser holds", () => {
    const rows = [support(1, "EN_LIGNE"), support(2, "HORS_LIGNE"), support(3, "INCONNU")];
    const stats = recountStats(emptySnapshot().stats, rows, [alert(1, "2026-09-16T09:00:00Z")], [
      emergency(5, "EN_COURS"),
      emergency(6, "PROGRAMME"),
    ]);
    expect(stats).toMatchObject({
      onlineSupports: 1,
      offlineSupports: 1,
      unknownSupports: 1,
      openAlerts: 1,
      activeEmergencies: 1,
    });
  });

  it("filters the Porteur table by presence and text", () => {
    const rows = [support(1, "EN_LIGNE"), support(2, "HORS_LIGNE")];
    expect(filterSupports(rows, "HORS_LIGNE", "")).toHaveLength(1);
    expect(filterSupports(rows, "tous", "écran 2")).toHaveLength(1);
    expect(filterSupports(rows, "tous", "écran 9")).toHaveLength(0);
    expect(filterSupports(rows, "tous", "tunis")).toHaveLength(2);
    expect(filterSupports(rows, "tous", "2")).toHaveLength(1);
  });

  it("says how long ago a heartbeat was seen", () => {
    const now = Date.parse("2026-09-16T10:00:00Z");
    expect(sinceLabel(null, now)).toBe("—");
    expect(sinceLabel("2026-09-16T09:59:48Z", now)).toBe("il y a 12 s");
    expect(sinceLabel("2026-09-16T09:56:00Z", now)).toBe("il y a 4 min");
    expect(sinceLabel("2026-09-16T08:00:00Z", now)).toBe("il y a 2 h");
    expect(sinceLabel("2026-09-14T08:00:00Z", now)).toBe("il y a 2 j");
    expect(sinceLabel("2026-09-16T10:00:05Z", now)).toBe("à l'instant");
  });
});
