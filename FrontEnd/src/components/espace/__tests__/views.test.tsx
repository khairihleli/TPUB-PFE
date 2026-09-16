import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { campaign, reservation, support, zone } from "@/components/espace/__tests__/fixtures";
import type * as EspaceData from "@/components/espace/espace-data";
import { ApiError } from "@/lib/api/errors";
import type { CampaignResponse, ReservationResponse, SessionUser } from "@/lib/api/types";
import { clearResourceCache } from "@/lib/resource-cache";

const loaders = vi.hoisted(() => ({
  loadMyCampaigns: vi.fn(),
  loadReservationsSettled: vi.fn(),
  loadNetworkLookups: vi.fn(),
  loadNetworkCatalogue: vi.fn(),
}));

vi.mock("@/components/espace/espace-data", async (importOriginal) => {
  const actual = await importOriginal<typeof EspaceData>();
  return { ...actual, ...loaders };
});

const nav = vi.hoisted(() => ({
  params: { value: "" },
  pathname: { value: "/espace" },
  router: { replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.params.value),
  usePathname: () => nav.pathname.value,
  useRouter: () => nav.router,
}));

const user: SessionUser = {
  email: "sami@exemple.tn",
  nom: "Sami Ben Salah",
  role: "ANNONCEUR",
  userId: 7,
  exp: 1_900_000_000,
};

vi.mock("@/components/shell/session-provider", () => ({
  useSession: () => ({
    user,
    role: user.role,
    isAdmin: false,
    isStaff: false,
    canAct: false,
    loggingOut: false,
    logout: vi.fn(),
  }),
}));

import { DashboardView } from "@/components/espace/dashboard-view";
import { ReservationsView } from "@/components/espace/reservations-view";
import { StatisticsView } from "@/components/espace/statistics-view";
import { ToastProvider } from "@/components/ui/toast";

/** Settled reservations fixture: `failed` campaigns contribute nothing. */
function settled(
  campaigns: readonly CampaignResponse[],
  reservations: readonly ReservationResponse[],
  failed: readonly number[] = [],
): EspaceData.ReservationsSettled {
  const byCampaign = new Map<number, ReservationResponse[]>();
  for (const c of campaigns) {
    if (failed.includes(c.id)) continue;
    byCampaign.set(
      c.id,
      reservations.filter((r) => r.campaignId === c.id),
    );
  }
  return {
    reservations: [...byCampaign.values()].flat(),
    reservationsByCampaign: byCampaign,
    failedCampaignIds: [...failed],
  };
}

function serve(
  campaigns: CampaignResponse[],
  reservations: ReservationResponse[] = [],
  failed: number[] = [],
) {
  loaders.loadMyCampaigns.mockResolvedValue(campaigns);
  loaders.loadReservationsSettled.mockResolvedValue(settled(campaigns, reservations, failed));
}

beforeEach(() => {
  clearResourceCache();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  nav.params.value = "";
  nav.pathname.value = "/espace";
  nav.router.replace.mockReset();
  nav.router.push.mockReset();
  for (const fn of Object.values(loaders)) fn.mockReset();
});

describe("DashboardView — first run", () => {
  it("shows one primary action, 3 real milestones and no KPI tile", async () => {
    serve([]);
    render(<DashboardView />);

    expect(screen.getByRole("heading", { level: 1, name: "Bonjour, Sami" })).toBeInTheDocument();
    expect(screen.getByText("Chargement du tableau de bord…")).toBeInTheDocument();

    expect(
      await screen.findByRole("heading", { name: "Lancez votre première campagne" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Indicateurs de vos campagnes" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Estimations" })).toBeNull();
    expect(screen.queryByText(/Rien à faire pour le moment/)).toBeNull();

    const primaries = [...document.querySelectorAll("a, button")].filter((el) =>
      el.className.includes("bg-brand-blue "),
    );
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveTextContent("Créer ma première campagne");
    expect(primaries[0]).toHaveAttribute("href", "/espace/campagnes/nouvelle");
    expect(screen.getByRole("link", { name: "Voir les Porteurs en 3D" })).toHaveAttribute(
      "href",
      "/espace/reseau",
    );

    expect(screen.getByRole("progressbar", { name: "Vos premiers pas" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    expect(screen.getByText("0 sur 3")).toBeInTheDocument();

    const todo = screen.getByRole("region", { name: "À faire" });
    expect(within(todo).getByRole("link", { name: /Créer un brouillon/ })).toHaveAttribute(
      "href",
      "/espace/campagnes/nouvelle",
    );
    expect(screen.getByRole("region", { name: "Comment ça marche" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Vérifier les informations de votre société" }),
    ).toHaveAttribute("href", "/espace/profil#societe");
  });

  it("shows a retryable page error only when /mine fails", async () => {
    loaders.loadMyCampaigns
      .mockRejectedValueOnce(new ApiError(502, "Le service TPUB est momentanément indisponible."))
      .mockResolvedValueOnce([]);
    loaders.loadReservationsSettled.mockResolvedValue(settled([], []));
    render(<DashboardView />);

    fireEvent.click(await screen.findByRole("button", { name: "Réessayer" }));
    expect(
      await screen.findByRole("heading", { name: "Lancez votre première campagne" }),
    ).toBeInTheDocument();
    expect(loaders.loadMyCampaigns).toHaveBeenCalledTimes(2);
  });
});

describe("DashboardView — returning advertiser", () => {
  const campaigns = [
    campaign({ id: 3, name: "Nouveauté", status: "BROUILLON" }),
    campaign({
      id: 2,
      name: "Lancement Café",
      status: "BROUILLON",
      budget: 2500,
      estimatedViews: 1000,
    }),
    campaign({ id: 1, name: "Soldes", status: "REJECTED_BY_AI" }),
  ];

  it("puts À faire before the KPI strip, with per-kind targets", async () => {
    serve(campaigns, [reservation({ id: 1, campaignId: 2, supportId: 4, estimatedCost: 250 })]);
    render(
      <ToastProvider>
        <DashboardView />
      </ToastProvider>,
    );

    const todo = await screen.findByRole("region", { name: "À faire" });
    await waitFor(() =>
      expect(
        within(todo).getByRole("link", { name: /Soumettre «\sLancement Café\s»/ }),
      ).toHaveAttribute("href", "/espace/campagnes/nouvelle?id=2&etape=3"),
    );
    expect(
      within(todo).getByRole("link", { name: /Réserver des créneaux pour «\sNouveauté\s»/ }),
    ).toHaveAttribute("href", "/espace/campagnes/nouvelle?id=3&etape=2");
    const duplicate = within(todo).getByRole("button", {
      name: /Dupliquer et corriger «\sSoldes\s»/,
    });

    const kpis = screen.getByRole("region", { name: "Indicateurs de vos campagnes" });
    expect(todo.compareDocumentPosition(kpis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(kpis).getByText("Budget déclaré")).toBeInTheDocument();
    expect(within(kpis).getByText("Créneaux actifs")).toBeInTheDocument();
    expect(screen.queryByText(/Budget total/)).toBeNull();

    expect(screen.getByRole("region", { name: "Prochaines échéances" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lancement Café" })).toHaveAttribute(
      "href",
      "/espace/campagnes/2",
    );
    const estimates = screen.getByRole("region", { name: "Estimations" });
    expect(within(estimates).getByText("Estimation")).toBeInTheDocument();

    fireEvent.click(duplicate);
    expect(
      await screen.findByRole("dialog", { name: /^Dupliquer et corriger\s\?$/ }),
    ).toBeInTheDocument();
  });

  it("renders campaigns as soon as /mine resolves, before reservations", async () => {
    loaders.loadMyCampaigns.mockResolvedValue(campaigns);
    loaders.loadReservationsSettled.mockReturnValue(new Promise(() => undefined));
    render(<DashboardView />);

    expect(await screen.findByRole("link", { name: "Lancement Café" })).toBeInTheDocument();
    expect(screen.getByText("Chargement des actions…")).toBeInTheDocument();
  });

  it("keeps campaign names and flags partial data when one reservation call fails", async () => {
    serve(campaigns, [], [2]);
    render(<DashboardView />);

    expect(await screen.findByRole("link", { name: "Lancement Café" })).toBeInTheDocument();
    expect((await screen.findAllByText("Données partielles")).length).toBeGreaterThan(0);
    const todo = screen.getByRole("region", { name: "À faire" });
    expect(
      within(todo).getByRole("link", { name: /Finaliser «\sLancement Café\s»/ }),
    ).toHaveAttribute("href", "/espace/campagnes/2");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("ReservationsView", () => {
  const campaigns = [campaign({ id: 1, name: "Rentrée" }), campaign({ id: 2, name: "Été" })];
  const reservations = [
    reservation({ id: 1, campaignId: 1, supportId: 10, zoneId: 1, startDate: "2026-10-05" }),
    reservation({ id: 2, campaignId: 1, supportId: 11, zoneId: 2, reservationStatus: "CONFIRMEE" }),
    reservation({ id: 3, campaignId: 2, supportId: 10, zoneId: 1 }),
  ];
  const lookups = {
    supports: [
      support({ id: 10, name: "Écran Bourguiba" }),
      support({ id: 11, name: "Mât Lac 2" }),
    ],
    zones: [zone({ id: 1, name: "Tunis Centre" }), zone({ id: 2, name: "Les Berges du Lac" })],
  };

  beforeEach(() => {
    nav.pathname.value = "/espace/reservations";
  });

  it("pre-filters from the URL and writes filter changes with replace", async () => {
    nav.params.value = "campagne=1&statut=TEMPORAIRE";
    window.history.replaceState(null, "", "/espace/reservations?campagne=1&statut=TEMPORAIRE");
    serve(campaigns, reservations);
    loaders.loadNetworkLookups.mockResolvedValue(lookups);
    render(<ReservationsView />);

    const table = await screen.findByRole("table", { name: "Réservations de vos campagnes" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(2); // header + 1 row
    expect(within(table).getByRole("link", { name: /Écran Bourguiba/ })).toHaveAttribute(
      "href",
      "/espace/reseau?porteur=10",
    );
    expect(within(table).getByText("Voir en 3D")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "Tunis Centre" })).toHaveAttribute(
      "href",
      "/espace/reseau?zone=1",
    );
    expect(within(table).getByRole("link", { name: "Rentrée" })).toHaveAttribute(
      "href",
      "/espace/campagnes/1",
    );
    expect(screen.getAllByText(/Trié par : début, du plus proche au plus lointain/).length).toBe(1);
    expect(screen.getByRole("tab", { name: /Bloqué/ })).toHaveAttribute("aria-selected", "true");

    fireEvent.mouseDown(screen.getByRole("tab", { name: /Confirmé/ }));
    expect(nav.router.replace).toHaveBeenCalledWith(
      "/espace/reservations?campagne=1&statut=CONFIRMEE",
      { scroll: false },
    );
    expect(nav.router.push).not.toHaveBeenCalled();

    fireEvent.click(within(table).getByRole("button", { name: "Trier par coût estimé" }));
    expect(nav.router.replace).toHaveBeenLastCalledWith(
      "/espace/reservations?campagne=1&statut=TEMPORAIRE&tri=cout",
      { scroll: false },
    );
  });

  it("shows the inline filtered empty state with a reset", async () => {
    nav.params.value = "statut=EXPIREE";
    window.history.replaceState(null, "", "/espace/reservations?statut=EXPIREE");
    serve(campaigns, reservations);
    loaders.loadNetworkLookups.mockResolvedValue(lookups);
    render(<ReservationsView />);

    expect(await screen.findByText("Aucun résultat pour ces filtres")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser les filtres" }));
    expect(nav.router.replace).toHaveBeenCalledWith("/espace/reservations", { scroll: false });
  });

  it("lets the explainer be dismissed and shows the KPI « Créneaux actifs »", async () => {
    serve(campaigns, reservations);
    loaders.loadNetworkLookups.mockResolvedValue(lookups);
    render(<ReservationsView />);

    const summary = await screen.findByRole("region", { name: "Synthèse des réservations" });
    expect(within(summary).getByText("Créneaux actifs")).toBeInTheDocument();
    await waitFor(() => expect(within(summary).getAllByText("3").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "Masquer cette explication" }));
    expect(screen.queryByText("Bloqué, puis confirmé")).toBeNull();
    expect(window.localStorage.getItem("tpub:dismissed:anon:hint:reservations-explainer")).toBe(
      "1",
    );
  });

  it("renders a partial notice instead of an error page when one campaign fails", async () => {
    serve(campaigns, reservations, [2]);
    loaders.loadNetworkLookups.mockResolvedValue(lookups);
    render(<ReservationsView />);

    expect(
      await screen.findByRole("table", { name: "Réservations de vos campagnes" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Données partielles/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the first-use empty state when nothing is booked", async () => {
    serve([]);
    loaders.loadNetworkLookups.mockResolvedValue({ supports: [], zones: [] });
    render(<ReservationsView />);
    expect(await screen.findByText("Aucun créneau réservé.")).toBeInTheDocument();
  });
});

describe("StatisticsView", () => {
  it("draws drill-down charts with data tables and honest labels", async () => {
    const campaigns = [
      campaign({ id: 1, name: "Rentrée", budget: 3000 }),
      campaign({
        id: 2,
        name: "Été",
        status: "ACTIVE",
        startDate: "2026-01-01",
        endDate: "2099-01-01",
      }),
    ];
    serve(campaigns, [reservation({ id: 1, campaignId: 1, estimatedCost: 300 })]);
    nav.pathname.value = "/espace/statistiques";
    render(<StatisticsView />);

    expect(
      await screen.findByRole("img", {
        name: /Campagnes par statut : Brouillons 1, À corriger 0, En examen 0, Programmées 0, En diffusion 1/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^En examen :/ })).toHaveAttribute(
      "href",
      "/espace/campagnes?statut=en-examen",
    );
    expect(await screen.findByRole("link", { name: /^Bloqué :/ })).toHaveAttribute(
      "href",
      "/espace/reservations?statut=TEMPORAIRE",
    );
    expect(
      screen.getByRole("table", {
        name: "Budget déclaré et coût estimé des créneaux par campagne",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Budget déclaré").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Budget estimé|Budget consommé/)).toBeNull();
    expect(screen.getByText(/Suivi de consommation : pas encore disponible/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Journal de diffusion par campagne — mise en service progressive",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Contacter TPUB/ })).toHaveAttribute(
      "href",
      expect.stringMatching(/^mailto:/),
    );
    expect(screen.queryByText(/\bLIVE\b|en direct|Recevez la preuve/i)).toBeNull();
  });

  it("keeps charts that only need campaigns when reservations partially fail", async () => {
    const campaigns = [campaign({ id: 1, name: "Rentrée" }), campaign({ id: 2, name: "Été" })];
    serve(campaigns, [], [1]);
    render(<StatisticsView />);

    expect(await screen.findByRole("img", { name: /Campagnes par statut/ })).toBeInTheDocument();
    expect((await screen.findAllByText("Données partielles")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
