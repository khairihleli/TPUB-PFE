import { describe, expect, it } from "vitest";

import {
  checkNetworkCoherence,
  COHERENCE_RULES,
  issuesFor,
} from "@/components/admin/network-coherence";
import {
  buildMoveProposal,
  buildRadiusProposal,
  clampRadiusKm,
  networkPageState,
  networkSummaryItems,
  parseNetworkView,
} from "@/components/admin/network-map-model";
import {
  supportFormAt,
  supportFormFrom,
  supportRequestFrom,
  supportSchema,
  zoneFormAt,
  zoneRequestFrom,
  zoneSchema,
} from "@/components/admin/network-schemas";
import { angleFromPointer } from "@/components/admin/orientation-dial";
import type { SupportResponse, ZoneResponse } from "@/lib/api/types";

const TUNIS: ZoneResponse = {
  id: 1,
  name: "Tunis Centre",
  latitude: 36.8,
  longitude: 10.18,
  radiusKm: 3,
  isActive: true,
};
const SFAX: ZoneResponse = {
  id: 3,
  name: "Sfax Centre",
  latitude: 34.74,
  longitude: 10.76,
  radiusKm: 4,
  isActive: true,
};
const EMPTY_INACTIVE: ZoneResponse = {
  id: 9,
  name: "Bizerte",
  latitude: 37.27,
  longitude: 9.87,
  radiusKm: 2,
  isActive: false,
};

function support(over: Partial<SupportResponse>): SupportResponse {
  return {
    id: 11,
    zoneId: 1,
    zoneName: "Tunis Centre",
    name: "Écran LED Avenue Habib Bourguiba",
    supportType: "ECRAN",
    latitude: 36.7995,
    longitude: 10.1857,
    technicalStatus: "ACTIF",
    diffusionCapacity: 1,
    porteurType: "A",
    mastHeightM: 25,
    headingDeg: 90,
    address: "Avenue Habib Bourguiba",
    ...over,
  };
}

const base = {
  zoneId: "1",
  name: "Porteur",
  supportType: "ECRAN",
  latitude: "36.8",
  longitude: "10.18",
  technicalStatus: "ACTIF",
  diffusionCapacity: "1",
};

describe("support schema — Porteur fields", () => {
  it("keeps the fields optional (undeclared → null) and trims the address", () => {
    const r = supportSchema.safeParse(base);
    expect(r.success && r.data).toMatchObject({
      porteurType: null,
      mastHeightM: null,
      headingDeg: null,
      address: "",
    });
  });

  it("maps declared values to the API body", () => {
    const r = supportSchema.safeParse({
      ...base,
      porteurType: "B",
      mastHeightM: "30",
      headingDeg: " 45 ",
      address: "  Corridor du Lac 2 ",
    });
    expect(r.success && r.data).toMatchObject({
      porteurType: "B",
      mastHeightM: 30,
      headingDeg: 45,
      address: "Corridor du Lac 2",
    });
  });

  it("rejects out-of-range values with French messages", () => {
    const r = supportSchema.safeParse({
      ...base,
      porteurType: "E",
      mastHeightM: "18",
      headingDeg: "360",
      address: "x".repeat(256),
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    const byPath = Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
    expect(byPath.porteurType).toMatch(/A, B, C ou D/);
    expect(byPath.mastHeightM).toMatch(/15, 20, 25 ou 30/);
    expect(byPath.headingDeg).toMatch(/0 \(nord\) à 359/);
    expect(byPath.address).toBe("255 caractères maximum.");
    expect(supportSchema.safeParse({ ...base, headingDeg: "12.5" }).success).toBe(false);
    expect(supportSchema.safeParse({ ...base, headingDeg: "0" }).success).toBe(true);
  });

  it("round-trips a response into form values", () => {
    expect(supportFormFrom(support({ headingDeg: 0 }))).toMatchObject({
      porteurType: "A",
      mastHeightM: "25",
      headingDeg: "0",
      address: "Avenue Habib Bourguiba",
    });
    expect(
      supportFormFrom(support({ porteurType: null, mastHeightM: null, address: null })),
    ).toMatchObject({
      porteurType: "",
      mastHeightM: "",
      address: "",
    });
  });

  it("prefills forms from a map point", () => {
    const v = supportFormAt({ lng: 10.123456789, lat: 36.987654321 }, 1);
    expect(v).toMatchObject({ zoneId: "1", latitude: "36.987654", longitude: "10.123457" });
    expect(supportFormAt({ lng: 1, lat: 2 }, null).zoneId).toBe("");
    const z = zoneFormAt({ lng: 10.2, lat: 36.9 });
    expect(zoneSchema.safeParse({ ...z, name: "Nouvelle" }).success).toBe(true);
    expect(z.radiusKm).toBe("2");
  });

  it("builds full PUT bodies with patches", () => {
    const body = supportRequestFrom(support({ mastHeightM: 17 }), { latitude: 36.81 });
    expect(body).toMatchObject({ latitude: 36.81, longitude: 10.1857, porteurType: "A" });
    expect(body.mastHeightM).toBeNull();
    expect(zoneRequestFrom(TUNIS, { radiusKm: 4.5 })).toEqual({
      name: "Tunis Centre",
      latitude: 36.8,
      longitude: 10.18,
      radiusKm: 4.5,
      isActive: true,
    });
  });
});

describe("coherence rules", () => {
  const supports: SupportResponse[] = [
    support({}),
    // outside Tunis radius, inside nothing
    support({ id: 12, name: "Porteur éloigné", latitude: 36.95, longitude: 10.4 }),
    // undeclared type + heading
    support({
      id: 13,
      name: "Totem",
      supportType: "PANNEAU_NUMERIQUE",
      porteurType: null,
      headingDeg: null,
    }),
    // D declared as ECRAN (no heading needed)
    support({ id: 14, name: "Relais", porteurType: "D", headingDeg: null }),
    // active Porteur in an inactive zone
    support({
      id: 15,
      name: "Borne Bizerte",
      zoneId: 9,
      zoneName: "Bizerte",
      latitude: 37.27,
      longitude: 9.87,
    }),
  ];
  const report = checkNetworkCoherence([TUNIS, SFAX, EMPTY_INACTIVE], supports);

  it("finds each rule with a precise target", () => {
    const keys = report.issues.map((i) => i.key);
    expect(keys).toContain("hors-rayon:support:12");
    expect(keys).toContain("declaration-incomplete:support:13");
    expect(keys).toContain("type-d-ecran:support:14");
    expect(keys).toContain("zone-vide:zone:3");
    expect(keys).toContain("zone-inactive-porteurs-actifs:zone:9");
    expect(keys).not.toContain("declaration-incomplete:support:14");
    expect(keys.some((k) => k.endsWith("support:11"))).toBe(false);
    expect(report.total).toBe(5);
  });

  it("orders groups by severity and explains the finding", () => {
    expect(report.groups.map((g) => g.rule.id)).toEqual(
      COHERENCE_RULES.map((r) => r.id).filter((id) => report.issues.some((i) => i.rule === id)),
    );
    expect(report.issues[0]?.severity).toBe("danger");
    const far = report.issues.find((i) => i.key === "hors-rayon:support:12");
    expect(far?.detail).toMatch(/km du centre de « Tunis Centre » \(rayon 3 km\)/);
    expect(far?.hint).toMatch(/Aucune zone ne contient ce point/);
    expect(report.issues.find((i) => i.key === "declaration-incomplete:support:13")?.detail).toBe(
      "Non déclaré : type de Porteur et orientation.",
    );
    expect(report.bySeverity).toEqual({ danger: 1, warning: 2, info: 2 });
    expect(issuesFor(report, "zone", 9)).toHaveLength(1);
  });

  it("reports a coherent network as empty", () => {
    const clean = checkNetworkCoherence([TUNIS], [support({})]);
    expect(clean.total).toBe(0);
    expect(clean.groups).toEqual([]);
  });
});

describe("admin map model", () => {
  it("describes a move with distance, rounding and zone change", () => {
    const p = buildMoveProposal(support({}), { lng: 10.760000049, lat: 34.7400001 }, [TUNIS, SFAX]);
    expect(p.to).toEqual({ lng: 10.76, lat: 34.74 });
    expect(p.distanceLabel).toMatch(/km$/);
    expect(p.leavesZone).toBe(true);
    expect(p.suggestedZone?.id).toBe(3);
    const small = buildMoveProposal(support({}), { lng: 10.1867, lat: 36.7995 }, [TUNIS]);
    expect(small.distanceLabel).toBe("89 m");
    expect(small.leavesZone).toBe(false);
  });

  it("clamps radii and lists Porteurs left outside", () => {
    expect(clampRadiusKm(0.01)).toBe(0.05);
    expect(clampRadiusKm(2.537)).toBe(2.55);
    expect(clampRadiusKm(900)).toBe(500);
    const r = buildRadiusProposal(TUNIS, 0.1, [support({}), support({ id: 2, zoneId: 3 })]);
    expect(r.toLabel).toBe("100 m");
    expect(r.fromLabel).toBe("3 km");
    expect(r.outside.map((s) => s.id)).toEqual([11]);
  });

  it("parses the view param (map first)", () => {
    expect(parseNetworkView(undefined)).toBe("carte");
    expect(parseNetworkView("tableau")).toBe("tableau");
    expect(parseNetworkView(["tableau"])).toBe("carte");
  });

  it("converts dial pointer offsets to compass headings", () => {
    expect(angleFromPointer(0, -10)).toBe(0);
    expect(angleFromPointer(10, 0)).toBe(90);
    expect(angleFromPointer(0, 10)).toBe(180);
    expect(angleFromPointer(-10, 0)).toBe(270);
    expect(angleFromPointer(10, -10)).toBe(45);
  });
});

describe("network admin page state and KPI tones", () => {
  it("opens the map for ?porteur= and ?panneau=coherence, the table for ?onglet= alone", () => {
    expect(networkPageState({ onglet: "ecrans", porteur: "12" })).toEqual({
      tab: "ecrans",
      view: "carte",
      supportId: 12,
      panel: null,
    });
    expect(networkPageState({ onglet: "ecrans", panneau: "coherence" })).toMatchObject({
      view: "carte",
      panel: "coherence",
    });
    expect(networkPageState({ onglet: "zones" })).toMatchObject({ tab: "zones", view: "tableau" });
    expect(networkPageState({})).toMatchObject({ view: "carte", supportId: null });
    expect(networkPageState({ porteur: "abc" }).supportId).toBeNull();
  });

  it("keeps KPI values neutral at zero and colours problems only above zero", () => {
    const zero = networkSummaryItems({
      activeZones: 0,
      zones: 0,
      active: 0,
      maintenance: 0,
      down: 0,
    });
    expect(zero.map((i) => i.tone)).toEqual(["neutral", "muted", "muted", "muted"]);
    expect(zero[1]?.label).toBe("Porteurs actifs");
    const some = networkSummaryItems({
      activeZones: 2,
      zones: 3,
      active: 5,
      maintenance: 1,
      down: 2,
    });
    expect(some.map((i) => i.tone)).toEqual(["neutral", "neutral", "warning", "danger"]);
  });
});
