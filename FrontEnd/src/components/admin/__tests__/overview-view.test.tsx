import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CampaignResponse, RoleCode } from "@/lib/api/types";
import { clearResourceCache } from "@/lib/resource-cache";

const api = vi.hoisted(() => ({
  dashboard: vi.fn(),
  all: vi.fn(),
  supports: vi.fn(),
  zones: vi.fn(),
  emergencies: vi.fn(),
}));

vi.mock("@/lib/api/endpoints", () => ({
  statisticsApi: { dashboard: api.dashboard },
  campaignsApi: { all: api.all },
  supportsApi: { all: api.supports },
  zonesApi: { all: api.zones },
  emergencyApi: { all: api.emergencies },
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

import { OverviewView } from "@/components/admin/overview-view";

function campaign(over: Partial<CampaignResponse>): CampaignResponse {
  return {
    id: 1,
    clientId: 3,
    name: "Campagne",
    objective: null,
    budget: 1000,
    consumedBudget: 0,
    status: "BROUILLON",
    aiStatus: null,
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

beforeEach(() => {
  clearResourceCache();
  session.role = "ADMINISTRATEUR";
  api.dashboard.mockResolvedValue({
    totalCampaigns: 40,
    activeCampaigns: 9,
    pendingCampaigns: 7,
    aiPendingCampaigns: 5,
    aiRejectedCampaigns: 0,
    availableSupports: 4,
    confirmedReservations: 6,
    totalViews: 5321,
    estimatedBudget: 25000,
    consumedBudget: 0,
  });
  api.all.mockResolvedValue([
    campaign({ id: 11, name: "Soldes Lac", status: "APPROVED_BY_AI", aiStatus: "APPROVED" }),
    campaign({
      id: 12,
      name: "Promo gratuite",
      status: "REVIEW_REQUIRED",
      aiStatus: "REVIEW_REQUIRED",
    }),
    campaign({ id: 13, name: "Analyse", status: "PENDING_AI_CHECK" }),
  ]);
  api.zones.mockResolvedValue([]);
  api.supports.mockResolvedValue([]);
  api.emergencies.mockResolvedValue([]);
});

describe("OverviewView", () => {
  it("shows one primary action, a consistent hero and queue rows linking to the review", async () => {
    render(<OverviewView />);
    const hero = (await screen.findByRole("heading", { name: "À décider par TPUB" })).closest(
      "section",
    )!;
    expect(
      await within(hero).findByText("1 avis IA favorable · 1 revue manuelle"),
    ).toBeInTheDocument();
    expect(within(hero).getByText("2")).toBeInTheDocument();

    const primary = await screen.findByRole("link", { name: /Traiter la file \(2\)/ });
    expect(primary).toHaveAttribute("href", "/admin/moderation?onglet=a-traiter");

    const row = within(hero).getByRole("link", { name: /Soldes Lac/ });
    expect(row.getAttribute("href")).toContain("examen=11");

    // The « Analyse IA en attente » card reads the same list (1), not the dashboard (5).
    const card = (await screen.findByText("Analyse IA en attente")).parentElement!.parentElement!;
    expect(within(card).getByText("1")).toBeInTheDocument();

    expect(await screen.findByRole("heading", { name: "À surveiller" })).toBeInTheDocument();
    expect(await screen.findByText("Aucun message prioritaire actif")).toBeInTheDocument();
    expect(screen.queryByText(/Illustration/)).toBeNull();
    expect(screen.queryByText(/^0\d$/)).toBeNull();
  });
});
