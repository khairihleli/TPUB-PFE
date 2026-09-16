import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MapLegend } from "@/components/map/map-legend";
import { MapSearch } from "@/components/map/map-search";
import { NetworkMapClient } from "@/components/map/network-map-client";
import { PorteurCard } from "@/components/map/porteur-card";
import { PorteurList } from "@/components/map/porteur-list";
import type { NetworkMapProps } from "@/components/map/types";
import { detectWebGL } from "@/components/map/webgl";
import type { SupportResponse, ZoneResponse } from "@/lib/api/types";
import type { Selection } from "@/lib/network/selection";

const ZONES: ZoneResponse[] = [
  { id: 1, name: "Tunis Centre", latitude: 36.8, longitude: 10.18, radiusKm: 3, isActive: true },
  { id: 3, name: "Sfax Centre", latitude: 34.74, longitude: 10.76, radiusKm: 4, isActive: true },
];

const base = {
  diffusionCapacity: 1,
  mastHeightM: null,
  headingDeg: null,
  address: null,
} as const;

const SUPPORTS: SupportResponse[] = [
  {
    ...base,
    id: 11,
    zoneId: 1,
    zoneName: "Tunis Centre",
    name: "Écran LED Avenue Habib Bourguiba",
    supportType: "ECRAN",
    porteurType: "A",
    latitude: 36.7995,
    longitude: 10.1857,
    technicalStatus: "ACTIF",
    mastHeightM: 25,
    headingDeg: 45,
  },
  {
    ...base,
    id: 13,
    zoneId: 1,
    zoneName: "Tunis Centre",
    name: "Porteur relais Route de Bizerte",
    supportType: "POINT_WIFI",
    porteurType: "D",
    latitude: 37.27,
    longitude: 9.87,
    technicalStatus: "ACTIF",
  },
  {
    ...base,
    id: 31,
    zoneId: 3,
    zoneName: "Sfax Centre",
    name: "Rond-point Sfax El Jadida",
    supportType: "ECRAN",
    porteurType: null,
    latitude: 34.745,
    longitude: 10.755,
    technicalStatus: "MAINTENANCE",
  },
];

function renderMap(props: Partial<NetworkMapProps> = {}) {
  return render(
    <NetworkMapClient
      zones={ZONES}
      supports={SUPPORTS}
      mode="explore"
      forceFallback
      height="600px"
      {...props}
    />,
  );
}

describe("detectWebGL", () => {
  it("is false in jsdom (no noise, no throw)", () => {
    expect(detectWebGL()).toBe(false);
  });
});

describe("NetworkMapClient — SVG fallback", () => {
  it("renders the fallback notice, the region and accessible Porteur markers", () => {
    renderMap();
    const region = screen.getByRole("region", { name: "Carte du réseau TPUB" });
    expect(region).toHaveAttribute("data-map-engine", "svg");
    expect(screen.getByText("Carte simplifiée (WebGL indisponible)")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Porteur Type A — Écran LED Avenue Habib Bourguiba — Actif",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Porteur Type A (typologie estimée) — Rond-point Sfax El Jadida — Maintenance",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 Porteurs affichés sur 3")).toBeInTheDocument();
    expect(screen.queryByText(/masqués? par les filtres/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Recentrer : tous les Porteurs" }).length).toBe(1);
    // reduced tool set: no zoom / measure / basemap in the fallback
    expect(screen.queryByRole("button", { name: "Zoom avant" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mesurer une distance" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Zone de chalandise" }).length).toBeGreaterThan(0);
    // the existing SVG map is reused
    expect(region.querySelector("svg")).not.toBeNull();
  });

  it("opens the Porteur on click in explore mode and shows the mini card on focus", () => {
    const onOpenPorteur = vi.fn();
    renderMap({ onOpenPorteur });
    const marker = screen.getByRole("button", { name: /Écran LED Avenue Habib Bourguiba/ });
    fireEvent.focus(marker);
    const card = screen.getByRole("group", { name: "Aperçu : Écran LED Avenue Habib Bourguiba" });
    expect(within(card).getByText("25 m · Majeur")).toBeInTheDocument();
    expect(within(card).getByText("Écran 360°, face principale orientée NE")).toBeInTheDocument();
    fireEvent.click(marker);
    expect(onOpenPorteur).toHaveBeenCalledWith(11);
  });

  it("select mode: card action adds a bookable Porteur, never a type D", () => {
    const onSelectionChange = vi.fn<(s: Selection) => void>();
    renderMap({ mode: "select", onSelectionChange, onOpenPorteur: vi.fn() });
    fireEvent.mouseEnter(
      screen.getByRole("button", { name: /Avenue Habib Bourguiba/ }).parentElement as HTMLElement,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ajouter à la sélection" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith({ zoneIds: [], supportIds: [11] });

    fireEvent.mouseEnter(
      screen.getByRole("button", { name: /Route de Bizerte/ }).parentElement as HTMLElement,
    );
    const card = screen.getByRole("group", { name: /Route de Bizerte/ });
    expect(within(card).getByRole("button", { name: "Ajouter à la sélection" })).toBeDisabled();
    expect(within(card).getByText(/type D/)).toBeInTheDocument();
  });

  it("select mode without onOpenPorteur toggles on marker click (uncontrolled)", () => {
    renderMap({ mode: "select" });
    fireEvent.click(screen.getByRole("button", { name: /Avenue Habib Bourguiba — Actif$/ }));
    expect(
      screen.getByRole("button", { name: /Avenue Habib Bourguiba — Actif — sélectionné/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 sélectionné")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Effacer" }));
    expect(screen.queryByText("1 sélectionné")).not.toBeInTheDocument();
  });

  it("select mode: zone button toggles the zone with its bookable Porteurs", () => {
    const onSelectionChange = vi.fn<(s: Selection) => void>();
    renderMap({ mode: "select", onSelectionChange, selection: { zoneIds: [], supportIds: [] } });
    fireEvent.click(screen.getByRole("button", { name: /^Zone Tunis Centre/ }));
    expect(onSelectionChange).toHaveBeenCalledWith({ zoneIds: [1], supportIds: [11] });
  });

  it("filters update the counter", () => {
    renderMap();
    fireEvent.click(screen.getByRole("button", { name: "Filtres" }));
    const panel = screen.getByRole("region", { name: "Filtres" });
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Réservables uniquement" }));
    expect(screen.getAllByText("1 Porteur affiché sur 3").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Filtres (1 actif)" })).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Réinitialiser" }));
    expect(screen.getAllByText("3 Porteurs affichés sur 3").length).toBeGreaterThan(0);
  });

  it("says how many Porteurs the filters hide, with « Tout afficher »", () => {
    const onFiltersChange = vi.fn();
    renderMap({
      filters: { types: ["A"], statuses: ["ACTIF"], bookableOnly: false },
      onFiltersChange,
    });
    expect(screen.getByText("1 Porteur affiché sur 3")).toBeInTheDocument();
    expect(screen.getByText("2 masqués par les filtres")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Porteur Type/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Tout afficher" }));
    expect(onFiltersChange).toHaveBeenLastCalledWith({
      types: [],
      statuses: [],
      bookableOnly: false,
    });
    expect(screen.getByText("3 Porteurs affichés sur 3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tout afficher" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Porteur Type/ })).toHaveLength(3);
  });

  it("shows every status and type by default (maintenance, hors ligne, inactif, type D)", () => {
    const statuses = ["MAINTENANCE", "HORS_LIGNE", "INACTIF"] as const;
    const extra: SupportResponse[] = statuses.map((technicalStatus, i) => ({
      ...(SUPPORTS[0] as SupportResponse),
      id: 60 + i,
      name: `Porteur ${technicalStatus}`,
      porteurType: "D",
      latitude: 33.5 + i * 0.6,
      longitude: 9 + i * 0.4,
      technicalStatus,
    }));
    renderMap({ supports: [...SUPPORTS, ...extra] });
    expect(screen.getByText("6 Porteurs affichés sur 6")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Porteur MAINTENANCE — Maintenance/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Porteur HORS_LIGNE — Hors ligne/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Porteur INACTIF — Inactif/ })).toBeInTheDocument();
  });

  it("Escape closes an open panel; L opens the legend", () => {
    renderMap();
    const region = screen.getByRole("region", { name: "Carte du réseau TPUB" });
    fireEvent.keyDown(region, { key: "l" });
    expect(screen.getByRole("region", { name: "Légende" })).toBeInTheDocument();
    fireEvent.keyDown(region, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Légende" })).not.toBeInTheDocument();
  });

  it("admin: « Placer un Porteur » then click on the map calls onPlacePoint with coordinates", () => {
    const onPlacePoint = vi.fn();
    const { container } = renderMap({ mode: "admin", onPlacePoint });
    const [placeButton] = screen.getAllByRole("button", { name: "Placer un Porteur" });
    fireEvent.click(placeButton as HTMLElement);
    expect(
      screen.getByText("Cliquez sur la carte pour placer le nouveau Porteur."),
    ).toBeInTheDocument();
    const frame = container.querySelector<HTMLElement>("[data-map-frame]");
    expect(frame).not.toBeNull();
    if (!frame) return;
    frame.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 300,
      height: 548,
      right: 300,
      bottom: 548,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.click(frame, { clientX: 150, clientY: 274 });
    expect(onPlacePoint).toHaveBeenCalledTimes(1);
    const point = onPlacePoint.mock.calls[0]?.[0] as { lng: number; lat: number };
    expect(point.lat).toBeGreaterThan(30);
    expect(point.lat).toBeLessThan(38);
    expect(point.lng).toBeGreaterThan(7);
    expect(point.lng).toBeLessThan(12);
    // the tool turns itself off
    expect(
      screen.queryByText("Cliquez sur la carte pour placer le nouveau Porteur."),
    ).not.toBeInTheDocument();
  });

  it("search finds a Porteur and opens its card", async () => {
    vi.useFakeTimers();
    try {
      renderMap();
      const input = screen.getByRole("combobox", { name: "Rechercher sur la carte" });
      fireEvent.change(input, { target: { value: "bourg" } });
      const option = screen.getByRole("option", { name: /Écran LED Avenue Habib Bourguiba/ });
      fireEvent.mouseDown(option);
      expect(
        screen.getByRole("group", { name: "Aperçu : Écran LED Avenue Habib Bourguiba" }),
      ).toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("the list tool lists visible Porteurs", () => {
    const onOpenPorteur = vi.fn();
    renderMap({ onOpenPorteur });
    const [listButton] = screen.getAllByRole("button", { name: "Liste des Porteurs" });
    fireEvent.click(listButton as HTMLElement);
    const list = screen.getByRole("list", { name: "Porteurs affichés sur la carte" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(within(list).getByRole("button", { name: "Ouvrir Rond-point Sfax El Jadida" }));
    expect(onOpenPorteur).toHaveBeenCalledWith(31);
  });

  it("catchment in the fallback: select bookable Porteurs within the radius", () => {
    const onSelectionChange = vi.fn<(s: Selection) => void>();
    const { container } = renderMap({ mode: "select", onSelectionChange });
    const [tool] = screen.getAllByRole("button", { name: "Zone de chalandise" });
    fireEvent.click(tool as HTMLElement);
    const frame = container.querySelector<HTMLElement>("[data-map-frame]");
    if (!frame) throw new Error("frame");
    frame.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 300,
      height: 548,
      right: 300,
      bottom: 548,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    // Tunis Centre in viewBox space (see network-map-fallback projection)
    fireEvent.click(frame, { clientX: 190, clientY: 57 });
    const panel = screen.getByRole("region", { name: "Zone de chalandise" });
    fireEvent.change(within(panel).getByRole("slider", { name: "Rayon" }), {
      target: { value: "5" },
    });
    expect(within(panel).getByRole("button", { name: "5 km", pressed: true })).toBeInTheDocument();
    expect(
      within(panel).getByText(/1 Porteur dans ce rayon, dont 1 réservable/),
    ).toBeInTheDocument();
    const cta = within(panel).getByRole("button", {
      name: "Sélectionner les Porteurs réservables dans ce rayon (1)",
    });
    fireEvent.click(cta);
    expect(onSelectionChange).toHaveBeenLastCalledWith({ zoneIds: [], supportIds: [11] });
  });
});

/** Porteurs of Grand Tunis a few hundred metres apart: they pile up on the country map. */
const TUNIS_DENSE: SupportResponse[] = [
  { ...(SUPPORTS[0] as SupportResponse) },
  {
    ...(SUPPORTS[0] as SupportResponse),
    id: 12,
    name: "Totem Place Barcelone",
    porteurType: "C",
    latitude: 36.7951,
    longitude: 10.1806,
  },
  {
    ...(SUPPORTS[0] as SupportResponse),
    id: 14,
    name: "Écran Promenade du Lac 2",
    porteurType: "B",
    latitude: 36.8455,
    longitude: 10.2721,
  },
  {
    ...(SUPPORTS[0] as SupportResponse),
    id: 15,
    name: "Écran Corniche de La Marsa",
    porteurType: "C",
    latitude: 36.8849,
    longitude: 10.3301,
    technicalStatus: "MAINTENANCE",
  },
  SUPPORTS[2] as SupportResponse,
];

describe("NetworkMapClient — every Porteur at its exact position", () => {
  it("never groups Porteurs by default: one accessible marker per Porteur", () => {
    renderMap({ supports: TUNIS_DENSE });
    expect(screen.queryByRole("button", { name: /^Groupe de/ })).not.toBeInTheDocument();
    for (const s of TUNIS_DENSE) {
      expect(screen.getByRole("button", { name: new RegExp(`— ${s.name} —`) })).toBeInTheDocument();
    }
    expect(screen.getByText("5 Porteurs affichés sur 5")).toBeInTheDocument();
  });

  it("draws piled-up Porteurs in a « Vue rapprochée — Grand Tunis » inset, like the dashboard map", () => {
    renderMap({ supports: TUNIS_DENSE });
    const inset = screen.getByRole("region", {
      name: /^Vue rapprochée — Grand Tunis : 4 Porteurs/,
    });
    expect(within(inset).getAllByRole("button", { name: /^Porteur Type/ })).toHaveLength(4);
    // Sfax stays on the country map
    expect(within(inset).queryByRole("button", { name: /Sfax/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rond-point Sfax El Jadida/ })).toBeInTheDocument();
  });

  it("fans out overlapping markers with a leader line to the exact position", () => {
    const twins: SupportResponse[] = [
      SUPPORTS[2] as SupportResponse,
      {
        ...(SUPPORTS[2] as SupportResponse),
        id: 32,
        name: "Totem Sfax Bab Bhar",
        latitude: 34.7452,
      },
      SUPPORTS[0] as SupportResponse,
    ];
    const onOpenPorteur = vi.fn();
    const { container } = renderMap({ supports: twins, onOpenPorteur });
    const a = screen.getByRole("button", { name: /Rond-point Sfax El Jadida/ });
    const b = screen.getByRole("button", { name: /Totem Sfax Bab Bhar/ });
    const groupOf = (el: HTMLElement) =>
      el.closest("[data-spider-group]")?.getAttribute("data-spider-group");
    expect(groupOf(a)).toBe("spider-31.32");
    expect(groupOf(b)).toBe("spider-31.32");
    // Bourguiba is alone: drawn exactly on its point
    expect(groupOf(screen.getByRole("button", { name: /Avenue Habib Bourguiba/ }))).toBeUndefined();
    expect(container.querySelectorAll("[data-spider-leg]")).toHaveLength(2);
    // both fanned markers keep the exact position as anchor and move by a px offset
    const wrapperA = a.closest("[data-spider-group]")?.parentElement as HTMLElement;
    const wrapperB = b.closest("[data-spider-group]")?.parentElement as HTMLElement;
    expect(wrapperA.style.transform).not.toBe(wrapperB.style.transform);
    expect(wrapperA.style.transform).toMatch(
      /^translate\(calc\(-50% \+ -?[\d.]+px\), calc\(-50% \+ -?[\d.]+px\)\)$/,
    );
    // a fanned marker behaves like any marker
    fireEvent.click(b);
    expect(onOpenPorteur).toHaveBeenCalledWith(32);
  });

  it("« Regrouper les Porteurs proches » is an opt-in layer toggle (controlled)", () => {
    const onClusterPorteursChange = vi.fn();
    const { rerender } = renderMap({ supports: TUNIS_DENSE, onClusterPorteursChange });
    fireEvent.click(screen.getAllByRole("button", { name: "Couches" })[0] as HTMLElement);
    const layers = screen.getByRole("region", { name: "Couches" });
    const toggle = within(layers).getByRole("checkbox", { name: /Regrouper les Porteurs proches/ });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(onClusterPorteursChange).toHaveBeenLastCalledWith(true);
    expect(
      screen.getAllByRole("button", { name: /^Groupe de \d Porteurs/ }).length,
    ).toBeGreaterThan(0);
    rerender(
      <NetworkMapClient
        zones={ZONES}
        supports={TUNIS_DENSE}
        mode="explore"
        forceFallback
        height="600px"
        clusterPorteurs={false}
        onClusterPorteursChange={onClusterPorteursChange}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Groupe de/ })).not.toBeInTheDocument();
  });
});

describe("reusable pieces", () => {
  it("MapSearch supports keyboard navigation", () => {
    const onSelect = vi.fn();
    render(<MapSearch zones={ZONES} supports={SUPPORTS} onSelect={onSelect} />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "centre" } });
    expect(input).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toMatch(/opt-0$/);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toMatch(/opt-1$/);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getAllByRole("option").at(-1)).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ kind: "zone" }));
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.getByText("Aucun résultat pour « zzz »")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("PorteurCard shows the exact coordinates, copy and OpenStreetMap actions", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<PorteurCard support={SUPPORTS[0] as SupportResponse} />);
    expect(screen.getByText("36,7995° N", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("10,1857° E", { selector: "dd" })).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Copier les coordonnées du Porteur Écran LED Avenue Habib Bourguiba",
      }),
    );
    expect(writeText).toHaveBeenCalledWith("36.79950, 10.18570");
    expect(await screen.findByText("Coordonnées copiées : 36.79950, 10.18570")).toBeInTheDocument();
    const osm = screen.getByRole("link", { name: /Ouvrir dans OpenStreetMap.*\(nouvel onglet\)/ });
    expect(osm).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/?mlat=36.7995&mlon=10.1857#map=18/36.7995/10.1857",
    );
    expect(osm).toHaveAttribute("target", "_blank");
    expect(osm.getAttribute("rel")).toContain("noopener");
  });

  it("PorteurCard shows estimated typology and block reason", () => {
    render(<PorteurCard support={SUPPORTS[2] as SupportResponse} />);
    expect(screen.getByText("Typologie estimée")).toBeInTheDocument();
    expect(screen.getByText(/maintenance : réservation indisponible/)).toBeInTheDocument();
    expect(screen.getAllByText("Non déclarée", { selector: "dd" })).toHaveLength(2);
  });

  it("PorteurList renders an empty state and actions", () => {
    const { rerender } = render(<PorteurList label="Liste" items={[]} emptyText="Rien" />);
    expect(screen.getByText("Rien")).toBeInTheDocument();
    const onToggleSelect = vi.fn();
    rerender(
      <PorteurList
        label="Liste"
        items={SUPPORTS.map((support) => ({ support }))}
        selectedIds={[11]}
        onToggleSelect={onToggleSelect}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "Retirer Écran LED Avenue Habib Bourguiba de la sélection",
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", {
        name: "Ajouter Porteur relais Route de Bizerte à la sélection",
      }),
    ).toBeDisabled();
    // « zone · adresse » line (zone alone without address), no raw coordinates by default
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[2] as HTMLElement).getByText("Sfax Centre")).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).queryByText(/36[.,]7995/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Ouvrir le Studio 3D/ })).toBeNull();
  });

  it("PorteurList: explicit Studio 3D button, place line with title, opt-in French coordinates", () => {
    const onOpenStudio = vi.fn();
    const withAddress = {
      ...(SUPPORTS[0] as SupportResponse),
      address: "Avenue Habib Bourguiba, Tunis",
    };
    render(
      <PorteurList
        label="Liste"
        items={[{ support: withAddress }, { support: SUPPORTS[2] as SupportResponse }]}
        onOpen={vi.fn()}
        onOpenStudio={onOpenStudio}
        showCoordinates
      />,
    );
    for (const s of [withAddress, SUPPORTS[2] as SupportResponse]) {
      expect(
        screen.getByRole("button", { name: `Ouvrir le Studio 3D : ${s.name}` }),
      ).toBeInTheDocument();
    }
    fireEvent.click(
      screen.getByRole("button", { name: "Ouvrir le Studio 3D : Rond-point Sfax El Jadida" }),
    );
    expect(onOpenStudio).toHaveBeenCalledWith(31);
    const rows = screen.getAllByRole("listitem");
    const place = within(rows[0] as HTMLElement).getByText(
      "Tunis Centre · Avenue Habib Bourguiba, Tunis",
    );
    expect(place.closest("[title]")).toHaveAttribute(
      "title",
      "Tunis Centre · Avenue Habib Bourguiba, Tunis",
    );
    expect(
      within(rows[0] as HTMLElement).getByText("36,7995° N · 10,1857° E", { exact: false }),
    ).toBeInTheDocument();
  });

  it("MapLegend carries the design-intention mention", () => {
    const { rerender } = render(<MapLegend show3d />);
    expect(screen.getByText(/position exacte/)).toBeInTheDocument();
    expect(screen.queryByText(/Groupe de Porteurs/)).not.toBeInTheDocument();
    rerender(<MapLegend show3d showClusters />);
    expect(screen.getByText(/Groupe de Porteurs/)).toBeInTheDocument();
    expect(screen.getByText(/intention de conception/)).toBeInTheDocument();
    expect(screen.getByText("Type D · Sans écran")).toBeInTheDocument();
    expect(screen.getByText(/Colonne 3D/)).toBeInTheDocument();
  });
});
