import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  mine: vi.fn(),
  remove: vi.fn(),
  reopen: vi.fn(),
  update: vi.fn(),
  duplicate: vi.fn(),
  byCampaign: vi.fn(),
  cancel: vi.fn(),
  report: vi.fn(),
  checkContent: vi.fn(),
  mediaList: vi.fn(),
  estimate: vi.fn(),
  campaignStats: vi.fn(),
  exportCsv: vi.fn(),
  supportsAll: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/api/endpoints", () => ({
  campaignsApi: {
    get: mocks.get,
    mine: mocks.mine,
    remove: mocks.remove,
    reopen: mocks.reopen,
    update: mocks.update,
    duplicate: mocks.duplicate,
  },
  reservationsApi: { byCampaign: mocks.byCampaign, cancel: mocks.cancel },
  aiApi: { report: mocks.report, checkContent: mocks.checkContent },
  mediaApi: { list: mocks.mediaList },
  estimatesApi: { campaign: mocks.estimate },
  statisticsApi: { campaign: mocks.campaignStats, exportCsv: mocks.exportCsv },
  supportsApi: { all: mocks.supportsAll },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/espace/campagnes/7",
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, back: vi.fn() }),
}));

// MapLibre never loads in jsdom: the read-only zones map is covered by zone-model tests.
vi.mock("@/components/campaign/campaign-zones-map", () => ({
  CampaignZonesMap: () => null,
}));

import { CampaignDetail, deleteDescription } from "@/components/campaign/campaign-detail";
import { CampaignEdit } from "@/components/campaign/campaign-edit";
import { ToastProvider } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import type {
  AiReport,
  CampaignEstimateResponse,
  CampaignResponse,
  MediaFileResponse,
  ReservationResponse,
} from "@/lib/api/types";
import { todayISO } from "@/lib/format";
import { resetUnsavedGuards } from "@/lib/forms/unsaved-guard";
import { clearResourceCache } from "@/lib/resource-cache";

function isoInDays(days: number): string {
  const d = new Date(`${todayISO()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function campaign(partial: Partial<CampaignResponse> = {}): CampaignResponse {
  return {
    id: 7,
    clientId: 1,
    name: "Lancement Café Démo",
    objective: "Notoriété de la nouvelle gamme",
    budget: 2500,
    consumedBudget: 0,
    remainingBudget: 2500,
    estimatedCost: 250,
    status: "BROUILLON",
    aiStatus: null,
    adminStatus: null,
    startDate: isoInDays(5),
    endDate: isoInDays(30),
    startTime: "07:00:00",
    endTime: "12:00:00",
    estimatedViews: 1000,
    priorityScore: 0,
    rejectionReason: null,
    adminComment: null,
    terminationReason: null,
    mediaCount: 0,
    zones: [],
    reservationsCount: 1,
    editable: true,
    submittable: true,
    deletable: true,
    createdAt: "2026-09-01T10:00:00Z",
    submittedAt: null,
    validatedAt: null,
    ...partial,
  };
}

function reservation(partial: Partial<ReservationResponse> = {}): ReservationResponse {
  return {
    id: 100,
    campaignId: 7,
    campaignName: "Lancement Café Démo",
    zoneId: 1,
    zoneName: "Tunis Centre",
    supportId: 11,
    supportName: "Écran LED Avenue",
    supportType: "ECRAN",
    startDate: isoInDays(5),
    endDate: isoInDays(30),
    startTime: "07:00:00",
    endTime: "12:00:00",
    availabilityStatus: "RESERVE",
    reservationStatus: "TEMPORAIRE",
    estimatedViews: 1000,
    estimatedCost: 250,
    cancellable: true,
    ...partial,
  };
}

const ESTIMATE: CampaignEstimateResponse = {
  campaignId: 7,
  budget: 2500,
  consumedBudget: 0,
  remainingBudget: 2500,
  lines: [],
  totalViews: 1000,
  totalCost: 250,
  budgetCoverage: 10,
  budgetSufficient: true,
};

const MEDIA: MediaFileResponse = {
  id: 3,
  campaignId: 7,
  fileName: "affiche-cafe.png",
  fileType: "IMAGE",
  mimeType: "image/png",
  fileSizeBytes: 120_000,
  durationSeconds: null,
  widthPx: 1920,
  heightPx: 1080,
  url: "/uploads/campaigns/7/a.png",
  checksum: "abc",
  sortOrder: 0,
  createdAt: "2026-09-01T10:00:00Z",
};

function report(partial: Partial<AiReport> = {}): AiReport {
  return {
    campaignId: 7,
    checkId: 1,
    aiStatus: "REJECTED",
    riskScore: 85,
    qualityScore: 40,
    detectedIssues: ["alcool"],
    issues: [{ label: "Mot interdit : alcool", severity: "HIGH", source: "REGLE" }],
    recommendation: "Contenu non diffusable en l'état : corrigez les points signalés",
    recommendations: ["Retirez la mention d'alcool"],
    reason: null,
    sector: "RESTAURATION",
    contentType: "IMAGE",
    extractedText: "happy hour biere",
    ocrEngine: "SIMULE",
    engine: "LOCAL",
    mediaAnalyses: [],
    matchedRules: [],
    preview: false,
    adminDecision: null,
    checkedAt: "2026-09-10T10:00:00Z",
    ...partial,
  };
}

function serve(c: CampaignResponse, reservations: ReservationResponse[] = [reservation()]) {
  mocks.get.mockResolvedValue(c);
  mocks.byCampaign.mockResolvedValue(reservations);
}

function renderWithToasts(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  clearResourceCache();
  resetUnsavedGuards();
  window.sessionStorage.clear();
  mocks.report.mockRejectedValue(new ApiError(404, "x", { code: "AI_REPORT_NOT_FOUND" }));
  mocks.mediaList.mockResolvedValue([]);
  mocks.estimate.mockResolvedValue(ESTIMATE);
  mocks.supportsAll.mockResolvedValue([]);
  mocks.mine.mockResolvedValue([]);
  mocks.campaignStats.mockRejectedValue(new ApiError(503, "Indisponible"));
});

describe("CampaignDetail", () => {
  it("shows « Campagne introuvable » for a campaign that is not the caller's (404)", async () => {
    mocks.get.mockRejectedValue(new ApiError(404, "x", { code: "CAMPAIGN_NOT_FOUND" }));
    mocks.mine.mockResolvedValue([campaign({ id: 3, name: "Soldes d'été" })]);
    renderWithToasts(<CampaignDetail idParam="7" />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Campagne introuvable" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Soldes d'été" })).toHaveAttribute(
      "href",
      "/espace/campagnes/3",
    );
    expect(mocks.byCampaign).not.toHaveBeenCalled();
  });

  it("renders a draft with its reservations, estimate, media section and cancel action", async () => {
    const user = userEvent.setup();
    serve(campaign());
    mocks.cancel.mockResolvedValue(reservation({ reservationStatus: "ANNULEE" }));
    renderWithToasts(<CampaignDetail idParam="7" />);

    const h1 = await screen.findByRole("heading", { level: 1, name: "Lancement Café Démo" });
    expect(screen.getByText("CAMP-00007")).toBeInTheDocument();
    const header = h1.closest("header")!;
    expect(within(header).getByRole("link", { name: /Finaliser/ })).toHaveAttribute(
      "href",
      "/espace/campagnes/nouvelle?id=7&etape=4",
    );

    expect(screen.getByRole("heading", { level: 2, name: "Suivi de la campagne" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Estimation et budget" })).toBeVisible();
    expect(screen.getByText("Aucun média")).toBeInTheDocument();
    expect(screen.getByText("Aucune analyse pour cette campagne")).toBeInTheDocument();
    expect(screen.getByText("Pas encore de diffusion")).toBeInTheDocument();
    expect(mocks.campaignStats).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Écran LED Avenue" })).toHaveAttribute(
      "href",
      "/espace/reseau?porteur=11",
    );

    await user.click(screen.getByRole("button", { name: /Annuler.*Écran LED Avenue/ }));
    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith(100, expect.any(String)));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2)); // reloaded
  });

  it("deletes after a confirmation naming the campaign and the reservations released", async () => {
    const user = userEvent.setup();
    serve(campaign(), [reservation(), reservation({ id: 101, supportId: 12 })]);
    mocks.remove.mockResolvedValue(undefined);
    renderWithToasts(<CampaignDetail idParam="7" />);

    await screen.findByRole("heading", { level: 1, name: "Lancement Café Démo" });
    await user.click(screen.getAllByRole("button", { name: "Plus d'actions" })[0]!);
    const item = (await screen.findAllByRole("menuitem")).find((i) =>
      /Supprimer/.test(i.textContent ?? ""),
    );
    await user.click(item!);
    const dialog = await screen.findByRole("dialog", { name: /Supprimer.*Lancement Café Démo/ });
    expect(dialog).toHaveTextContent(/2 réservations .* seront libérées/);
    await user.click(within(dialog).getByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(7));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/espace/campagnes"));
  });

  it("shows the ZELQANE refusal reason and reopens a BLOCKED campaign for correction", async () => {
    const user = userEvent.setup();
    serve(
      campaign({
        status: "BLOCKED",
        adminStatus: "REJECTED",
        rejectionReason: "Visuel illisible sur écran extérieur.",
        submittable: false,
        submittedAt: "2026-09-10T10:00:00Z",
      }),
      [reservation({ reservationStatus: "ANNULEE", cancellable: false })],
    );
    mocks.reopen.mockResolvedValue(campaign());
    renderWithToasts(<CampaignDetail idParam="7" />);

    expect(await screen.findByText("Motif du refus ZELQANE")).toBeInTheDocument();
    expect(screen.getByText("Visuel illisible sur écran extérieur.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Annuler.*Écran LED Avenue/ })).toBeNull();

    await user.click(screen.getAllByRole("button", { name: /Corriger/ })[0]!);
    const dialog = await screen.findByRole("dialog", { name: /Corriger la campagne/ });
    await user.click(within(dialog).getByRole("button", { name: "Remettre en brouillon" }));
    await waitFor(() => expect(mocks.reopen).toHaveBeenCalledWith(7));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/espace/campagnes/nouvelle?id=7&etape=2"),
    );
  });

  it("renders the full AI report of a REJECTED_BY_AI campaign (issues, OCR, sector)", async () => {
    serve(
      campaign({
        status: "REJECTED_BY_AI",
        aiStatus: "REJECTED",
        aiRiskScore: 85,
        aiQualityScore: 40,
        aiSector: "RESTAURATION",
        submittable: false,
        submittedAt: "2026-09-10T10:00:00Z",
      }),
    );
    mocks.report.mockResolvedValue(report());
    renderWithToasts(<CampaignDetail idParam="7" />);

    expect(await screen.findByText("Mot interdit : alcool")).toBeInTheDocument();
    expect(screen.getByText("Retirez la mention d'alcool")).toBeInTheDocument();
    expect(screen.getByText("happy hour biere")).toBeInTheDocument();
    expect(screen.getAllByText(/OCR simulé/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Restauration/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Risque 85\/100 · qualité 40\/100/)).toBeInTheDocument();
  });

  it("duplicates through the server, with or without the media", async () => {
    const user = userEvent.setup();
    serve(campaign({ status: "TERMINATED", mediaCount: 2, terminationReason: "PERIODE_TERMINEE" }));
    mocks.mediaList.mockResolvedValue([MEDIA]);
    mocks.campaignStats.mockResolvedValue({
      campaignId: 7,
      name: "Lancement Café Démo",
      status: "TERMINATED",
      budget: 2500,
      consumedBudget: 120.5,
      remainingBudget: 2379.5,
      estimatedViews: 1000,
      estimatedCost: 250,
      views: 900,
      clicks: 12,
      interactions: 3,
      lastDiffusionAt: "2026-09-12T10:00:00Z",
      daily: [{ date: "2026-09-12", views: 900, clicks: 12, interactions: 3, cost: 120.5 }],
      bySupport: [
        { supportId: 11, name: "Écran LED Avenue", zoneName: "Tunis Centre", views: 900 },
      ],
      byZone: [{ zoneId: 1, name: "Tunis Centre", views: 900 }],
    });
    mocks.duplicate.mockResolvedValue(campaign({ id: 8, name: "Copie de Lancement Café Démo" }));
    renderWithToasts(<CampaignDetail idParam="7" />);

    await screen.findByRole("heading", { level: 1, name: "Lancement Café Démo" });
    expect(screen.getAllByText("Période de diffusion terminée").length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: "Exporter" })).toBeInTheDocument();
    expect(mocks.campaignStats).toHaveBeenCalledWith(7, expect.anything());
    expect(screen.getAllByRole("img", { name: /affiche-cafe\.png/ }).length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole("button", { name: "Plus d'actions" })[0]!);
    const item = (await screen.findAllByRole("menuitem")).find((i) =>
      /Dupliquer/.test(i.textContent ?? ""),
    );
    await user.click(item!);
    const dialog = await screen.findByRole("dialog", { name: /Dupliquer/ });
    await user.click(within(dialog).getByRole("checkbox", { name: /Inclure les médias/ }));
    await user.click(within(dialog).getByRole("button", { name: "Dupliquer" }));
    await waitFor(() => expect(mocks.duplicate).toHaveBeenCalledWith(7, { includeMedia: false }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/espace/campagnes/nouvelle?id=8&etape=3"),
    );
  });
});

describe("deleteDescription", () => {
  it("names the reservations released, or says there are none", () => {
    expect(deleteDescription({ startDate: "2026-10-14", endDate: "2026-10-20" }, 1)).toMatch(
      /^1 réservation .*14 oct.* sera libérée, ainsi que les médias\. Action définitive\.$/,
    );
    expect(deleteDescription({ startDate: null, endDate: null }, 0)).toBe(
      "Aucun Porteur n'est réservé pour cette campagne. Action définitive.",
    );
  });
});

describe("CampaignEdit (/modifier)", () => {
  it("redirects a draft to the wizard « Détails » step", async () => {
    serve(campaign(), []);
    renderWithToasts(<CampaignEdit idParam="7" />);
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/espace/campagnes/nouvelle?id=7&etape=1"),
    );
  });

  it("explains the reopen, then saves a BLOCKED campaign back to BROUILLON and resumes the wizard", async () => {
    const user = userEvent.setup();
    const blocked = campaign({
      status: "BLOCKED",
      rejectionReason: "Objectif trompeur.",
      reservationsCount: 0,
    });
    serve(blocked, []);
    mocks.update.mockImplementation((_id: number, body: { name: string }) =>
      Promise.resolve(campaign({ name: body.name, status: "BROUILLON", reservationsCount: 0 })),
    );
    renderWithToasts(<CampaignEdit idParam="7" />);

    expect(await screen.findByText("La campagne repassera en brouillon")).toBeInTheDocument();
    expect(screen.getByText("Objectif trompeur.")).toBeInTheDocument();
    const name = screen.getByLabelText(/Nom de la campagne/);
    await user.clear(name);
    await user.type(name, "Lancement Café corrigé");
    await user.click(screen.getByRole("button", { name: /Enregistrer les modifications/ }));

    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ name: "Lancement Café corrigé" }),
      ),
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/espace/campagnes/nouvelle?id=7&etape=2"),
    );
    expect(await screen.findByText("Campagne remise en brouillon")).toBeInTheDocument();
  });

  it("summarises several errors on submit without calling the API", async () => {
    const user = userEvent.setup();
    serve(campaign({ status: "REJECTED_BY_AI", aiStatus: "REJECTED" }), []);
    renderWithToasts(<CampaignEdit idParam="7" />);

    await user.clear(await screen.findByLabelText(/Nom de la campagne/));
    await user.clear(screen.getByLabelText(/^Objectif/));
    await user.click(screen.getByRole("button", { name: /Enregistrer les modifications/ }));

    const summary = await screen.findByRole("alert", { name: /2 champs à corriger/ });
    expect(within(summary).getAllByRole("link")).toHaveLength(2);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
