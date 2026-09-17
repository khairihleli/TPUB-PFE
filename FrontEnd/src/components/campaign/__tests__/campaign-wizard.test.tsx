import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as MapModule from "@/components/map";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  submit: vi.fn(),
  setZones: vi.fn(),
  byCampaign: vi.fn(),
  createBatch: vi.fn(),
  cancel: vi.fn(),
  report: vi.fn(),
  checkContent: vi.fn(),
  mediaList: vi.fn(),
  upload: vi.fn(),
  removeMedia: vi.fn(),
  availability: vi.fn(),
  recommendations: vi.fn(),
  zonesActive: vi.fn(),
  supportsAll: vi.fn(),
  estimate: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  params: { value: "" },
}));

vi.mock("@/lib/api/endpoints", () => ({
  campaignsApi: {
    get: mocks.get,
    create: mocks.create,
    update: mocks.update,
    submit: mocks.submit,
    setZones: mocks.setZones,
  },
  reservationsApi: {
    byCampaign: mocks.byCampaign,
    createBatch: mocks.createBatch,
    cancel: mocks.cancel,
  },
  aiApi: { report: mocks.report, checkContent: mocks.checkContent },
  mediaApi: { list: mocks.mediaList, upload: mocks.upload, remove: mocks.removeMedia },
  availabilityApi: { search: mocks.availability },
  zonesApi: { active: mocks.zonesActive, recommendations: mocks.recommendations },
  supportsApi: { all: mocks.supportsAll },
  estimatesApi: { campaign: mocks.estimate },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.params.value),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => "/espace/campagnes/nouvelle",
}));

// MapLibre never runs in jsdom: a stub exposes the click that places a circle.
vi.mock("@/components/map", async (importOriginal) => {
  const actual = await importOriginal<typeof MapModule>();
  return {
    ...actual,
    NetworkMap: (props: { onMapClick?: (p: { lat: number; lng: number }) => void }) => (
      <button type="button" onClick={() => props.onMapClick?.({ lat: 36.80071, lng: 10.18012 })}>
        Point sur la carte
      </button>
    ),
  };
});

import { CampaignWizard } from "@/components/campaign/campaign-wizard";
import { NavigationGuardProvider } from "@/components/shell/navigation-guard";
import { ToastProvider } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import type {
  AvailabilityResponse,
  CampaignResponse,
  CampaignZoneResponse,
  ReservationResponse,
  SupportAvailabilityItem,
  SupportResponse,
} from "@/lib/api/types";
import { resetUnsavedGuards } from "@/lib/forms/unsaved-guard";
import { todayISO } from "@/lib/format";
import { clearResourceCache } from "@/lib/resource-cache";

function isoInDays(days: number): string {
  const d = new Date(`${todayISO()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const ZONE: CampaignZoneResponse = {
  id: 1,
  zoneId: 1,
  zoneName: "Tunis Centre",
  label: null,
  latitude: 36.8,
  longitude: 10.18,
  radiusKm: 3,
  supportsInside: 2,
};

function campaign(partial: Partial<CampaignResponse> = {}): CampaignResponse {
  return {
    id: 7,
    clientId: 1,
    name: "Lancement Café Démo",
    objective: "Notoriété de la nouvelle gamme",
    budget: 2500,
    consumedBudget: 0,
    status: "BROUILLON",
    aiStatus: null,
    adminStatus: null,
    startDate: isoInDays(5),
    endDate: isoInDays(30),
    startTime: "07:00:00",
    endTime: "12:00:00",
    estimatedViews: 0,
    priorityScore: 0,
    mediaCount: 0,
    zones: [],
    reservationsCount: 0,
    editable: true,
    submittable: true,
    deletable: true,
    createdAt: "2026-09-01T10:00:00Z",
    submittedAt: null,
    validatedAt: null,
    ...partial,
  };
}

function support(partial: Partial<SupportResponse> & { id: number }): SupportResponse {
  return {
    zoneId: 1,
    zoneName: "Tunis Centre",
    name: `Porteur ${partial.id}`,
    supportType: "ECRAN",
    latitude: 36.8,
    longitude: 10.18,
    technicalStatus: "ACTIF",
    diffusionCapacity: 1,
    ...partial,
  };
}

function item(
  partial: Partial<SupportAvailabilityItem> & { support: SupportResponse },
): SupportAvailabilityItem {
  return {
    distanceKm: 0.4,
    status: "DISPONIBLE",
    remainingCapacity: 1,
    reservedByCampaign: false,
    campaignReservationId: null,
    conflicts: [],
    estimatedViews: 1800,
    estimatedCost: 14.4,
    ...partial,
  };
}

function availability(
  supports: SupportAvailabilityItem[],
  partial: Partial<AvailabilityResponse> = {},
): AvailabilityResponse {
  const available = supports.filter((s) => s.status === "DISPONIBLE" && !s.reservedByCampaign);
  return {
    startDate: isoInDays(5),
    endDate: isoInDays(30),
    startTime: "07:00:00",
    endTime: "12:00:00",
    days: 26,
    hoursPerDay: 5,
    supports,
    summary: {
      totalSupports: supports.length,
      availableSupports: available.length,
      reservedSupports: 0,
      occupiedSupports: 0,
      maintenanceSupports: 0,
      offlineSupports: 0,
      estimatedViewsAvailable: available.reduce((s, i) => s + i.estimatedViews, 0),
      estimatedCostAvailable: available.reduce((s, i) => s + i.estimatedCost, 0),
    },
    alternatives: [],
    ...partial,
  };
}

function reservation(partial: Partial<ReservationResponse> = {}): ReservationResponse {
  return {
    id: 100,
    campaignId: 7,
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
    estimatedViews: 1800,
    estimatedCost: 14.4,
    cancellable: true,
    ...partial,
  };
}

function renderWizard() {
  return render(
    <ToastProvider>
      <NavigationGuardProvider>
        <CampaignWizard />
      </NavigationGuardProvider>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  clearResourceCache();
  resetUnsavedGuards();
  window.sessionStorage.clear();
  mocks.params.value = "";
  mocks.byCampaign.mockResolvedValue([]);
  mocks.mediaList.mockResolvedValue([]);
  mocks.zonesActive.mockResolvedValue([]);
  mocks.supportsAll.mockResolvedValue([]);
  mocks.recommendations.mockResolvedValue([]);
  mocks.availability.mockResolvedValue(availability([]));
  mocks.estimate.mockResolvedValue({
    campaignId: 7,
    budget: 2500,
    consumedBudget: 0,
    remainingBudget: 2500,
    lines: [],
    totalViews: 1800,
    totalCost: 14.4,
    budgetCoverage: 173.6,
    budgetSufficient: true,
  });
});

describe("CampaignWizard — chrome & URL", () => {
  it("opens the requested step of an existing draft with the 4-step meta", async () => {
    mocks.params.value = "id=7&etape=4";
    mocks.get.mockResolvedValue(campaign());
    renderWizard();

    expect(
      await screen.findByRole("heading", { level: 2, name: "Vérification & envoi" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Lancement Café Démo");
    expect(screen.getByText("Étape 4 sur 4")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Quitter l'assistant/ })).toHaveAttribute(
      "href",
      "/espace/campagnes/7",
    );
  });

  it("sends a submitted campaign back to its detail page", async () => {
    mocks.params.value = "id=7&etape=2";
    mocks.get.mockResolvedValue(campaign({ status: "REVIEW_REQUIRED" }));
    renderWizard();
    expect(await screen.findByText("Cette campagne n'est plus un brouillon")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir la campagne" })).toHaveAttribute(
      "href",
      "/espace/campagnes/7",
    );
  });
});

describe("CampaignWizard — step 1 Détails", () => {
  it("summarises the missing fields without calling the API", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(await screen.findByRole("button", { name: /Continuer vers le contenu/ }));
    const summary = await screen.findByRole("alert", { name: /champs à corriger/ });
    expect(within(summary).getAllByRole("link").length).toBeGreaterThanOrEqual(3);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates the draft with a time-slot preset, then custom hours", async () => {
    const user = userEvent.setup();
    mocks.create.mockResolvedValue(campaign({ id: 42 }));
    renderWizard();

    await user.type(await screen.findByLabelText(/Nom de la campagne/), "Lancement");
    await user.type(screen.getByLabelText(/^Objectif/), "Faire connaître la boutique");
    await user.type(screen.getByLabelText(/Budget déclaré/), "2500");
    const start = isoInDays(3);
    const end = isoInDays(10);
    const fr = (iso: string) => iso.split("-").reverse().join("");
    await user.type(screen.getByLabelText(/Date de début/), fr(start));
    await user.type(screen.getByLabelText(/Date de fin/), fr(end));

    const slots = screen.getByRole("group", { name: /Créneau horaire/ });
    await user.click(within(slots).getByRole("radio", { name: /Soir/ }));
    expect(within(slots).queryByLabelText(/Début/)).toBeNull();
    await user.click(screen.getByRole("button", { name: /Continuer vers le contenu/ }));

    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({
        name: "Lancement",
        objective: "Faire connaître la boutique",
        budget: 2500,
        startDate: start,
        endDate: end,
        startTime: "18:00:00",
        endTime: "23:00:00",
      }),
    );
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/espace/campagnes/nouvelle?id=42&etape=2", {
        scroll: false,
      }),
    );
  });

  it("offers custom hours with « Personnalisé »", async () => {
    const user = userEvent.setup();
    renderWizard();
    const slots = await screen.findByRole("group", { name: /Créneau horaire/ });
    await user.click(within(slots).getByRole("radio", { name: /Personnalisé/ }));
    expect(within(slots).getByRole("radio", { name: /Personnalisé/ })).toBeChecked();
    expect(within(slots).getAllByRole("combobox").length).toBeGreaterThanOrEqual(2);
  });
});

describe("CampaignWizard — step 2 Contenu", () => {
  it("uploads an image with progress, shows it and runs a pre-analysis", async () => {
    const user = userEvent.setup();
    mocks.params.value = "id=7&etape=2";
    mocks.get.mockResolvedValue(campaign());
    let progress: ((fraction: number) => void) | undefined;
    let finish: ((value: unknown) => void) | undefined;
    mocks.upload.mockImplementation(
      (_id: number, file: File, _opts: unknown, o: { onProgress?: (f: number) => void }) => {
        progress = o.onProgress;
        return new Promise((resolve) => {
          finish = () =>
            resolve({
              id: 5,
              campaignId: 7,
              fileName: file.name,
              fileType: "BANNER",
              mimeType: "image/png",
              fileSizeBytes: file.size,
              durationSeconds: null,
              widthPx: 1920,
              heightPx: 1080,
              url: "/uploads/campaigns/7/abc.png",
              checksum: "x",
              sortOrder: 0,
              createdAt: "2026-09-17T10:00:00Z",
            });
        });
      },
    );
    mocks.checkContent.mockResolvedValue({
      campaignId: 7,
      checkId: 3,
      aiStatus: "APPROVED",
      riskScore: 10,
      qualityScore: 85,
      detectedIssues: [],
      issues: [],
      recommendation: "Contenu conforme pour diffusion",
      recommendations: [],
      reason: null,
      sector: "RESTAURATION",
      contentType: "IMAGE",
      extractedText: "cafe demo",
      ocrEngine: "SIMULE",
      engine: "LOCAL",
      mediaAnalyses: [],
      matchedRules: [],
      preview: true,
      adminDecision: null,
      checkedAt: "2026-09-17T10:00:00Z",
    });
    renderWizard();

    expect(
      await screen.findByRole("heading", { level: 2, name: "Contenu de la campagne" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Aucun visuel pour l'instant")).toBeInTheDocument();
    expect(screen.queryByText(/à venir/)).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: /bannières/ }));
    const file = new File([new Uint8Array(2048)], "cafe-demo.png", { type: "image/png" });
    fireEvent.change(await screen.findByTestId("media-file-input"), { target: { files: [file] } });

    await waitFor(() =>
      expect(mocks.upload).toHaveBeenCalledWith(
        7,
        file,
        { kind: "BANNER", durationSeconds: null },
        expect.objectContaining({ onProgress: expect.any(Function) }),
      ),
    );
    progress?.(0.5);
    const bar = await screen.findByRole("progressbar");
    await waitFor(() => expect(bar).toHaveAttribute("aria-valuenow", "50"));
    finish?.(undefined);

    expect((await screen.findAllByText("cafe-demo.png")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Continuer vers la zone" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Pré-analyse IA$/ }));
    await waitFor(() => expect(mocks.checkContent).toHaveBeenCalledWith(7));
    expect(await screen.findByText("cafe demo")).toBeInTheDocument();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("rejects an unsupported file before any upload", async () => {
    mocks.params.value = "id=7&etape=2";
    mocks.get.mockResolvedValue(campaign());
    renderWizard();
    await screen.findByRole("heading", { level: 2, name: "Contenu de la campagne" });
    const file = new File(["%PDF"], "brochure.pdf", { type: "application/pdf" });
    fireEvent.change(await screen.findByTestId("media-file-input"), { target: { files: [file] } });
    expect(await screen.findByText(/brochure\.pdf :/)).toBeInTheDocument();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});

describe("CampaignWizard — step 3 Zone & Porteurs", () => {
  it("places a circle on the map, sets its radius and saves the zones", async () => {
    const user = userEvent.setup();
    mocks.params.value = "id=7&etape=3";
    mocks.get.mockResolvedValue(campaign());
    mocks.setZones.mockResolvedValue({
      zones: [{ ...ZONE, latitude: 36.8007, longitude: 10.1801, radiusKm: 5 }],
      cancelledReservationIds: [],
    });
    renderWizard();

    expect(await screen.findByText("Aucune zone enregistrée")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Point sur la carte" }));
    const slider = await screen.findByLabelText(/Rayon/);
    fireEvent.change(slider, { target: { value: "5" } });
    // Leaving the step is blocked while the circle is not saved.
    expect(screen.getByRole("button", { name: /Continuer vers la vérification/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Enregistrer les zones" }));

    await waitFor(() =>
      expect(mocks.setZones).toHaveBeenCalledWith(7, [
        expect.objectContaining({ latitude: 36.80071, longitude: 10.18012, radiusKm: 5 }),
      ]),
    );
    await waitFor(() => expect(mocks.availability).toHaveBeenCalled());
    expect(mocks.availability).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 7,
        startDate: isoInDays(5),
        endDate: isoInDays(30),
        startTime: "07:00:00",
        endTime: "12:00:00",
      }),
      expect.anything(),
    );
  });

  it("lists Porteurs by status with the summary, books a batch and reports conflicts", async () => {
    const user = userEvent.setup();
    mocks.params.value = "id=7&etape=3";
    mocks.get.mockResolvedValue(campaign({ zones: [ZONE] }));
    const free = support({ id: 11, name: "Écran LED Avenue" });
    const other = support({ id: 12, name: "Totem Passage", supportType: "PANNEAU_NUMERIQUE" });
    const busy = support({ id: 13, name: "Mât Lac" });
    const down = support({ id: 14, name: "Écran Gare", technicalStatus: "MAINTENANCE" });
    mocks.availability.mockResolvedValue(
      availability([
        item({ support: free }),
        item({ support: other }),
        item({ support: busy, status: "OCCUPE", remainingCapacity: 0 }),
        item({ support: down, status: "MAINTENANCE", remainingCapacity: 0 }),
      ]),
    );
    mocks.createBatch.mockRejectedValueOnce(
      new ApiError(409, "Conflit", {
        code: "BATCH_CONFLICT",
        rawFieldErrors: { "12": "SUPPORT_ALREADY_RESERVED" },
      }),
    );
    renderWizard();

    expect(await screen.findByText(/2 Porteurs disponibles sur 4/)).toBeInTheDocument();
    const rows = screen.getByRole("list", { name: "Porteurs dans les zones" });
    expect(within(rows).getByText("Occupé")).toBeInTheDocument();
    expect(within(rows).getByText("Maintenance")).toBeInTheDocument();
    // Only DISPONIBLE rows can be selected.
    expect(screen.queryByRole("checkbox", { name: /Sélectionner Mât Lac/ })).toBeNull();

    await user.click(screen.getByRole("checkbox", { name: /Sélectionner Écran LED Avenue/ }));
    await user.click(screen.getByRole("checkbox", { name: /Sélectionner Totem Passage/ }));
    await user.click(screen.getByRole("button", { name: /Réserver 2 Porteurs/ }));

    await waitFor(() =>
      expect(mocks.createBatch).toHaveBeenCalledWith({ campaignId: 7, supportIds: [11, 12] }),
    );
    expect(await screen.findByText("Réservation non effectuée")).toBeInTheDocument();
    expect(screen.getByText(/1 Porteur n'est plus disponible/)).toBeInTheDocument();
  });

  it("shows alternative slots when the zone is saturated and applies one", async () => {
    const user = userEvent.setup();
    mocks.params.value = "id=7&etape=3";
    mocks.get.mockResolvedValue(campaign({ zones: [ZONE] }));
    mocks.availability.mockResolvedValue(
      availability([item({ support: support({ id: 13, name: "Mât Lac" }), status: "RESERVE" })], {
        alternatives: [
          {
            startDate: isoInDays(5),
            endDate: isoInDays(30),
            startTime: "18:00:00",
            endTime: "23:00:00",
            preset: "SOIR",
            availableSupports: 3,
            estimatedViewsAvailable: 5000,
          },
        ],
      }),
    );
    mocks.update.mockResolvedValue(
      campaign({ zones: [ZONE], startTime: "18:00:00", endTime: "23:00:00" }),
    );
    renderWizard();

    const list = await screen.findByRole("list", { name: "Créneaux alternatifs" });
    await user.click(within(list).getByRole("button", { name: /3 Porteurs disponibles/ }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ startTime: "18:00:00", endTime: "23:00:00" }),
      ),
    );
  });

  it("displays recommended zones and targets one", async () => {
    const user = userEvent.setup();
    mocks.params.value = "id=7&etape=3";
    mocks.get.mockResolvedValue(campaign());
    mocks.recommendations.mockResolvedValue([
      {
        zone: {
          id: 2,
          name: "Les Berges du Lac",
          latitude: 36.835,
          longitude: 10.235,
          radiusKm: 2,
          isActive: true,
        },
        score: 87,
        totalSupports: 5,
        availableSupports: 4,
        estimatedViewsAvailable: 12000,
        estimatedCostAvailable: 96,
        recentViewsPerSupport: 300,
        reasons: ["4 Porteurs disponibles sur 5", "Forte audience récente"],
      },
    ]);
    renderWizard();

    expect(await screen.findByText("Les Berges du Lac")).toBeInTheDocument();
    expect(screen.getByText("Score 87")).toBeInTheDocument();
    expect(screen.getByText(/Forte audience récente/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Cibler cette zone/ }));
    expect(await screen.findByRole("button", { name: "Enregistrer les zones" })).toBeVisible();
    expect(screen.getByText("36.8350, 10.2350")).toBeInTheDocument();
  });
});

describe("CampaignWizard — step 4 Vérification & envoi", () => {
  it("submits once and shows the AI result with issues and recommendations", async () => {
    const user = userEvent.setup();
    mocks.params.value = "id=7&etape=4";
    mocks.get.mockResolvedValue(campaign({ zones: [ZONE], reservationsCount: 1 }));
    mocks.byCampaign.mockResolvedValue([reservation()]);
    mocks.submit.mockResolvedValue(campaign({ status: "REJECTED_BY_AI", aiStatus: "REJECTED" }));
    mocks.report.mockResolvedValue({
      campaignId: 7,
      checkId: 4,
      aiStatus: "REJECTED",
      riskScore: 90,
      qualityScore: 50,
      detectedIssues: ["alcool"],
      issues: [{ label: "Mot interdit : alcool", severity: "CRITICAL", source: "REGLE" }],
      recommendation: "Contenu non diffusable en l'état : corrigez les points signalés",
      recommendations: ["Retirez la mention d'alcool"],
      reason: null,
      sector: "RESTAURATION",
      contentType: "TEXTE",
      extractedText: null,
      ocrEngine: "AUCUN",
      engine: "LOCAL",
      mediaAnalyses: [],
      matchedRules: [],
      preview: false,
      adminDecision: null,
      checkedAt: "2026-09-17T10:00:00Z",
    });
    renderWizard();

    expect(await screen.findByText("Avant la soumission")).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Soumettre" });
    expect(submit).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("checkbox", { name: /J'ai relu ma campagne/ }));
    await user.click(screen.getByRole("button", { name: "Soumettre" }));

    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
    expect(mocks.checkContent).not.toHaveBeenCalled();
    expect(await screen.findByText("Mot interdit : alcool")).toBeInTheDocument();
    expect(screen.getByText("Retirez la mention d'alcool")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voir et corriger la campagne/ })).toHaveAttribute(
      "href",
      "/espace/campagnes/7",
    );
  });

  it("keeps submit disabled while the checklist is incomplete", async () => {
    mocks.params.value = "id=7&etape=4";
    mocks.get.mockResolvedValue(campaign());
    renderWizard();
    expect(await screen.findByText("Placez au moins une zone sur la carte.")).toBeInTheDocument();
    expect(
      screen.getByText("Réservez au moins un Porteur disponible dans la zone."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Soumettre" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
