import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as Endpoints from "@/lib/api/endpoints";

import type * as EspaceData from "@/components/espace/espace-data";
import { campaign } from "@/components/espace/__tests__/fixtures";
import type { NetworkMapProps } from "@/components/map/types";
import { ToastProvider } from "@/components/ui/toast";
import type { SessionUser } from "@/lib/api/types";
import { support, zone } from "@/lib/network/__tests__/fixtures";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  search: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: nav.back }),
  usePathname: () => "/espace/reseau",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

const loaders = vi.hoisted(() => ({ loadNetworkCatalogue: vi.fn() }));
vi.mock("@/components/espace/espace-data", async (importOriginal) => {
  const actual = await importOriginal<typeof EspaceData>();
  return { ...actual, ...loaders };
});

const api = vi.hoisted(() => ({ mine: vi.fn(), availability: vi.fn() }));
vi.mock("@/lib/api/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof Endpoints>();
  return {
    ...actual,
    campaignsApi: { ...actual.campaignsApi, mine: api.mine },
    supportsApi: { ...actual.supportsApi, availability: api.availability },
  };
});

const mapProps = vi.hoisted(() => ({ last: null as NetworkMapProps | null }));
vi.mock("@/components/map", () => ({
  NetworkMap: (props: NetworkMapProps) => {
    mapProps.last = props;
    return <div data-testid="carte">{props.supports.length} Porteurs sur la carte</div>;
  },
}));
vi.mock("@/components/porteur3d/porteur-studio", () => ({
  PorteurStudio: ({ view, timeOfDay }: { view: string; timeOfDay: string }) => (
    <div data-testid="studio">
      {view} · {timeOfDay}
    </div>
  ),
}));

const user: SessionUser = {
  email: "demo@annonceur.tn",
  nom: "Démo",
  role: "ANNONCEUR",
  userId: 3,
  exp: 1_900_000_000,
};
vi.mock("@/components/shell/session-provider", () => ({
  useSession: () => ({ user, role: user.role }),
}));

import { NetworkExplorer } from "@/components/network/network-explorer";

const ZONES = [zone({ id: 1, name: "Tunis Centre" }), zone({ id: 2, name: "Sfax Centre" })];
const SUPPORTS = [
  support({ id: 11, zoneId: 1, name: "Écran LED Avenue Habib Bourguiba", porteurType: "A" }),
  support({ id: 12, zoneId: 1, name: "Porteur relais Route de Bizerte", porteurType: "D" }),
  support({
    id: 21,
    zoneId: 2,
    zoneName: "Sfax Centre",
    name: "Rond-point Sfax El Jadida",
    porteurType: "A",
  }),
];

function renderExplorer() {
  return render(
    <ToastProvider>
      <NetworkExplorer />
    </ToastProvider>,
  );
}

beforeEach(() => {
  nav.replace.mockReset();
  nav.push.mockReset();
  nav.back.mockReset();
  nav.search = "";
  window.localStorage.clear();
  mapProps.last = null;
  loaders.loadNetworkCatalogue.mockReset().mockResolvedValue({ zones: ZONES, supports: SUPPORTS });
  api.mine.mockReset().mockResolvedValue([campaign({ id: 5, name: "Rentrée" })]);
  api.availability.mockReset().mockResolvedValue([]);
});

describe("NetworkExplorer", () => {
  it("renders the header, the map and the synced side panel", async () => {
    renderExplorer();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Réseau & Studio 3D" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Espace annonceur")).toBeNull();
    expect(screen.getByTestId("carte")).toHaveTextContent("3 Porteurs sur la carte");
    const panel = screen.getByRole("complementary", { name: "Panneau du réseau" });
    const list = within(panel).getByRole("list", { name: "Porteurs du réseau" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    // Studio discoverability: one explicit button per row, no raw coordinates for advertisers
    for (const s of SUPPORTS) {
      expect(
        within(list).getByRole("button", { name: `Ouvrir le Studio 3D : ${s.name}` }),
      ).toBeInTheDocument();
    }
    expect(list.querySelector("[data-porteur-position]")).toBeNull();
    expect(mapProps.last?.mode).toBe("select");
    // campaigns are not fetched until a booking surface opens
    expect(api.mine).not.toHaveBeenCalled();

    // list hover → map highlight
    fireEvent.mouseEnter(within(list).getAllByRole("listitem")[0] as HTMLElement);
    await waitFor(() => expect(mapProps.last?.highlightSupportId).toBe(11));

    // type filter in the panel is pushed to the map
    fireEvent.click(within(panel).getByRole("button", { name: /Type D/ }));
    await waitFor(() => expect(mapProps.last?.filters?.types).toEqual(["D"]));
    expect(within(panel).getByRole("list", { name: "Porteurs du réseau" }).children).toHaveLength(
      1,
    );
  });

  it("pushes ?porteur= when a Porteur is opened, replaces ?fond= / ?vue= from the map", async () => {
    renderExplorer();
    const panel = await screen.findByRole("complementary", { name: "Panneau du réseau" });
    fireEvent.click(
      within(panel).getByRole("button", {
        name: "Ouvrir le Studio 3D : Rond-point Sfax El Jadida",
      }),
    );
    expect(nav.push).toHaveBeenLastCalledWith("/espace/reseau?porteur=21", { scroll: false });
    expect(nav.replace).not.toHaveBeenCalled();

    mapProps.last?.onBasemapChange?.("satellite");
    // chained on the last write (the mocked router never commits the URL)
    expect(nav.replace).toHaveBeenLastCalledWith("/espace/reseau?porteur=21&fond=satellite", {
      scroll: false,
    });
    mapProps.last?.onViewModeChange?.("3d");
    expect(nav.replace).toHaveBeenLastCalledWith(
      "/espace/reseau?porteur=21&fond=satellite&vue=3d",
      { scroll: false },
    );
  });

  it("opens the studio sheet from the URL and passes vue/fond to the map", async () => {
    nav.search = "porteur=11&vue=3d&fond=clair&zone=1";
    renderExplorer();
    const dialog = await screen.findByRole("dialog", { name: "Écran LED Avenue Habib Bourguiba" });
    expect(within(dialog).getByTestId("studio")).toHaveTextContent("orbite · jour");
    expect(mapProps.last).toMatchObject({ viewMode: "3d", basemap: "clair", activeZoneId: 1 });
    await waitFor(() => expect(api.mine).toHaveBeenCalledTimes(1));
    expect(await within(dialog).findByRole("radio", { name: /Rentrée/ })).toBeInTheDocument();

    // Campaign first, stable « Ajouter à la sélection » toggle, canvas pans the page on mobile
    const sections = within(dialog)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    expect(sections.slice(0, 2)).toEqual(["Campagne", "Créneau"]);
    const toggles = within(dialog).getAllByRole("button", { name: "Ajouter à la sélection" });
    expect(toggles[0]).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggles[0] as HTMLElement);
    for (const t of within(dialog).getAllByRole("button", { name: "Ajouter à la sélection" })) {
      expect(t).toHaveAttribute("aria-pressed", "true");
    }
    const preview = dialog.querySelector("[data-studio-preview]");
    expect(preview).toHaveClass("max-md:touch-pan-y");
    fireEvent.click(within(dialog).getByRole("button", { name: "Toucher pour explorer en 3D" }));
    expect(preview).toHaveClass("max-md:touch-none");
    fireEvent.click(within(dialog).getByRole("button", { name: "Terminer" }));
    expect(preview).toHaveClass("max-md:touch-pan-y");

    // Deep link: closing replaces (no history entry to go back to)
    fireEvent.click(within(dialog).getByRole("button", { name: "Fermer le studio" }));
    expect(nav.back).not.toHaveBeenCalled();
    expect(nav.replace).toHaveBeenLastCalledWith("/espace/reseau?vue=3d&fond=clair&zone=1", {
      scroll: false,
    });
  });

  it("closes a Studio opened in this session with history back (Escape and X share the path)", async () => {
    const view = renderExplorer();
    const panel = await screen.findByRole("complementary", { name: "Panneau du réseau" });
    fireEvent.click(
      within(panel).getByRole("button", {
        name: "Ouvrir le Studio 3D : Écran LED Avenue Habib Bourguiba",
      }),
    );
    expect(nav.push).toHaveBeenCalledWith("/espace/reseau?porteur=11", { scroll: false });

    // Simulate Next committing the pushed URL
    nav.search = "porteur=11";
    view.rerender(
      <ToastProvider>
        <NetworkExplorer />
      </ToastProvider>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Écran LED Avenue Habib Bourguiba" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(nav.back).toHaveBeenCalledTimes(1);
    expect(nav.replace).not.toHaveBeenCalledWith("/espace/reseau", { scroll: false });
  });

  it("shows the first-visit Studio hint until dismissed", async () => {
    renderExplorer();
    const hint = await screen.findByText(/Touchez un Porteur pour le voir en 3D et le réserver/);
    expect(hint).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Masquer l'astuce" }));
    expect(screen.queryByText(/Touchez un Porteur pour le voir en 3D et le réserver/)).toBeNull();
  });

  it("builds a selection from the zones tab and opens the booking dialog", async () => {
    renderExplorer();
    const panel = await screen.findByRole("complementary", { name: "Panneau du réseau" });
    fireEvent.mouseDown(within(panel).getByRole("tab", { name: /Zones/ }));
    fireEvent.click(
      within(panel).getByRole("button", {
        name: "Sélectionner les Porteurs réservables de Tunis Centre",
      }),
    );
    // only the bookable Porteur of the zone (type D is excluded)
    await waitFor(() => expect(mapProps.last?.selection?.supportIds).toEqual([11]));
    expect(within(panel).getByText("1 Porteur dans 1 zone")).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "Réserver la sélection" }));
    const dialog = await screen.findByRole("dialog", { name: "Réserver la sélection" });
    expect(await within(dialog).findByText("Prêt à réserver")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Réserver 1 Porteur" })).toBeEnabled();
  });

  it("shows the empty state when no zone is open", async () => {
    loaders.loadNetworkCatalogue.mockResolvedValue({ zones: [], supports: [] });
    renderExplorer();
    expect(await screen.findByText("Aucune zone ouverte pour le moment.")).toBeInTheDocument();
  });
});
