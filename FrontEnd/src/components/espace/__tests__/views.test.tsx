import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { campaign, reservation } from "@/components/espace/__tests__/fixtures";
import { EMPTY_TOTALS } from "@/components/espace/statistics-model";
import type * as Endpoints from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/errors";
import type { SessionUser, StatisticsMineResponse } from "@/lib/api/types";
import { clearResourceCache } from "@/lib/resource-cache";

const api = vi.hoisted(() => ({
  campaignsMine: vi.fn(),
  statsMine: vi.fn(),
  reservationsMine: vi.fn(),
  cancel: vi.fn(),
  exportCsv: vi.fn(),
}));

vi.mock("@/lib/api/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof Endpoints>();
  return {
    ...actual,
    campaignsApi: { ...actual.campaignsApi, mine: api.campaignsMine },
    statisticsApi: { ...actual.statisticsApi, mine: api.statsMine, exportCsv: api.exportCsv },
    reservationsApi: { ...actual.reservationsApi, mine: api.reservationsMine, cancel: api.cancel },
  };
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

function stats(partial: Partial<StatisticsMineResponse> = {}): StatisticsMineResponse {
  return {
    from: "2026-08-19",
    to: "2026-09-17",
    totals: { ...EMPTY_TOTALS },
    statusCounts: {} as StatisticsMineResponse["statusCounts"],
    daily: [],
    byCampaign: [],
    bySupport: [],
    byZone: [],
    ...partial,
  };
}

beforeEach(() => {
  clearResourceCache();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  nav.params.value = "";
  nav.pathname.value = "/espace";
  nav.router.replace.mockReset();
  nav.router.push.mockReset();
  for (const fn of Object.values(api)) fn.mockReset();
  api.statsMine.mockResolvedValue(stats());
});

describe("DashboardView — first run", () => {
  it("shows one primary action, 3 real milestones and no KPI tile", async () => {
    api.campaignsMine.mockResolvedValue([]);
    render(<DashboardView />);

    expect(screen.getByRole("heading", { level: 1, name: "Bonjour, Sami" })).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Lancez votre première campagne" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Vos 30 derniers jours" })).toBeNull();

    const primaries = [...document.querySelectorAll("a, button")].filter((el) =>
      el.className.includes("bg-brand-blue "),
    );
    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toHaveAttribute("href", "/espace/campagnes/nouvelle");
    expect(screen.getByText("0 sur 3")).toBeInTheDocument();
  });

  it("shows a retryable page error only when /mine fails", async () => {
    api.campaignsMine
      .mockRejectedValueOnce(new ApiError(502, "Le service TPUB est momentanément indisponible."))
      .mockResolvedValueOnce([]);
    render(<DashboardView />);

    fireEvent.click(await screen.findByRole("button", { name: "Réessayer" }));
    expect(
      await screen.findByRole("heading", { name: "Lancez votre première campagne" }),
    ).toBeInTheDocument();
    expect(api.campaignsMine).toHaveBeenCalledTimes(2);
  });
});

describe("DashboardView — returning advertiser", () => {
  const campaigns = [
    campaign({ id: 3, name: "Nouveauté", status: "BROUILLON", reservationsCount: 0 }),
    campaign({ id: 2, name: "Lancement Café", status: "BROUILLON", reservationsCount: 2 }),
    campaign({ id: 1, name: "Soldes", status: "REJECTED_BY_AI" }),
  ];

  it("shows KPIs from /statistics/mine, the to-do list with per-kind targets and the daily chart", async () => {
    api.campaignsMine.mockResolvedValue(campaigns);
    api.statsMine.mockResolvedValue(
      stats({
        totals: { ...EMPTY_TOTALS, views: 4321, clicks: 12, estimatedCost: 80, campaigns: 3 },
        daily: [{ date: "2026-09-16", views: 4321, clicks: 12, interactions: 0, cost: 34.5 }],
      }),
    );
    render(
      <ToastProvider>
        <DashboardView />
      </ToastProvider>,
    );

    const todo = await screen.findByRole("region", { name: /À faire/ });
    expect(
      within(todo).getByRole("link", { name: /Soumettre «\sLancement Café\s»/ }),
    ).toHaveAttribute("href", "/espace/campagnes/nouvelle?id=2&etape=4");
    expect(
      within(todo).getByRole("link", { name: /zone et les Porteurs de «\sNouveauté\s»/ }),
    ).toHaveAttribute("href", "/espace/campagnes/nouvelle?id=3&etape=3");
    expect(within(todo).getByRole("link", { name: /Corriger «\sSoldes\s»/ })).toHaveAttribute(
      "href",
      "/espace/campagnes/1",
    );

    const kpis = screen.getByRole("region", { name: "Vos 30 derniers jours" });
    await waitFor(() => expect(within(kpis).getAllByText(/4.321/).length).toBeGreaterThan(0));
    expect(within(kpis).getAllByText("Mesuré").length).toBeGreaterThan(0);
    expect(within(kpis).getByText("Estimation")).toBeInTheDocument();
    expect(api.statsMine).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("table", { name: "Affichages, clics et interactions par jour" }),
    ).toBeInTheDocument();
  });

  it("keeps campaigns visible when the statistics fail", async () => {
    api.campaignsMine.mockResolvedValue(campaigns);
    api.statsMine.mockRejectedValue(new ApiError(502, "Indisponible"));
    render(<DashboardView />);
    expect(await screen.findByRole("link", { name: "Lancement Café" })).toBeInTheDocument();
    expect(await screen.findByText("Indicateurs indisponibles")).toBeInTheDocument();
  });
});

describe("ReservationsView", () => {
  const reservations = [
    reservation({
      id: 1,
      campaignId: 1,
      campaignName: "Rentrée",
      supportId: 10,
      supportName: "Écran Bourguiba",
      zoneId: 1,
      zoneName: "Tunis Centre",
      startDate: "2026-10-05",
      cancellable: true,
    }),
    reservation({
      id: 2,
      campaignId: 1,
      campaignName: "Rentrée",
      supportId: 11,
      supportName: "Mât Lac 2",
      zoneId: 2,
      zoneName: "Les Berges du Lac",
      reservationStatus: "CONFIRMEE",
      cancellable: false,
    }),
    reservation({
      id: 3,
      campaignId: 2,
      campaignName: "Été",
      supportId: 10,
      supportName: "Écran Bourguiba",
      zoneId: 1,
      zoneName: "Tunis Centre",
      reservationStatus: "EXPIREE",
      cancellable: false,
    }),
  ];

  beforeEach(() => {
    nav.pathname.value = "/espace/reservations";
  });

  it("pre-filters from the URL and writes filter changes with replace", async () => {
    nav.params.value = "campagne=1&statut=TEMPORAIRE";
    window.history.replaceState(null, "", "/espace/reservations?campagne=1&statut=TEMPORAIRE");
    api.reservationsMine.mockResolvedValue(reservations);
    render(
      <ToastProvider>
        <ReservationsView />
      </ToastProvider>,
    );

    const table = await screen.findByRole("table", { name: "Réservations de vos campagnes" });
    expect(within(table).getAllByRole("row")).toHaveLength(2); // header + 1 row
    expect(within(table).getByRole("link", { name: /Écran Bourguiba/ })).toHaveAttribute(
      "href",
      "/espace/reseau?porteur=10",
    );
    expect(within(table).getByRole("link", { name: "Rentrée" })).toHaveAttribute(
      "href",
      "/espace/campagnes/1",
    );
    expect(screen.getByRole("tab", { name: /Bloqué/ })).toHaveAttribute("aria-selected", "true");

    fireEvent.mouseDown(screen.getByRole("tab", { name: /Confirmé/ }));
    expect(nav.router.replace).toHaveBeenCalledWith(
      "/espace/reservations?campagne=1&statut=CONFIRMEE",
      { scroll: false },
    );
    expect(nav.router.push).not.toHaveBeenCalled();
  });

  it("counts EXPIREE and shows the filtered empty state with a reset", async () => {
    nav.params.value = "statut=ANNULEE&campagne=2";
    window.history.replaceState(null, "", "/espace/reservations?statut=ANNULEE&campagne=2");
    api.reservationsMine.mockResolvedValue(reservations);
    render(
      <ToastProvider>
        <ReservationsView />
      </ToastProvider>,
    );

    expect(await screen.findByText("Aucun résultat pour ces filtres")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Passé/ })).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser les filtres" }));
    expect(nav.router.replace).toHaveBeenCalledWith("/espace/reservations", { scroll: false });
  });

  it("cancels a TEMPORAIRE slot after confirmation, with an optional reason", async () => {
    api.reservationsMine.mockResolvedValue(reservations);
    api.cancel.mockImplementation((id: number, reason: string | null) =>
      Promise.resolve({
        ...reservations[0],
        id,
        reservationStatus: "ANNULEE",
        cancelReason: reason,
        cancellable: false,
      }),
    );
    render(
      <ToastProvider>
        <ReservationsView />
      </ToastProvider>,
    );

    const table = await screen.findByRole("table", { name: "Réservations de vos campagnes" });
    // Only the cancellable row offers the action.
    const buttons = within(table).getAllByRole("button", { name: /Annuler.*Bourguiba/ });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);

    const dialog = await screen.findByRole("dialog", { name: /Libérer ce créneau/ });
    fireEvent.change(within(dialog).getByLabelText(/Motif/), {
      target: { value: "Changement de plan" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Libérer le créneau" }));

    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith(1, "Changement de plan"));
    await waitFor(() =>
      expect(within(table).queryAllByRole("button", { name: /Annuler.*Bourguiba/ })).toHaveLength(
        0,
      ),
    );
    expect((await screen.findAllByText("Motif : Changement de plan")).length).toBeGreaterThan(0);
  });

  it("shows the first-use empty state when nothing is booked", async () => {
    api.reservationsMine.mockResolvedValue([]);
    render(
      <ToastProvider>
        <ReservationsView />
      </ToastProvider>,
    );
    expect(await screen.findByText("Aucun créneau réservé.")).toBeInTheDocument();
  });
});

describe("StatisticsView", () => {
  it("renders measured and estimated figures, tables by campaign/Porteur/zone and the CSV export", async () => {
    nav.pathname.value = "/espace/statistiques";
    nav.params.value = "periode=7";
    api.campaignsMine.mockResolvedValue([campaign({ id: 1, name: "Rentrée" })]);
    api.statsMine.mockResolvedValue(
      stats({
        totals: { ...EMPTY_TOTALS, views: 250, clicks: 5 },
        daily: [{ date: "2026-09-16", views: 250, clicks: 5, interactions: 1, cost: 2 }],
        byCampaign: [
          {
            campaignId: 1,
            name: "Rentrée",
            status: "ACTIVE",
            views: 250,
            clicks: 5,
            interactions: 1,
            estimatedViews: 900,
            estimatedCost: 7.2,
            budget: 100,
            consumedBudget: 2,
          },
        ],
        bySupport: [
          { supportId: 10, name: "Écran Bourguiba", zoneName: "Tunis Centre", views: 250 },
        ],
        byZone: [{ zoneId: 1, name: "Tunis Centre", views: 250 }],
      }),
    );
    api.exportCsv.mockResolvedValue("tpub-statistiques-mine.csv");
    render(
      <ToastProvider>
        <StatisticsView />
      </ToastProvider>,
    );

    expect(
      await screen.findByRole("table", { name: "Statistiques par campagne" }),
    ).toBeInTheDocument();
    expect(api.statsMine).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
    );
    expect(screen.getByRole("table", { name: "Affichages par Porteur" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Affichages par zone" })).toBeInTheDocument();
    // 5 clicks / 250 views = 2 % (fr-TN puts a narrow space before %).
    expect(screen.getAllByText((t) => /^2\s?%$/.test(t)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "7 jours" })).toHaveAttribute("aria-pressed", "true");

    const exportUser = userEvent.setup();
    await exportUser.click(screen.getByRole("button", { name: "Exporter" }));
    await exportUser.click(await screen.findByRole("menuitem", { name: "CSV (tableur)" }));
    await waitFor(() =>
      expect(api.exportCsv).toHaveBeenCalledWith(expect.objectContaining({ type: "mine" })),
    );
  });

  it("explains an invalid custom period", async () => {
    nav.pathname.value = "/espace/statistiques";
    nav.params.value = "periode=perso&du=2026-09-10&au=2026-09-01";
    api.campaignsMine.mockResolvedValue([campaign({ id: 1 })]);
    render(
      <ToastProvider>
        <StatisticsView />
      </ToastProvider>,
    );
    expect(
      await screen.findByText("La date de fin doit suivre la date de début."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Exporter" })).toBeNull();
  });
});
