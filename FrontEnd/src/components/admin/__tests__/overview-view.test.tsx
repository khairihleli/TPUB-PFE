import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CampaignResponse,
  RoleCode,
  StatisticsGroupBy,
  StatisticsViewsQuery,
} from "@/lib/api/types";
import { clearResourceCache } from "@/lib/resource-cache";

const api = vi.hoisted(() => ({
  dashboard: vi.fn(),
  views: vi.fn(),
  history: vi.fn(),
  exportCsv: vi.fn(),
  search: vi.fn(),
  supports: vi.fn(),
  zones: vi.fn(),
  emergencies: vi.fn(),
  aiDashboard: vi.fn(),
}));

vi.mock("@/lib/api/endpoints", () => ({
  statisticsApi: {
    dashboard: api.dashboard,
    views: api.views,
    history: api.history,
    exportCsv: api.exportCsv,
  },
  campaignsApi: { search: api.search },
  supportsApi: { all: api.supports },
  zonesApi: { all: api.zones },
  emergencyApi: { all: api.emergencies },
  aiApi: { dashboard: api.aiDashboard },
}));

const session = vi.hoisted((): { role: RoleCode } => ({ role: "ADMINISTRATEUR" }));
vi.mock("@/components/shell/session-provider", () => ({
  useSession: () => ({
    user: { email: "admin@tpub.local", nom: "Admin", role: session.role, userId: 1, exp: 1 },
    role: session.role,
    isAdmin: session.role === "ADMINISTRATEUR",
    isStaff: true,
    canAct: session.role === "ADMINISTRATEUR",
    loggingOut: false,
    logout: vi.fn(),
  }),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { OverviewView } from "@/components/admin/overview-view";

function campaign(over: Partial<CampaignResponse>): CampaignResponse {
  return {
    id: 1,
    clientId: 3,
    clientCompanyName: "Café Démo",
    name: "Campagne",
    objective: null,
    budget: 1000,
    consumedBudget: 0,
    status: "APPROVED_BY_AI",
    aiStatus: "APPROVED",
    adminStatus: null,
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    startTime: "08:00:00",
    endTime: "22:00:00",
    estimatedViews: 0,
    priorityScore: 0,
    createdAt: "2026-09-01T10:00:00Z",
    submittedAt: "2026-09-02T10:00:00Z",
    validatedAt: null,
    ...over,
  };
}

const ROWS: Record<StatisticsGroupBy, { key: string; label: string; views: number }[]> = {
  day: [
    { key: "2026-09-16", label: "16/09", views: 40 },
    { key: "2026-09-17", label: "17/09", views: 60 },
  ],
  campaign: [{ key: "11", label: "Soldes Lac", views: 100 }],
  support: [{ key: "7", label: "Porteur Lac Nord", views: 100 }],
  zone: [{ key: "2", label: "Les Berges du Lac", views: 100 }],
};

beforeEach(() => {
  clearResourceCache();
  for (const fn of Object.values(api)) fn.mockReset();
  session.role = "ADMINISTRATEUR";
  api.dashboard.mockResolvedValue({
    totalCampaigns: 40,
    activeCampaigns: 9,
    pendingCampaigns: 7,
    aiPendingCampaigns: 5,
    aiRejectedCampaigns: 1,
    availableSupports: 4,
    confirmedReservations: 6,
    totalViews: 5321,
    estimatedBudget: 25000,
    consumedBudget: 2500,
    approvedByAiCampaigns: 1,
    reviewRequiredCampaigns: 1,
    aiFlaggedCampaigns: 2,
    totalSupports: 5,
  });
  api.search.mockResolvedValue({
    items: [
      campaign({ id: 11, name: "Soldes Lac" }),
      campaign({
        id: 12,
        name: "Promo gratuite",
        status: "REVIEW_REQUIRED",
        aiStatus: "REVIEW_REQUIRED",
      }),
    ],
    page: 0,
    size: 4,
    totalItems: 2,
    totalPages: 1,
  });
  api.views.mockImplementation((q: StatisticsViewsQuery) =>
    Promise.resolve({
      from: q.from,
      to: q.to,
      groupBy: q.groupBy,
      rows: ROWS[q.groupBy ?? "day"].map((r) => ({ ...r, clicks: 2, interactions: 1, cost: 0.8 })),
      totals: { views: 100, clicks: 4, interactions: 2, cost: 1.6 },
    }),
  );
  api.history.mockResolvedValue([]);
  api.zones.mockResolvedValue([]);
  api.supports.mockResolvedValue([]);
  api.emergencies.mockResolvedValue([
    {
      id: 3,
      title: "Route coupée avenue Bourguiba",
      content: "Déviation",
      zoneId: 1,
      zoneName: "Tunis Centre",
      startDate: "2026-09-10",
      endDate: "2026-09-30",
      startTime: "00:00:00",
      endTime: "23:59:59",
      priority: 1,
      urgencyLevel: "CRITICAL",
      isActive: true,
      state: "EN_COURS",
    },
  ]);
  api.aiDashboard.mockResolvedValue({
    totalChecks: 12,
    avgRiskScore: 23.4,
    avgQualityScore: 71,
    approvedCount: 7,
    reviewRequiredCampaigns: 3,
    reviewRequiredCount: 3,
    rejectedCount: 2,
    adminValidatedCount: 3,
    adminRejectedCount: 1,
    validationRate: 0.75,
    rejectionRate: 0.25,
    overrideCount: 1,
    disagreementCount: 2,
    bySector: [],
    topIssues: [],
  });
});

describe("OverviewView", () => {
  it("shows the decision queue, every §6 figure group, charts, AI dashboard and live emergencies", async () => {
    render(<OverviewView />);
    const hero = (await screen.findByRole("heading", { name: "À décider par TPUB" })).closest(
      "section",
    )!;
    expect(
      await within(hero).findByText("1 avis IA favorable · 1 revue manuelle"),
    ).toBeInTheDocument();
    expect(within(hero).getByText("2")).toBeInTheDocument();
    const row = await within(hero).findByRole("link", { name: /Soldes Lac/ });
    expect(row.getAttribute("href")).toContain("examen=11");
    expect(within(hero).getAllByText("Café Démo").length).toBeGreaterThan(0);
    expect(api.search).toHaveBeenCalledWith(
      expect.objectContaining({ status: ["APPROVED_BY_AI", "REVIEW_REQUIRED"], size: 4 }),
    );

    const primary = await screen.findByRole("link", { name: /Traiter la file \(2\)/ });
    expect(primary).toHaveAttribute("href", "/admin/moderation?onglet=a-traiter");

    for (const title of [
      "Campagnes",
      "Analyse IA",
      "Réseau & annonceurs",
      "Réservations",
      "Diffusion",
      "Budgets & revenus simulés",
    ]) {
      expect(await screen.findByRole("heading", { name: title, level: 2 })).toBeInTheDocument();
    }
    expect(screen.getByText("Refusées ou signalées par l'IA")).toBeInTheDocument();

    // Views by day, campaign, support and zone.
    expect(
      await screen.findByRole("img", { name: /Affichages par jour : total 100/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Affichages par Porteur" })).toHaveTextContent(
      "Porteur Lac Nord",
    );
    expect(screen.getByRole("list", { name: "Affichages par zone" })).toHaveTextContent(
      "Les Berges du Lac",
    );
    for (const groupBy of ["day", "campaign", "support", "zone"]) {
      expect(api.views).toHaveBeenCalledWith(expect.objectContaining({ groupBy }));
    }

    // Budget estimated vs consumed.
    expect(
      await screen.findByRole("meter", { name: "Part du budget estimé consommée" }),
    ).toHaveAttribute("aria-valuenow", "10");

    // AI dashboard.
    const ai = (await screen.findByRole("heading", { name: "Tableau de bord IA" })).closest(
      "section",
    )!;
    expect(await within(ai).findByText("23,4 / 100")).toBeInTheDocument();
    expect(within(ai).getByText("75 %")).toBeInTheDocument();

    // Live emergencies strip + CSV export.
    const strip = (
      await screen.findByRole("heading", { name: "Messages prioritaires actifs" })
    ).closest("section")!;
    expect(within(strip).getByText("Route coupée avenue Bourguiba")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exporter" })).toBeInTheDocument();
    expect(await screen.findByText("1 message prioritaire actif")).toBeInTheDocument();
  });

  it("gives opérateurs their perimeter without campaign or AI calls", async () => {
    session.role = "OPERATEUR";
    render(<OverviewView />);
    expect(await screen.findByRole("heading", { name: "Votre périmètre" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Journal des diffusions/ })).toHaveAttribute(
      "href",
      "/admin/journal?onglet=diffusions",
    );
    await waitFor(() => expect(api.views).toHaveBeenCalled());
    expect(api.search).not.toHaveBeenCalled();
    expect(api.aiDashboard).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Tableau de bord IA" })).toBeNull();
  });
});
