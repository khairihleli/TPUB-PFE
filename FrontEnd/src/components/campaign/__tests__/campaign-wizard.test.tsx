import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mine: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  submit: vi.fn(),
  duplicate: vi.fn(),
  byCampaign: vi.fn(),
  createReservation: vi.fn(),
  report: vi.fn(),
  checkContent: vi.fn(),
  supportsAll: vi.fn(),
  availability: vi.fn(),
  zonesAll: vi.fn(),
  zonesActive: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  params: { value: "" },
}));

vi.mock("@/lib/api/endpoints", () => ({
  campaignsApi: {
    mine: mocks.mine,
    create: mocks.create,
    update: mocks.update,
    remove: mocks.remove,
    submit: mocks.submit,
    duplicate: mocks.duplicate,
  },
  reservationsApi: { byCampaign: mocks.byCampaign, create: mocks.createReservation },
  aiApi: { report: mocks.report, checkContent: mocks.checkContent },
  supportsApi: { all: mocks.supportsAll, availability: mocks.availability },
  zonesApi: { all: mocks.zonesAll, active: mocks.zonesActive },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.params.value),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => "/espace/campagnes/nouvelle",
}));

// three.js is not exercised here (Studio covered by its own tests).
vi.mock("@/components/porteur3d", () => ({
  PorteurStudio: () => null,
  StudioControls: () => null,
}));

import { CampaignWizard } from "@/components/campaign/campaign-wizard";
import { NavigationGuardProvider } from "@/components/shell/navigation-guard";
import { ToastProvider } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import type {
  CampaignResponse,
  ReservationResponse,
  SupportResponse,
  ZoneResponse,
} from "@/lib/api/types";
import { resetUnsavedGuards } from "@/lib/forms/unsaved-guard";
import { todayISO } from "@/lib/format";
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
    status: "BROUILLON",
    aiStatus: null,
    adminStatus: null,
    startDate: isoInDays(5),
    endDate: isoInDays(30),
    startTime: "08:00:00",
    endTime: "22:00:00",
    estimatedViews: 1000,
    priorityScore: 0,
    createdAt: "2026-09-01T10:00:00Z",
    submittedAt: null,
    validatedAt: null,
    ...partial,
  };
}

const ZONES: ZoneResponse[] = [
  { id: 1, name: "Tunis Centre", latitude: 36.8, longitude: 10.18, radiusKm: 3, isActive: true },
  { id: 2, name: "Bizerte", latitude: 37.27, longitude: 9.87, radiusKm: 3, isActive: true },
];

function support(partial: Partial<SupportResponse>): SupportResponse {
  return {
    id: 11,
    zoneId: 1,
    zoneName: "Tunis Centre",
    name: "Porteur",
    supportType: "ECRAN",
    latitude: 0,
    longitude: 0,
    technicalStatus: "ACTIF",
    diffusionCapacity: 6,
    porteurType: "A",
    address: null,
    ...partial,
  };
}

const SCREENS: SupportResponse[] = [
  support({ id: 11, name: "Écran LED Avenue", address: "Avenue Habib Bourguiba" }),
  support({ id: 12, name: "Totem Passage", supportType: "PANNEAU_NUMERIQUE" }),
  support({ id: 13, name: "Mât Lac", address: "Rue du Lac Léman" }),
];

function reservation(partial: Partial<ReservationResponse> = {}): ReservationResponse {
  const c = campaign();
  return {
    id: 100,
    campaignId: 7,
    zoneId: 1,
    supportId: 11,
    startDate: c.startDate!,
    endDate: c.endDate!,
    startTime: "08:00:00",
    endTime: "22:00:00",
    availabilityStatus: "RESERVE",
    reservationStatus: "TEMPORAIRE",
    estimatedViews: 1000,
    estimatedCost: 250,
    ...partial,
  };
}

function renderWizard(extra?: React.ReactNode) {
  return render(
    <ToastProvider>
      <NavigationGuardProvider>
        {extra}
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
  mocks.supportsAll.mockResolvedValue(SCREENS);
  mocks.zonesAll.mockResolvedValue(ZONES);
  mocks.zonesActive.mockResolvedValue(ZONES);
  mocks.availability.mockResolvedValue([]);
});

describe("CampaignWizard — chrome & URL", () => {
  it("clamps ?etape=3 back to step 2 when no Porteur is booked", async () => {
    mocks.params.value = "id=7&etape=3";
    mocks.mine.mockResolvedValue([campaign()]);
    mocks.byCampaign.mockResolvedValue([]);
    renderWizard();

    expect(await screen.findByRole("heading", { level: 2, name: "Porteurs" })).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/espace/campagnes/nouvelle?id=7&etape=2", {
        scroll: false,
      }),
    );
  });

  it("opens Vérification for a legacy ?etape=4 draft with créneaux, with name h1 and step meta", async () => {
    mocks.params.value = "id=7&etape=4";
    mocks.mine.mockResolvedValue([campaign()]);
    mocks.byCampaign.mockResolvedValue([reservation()]);
    renderWizard();

    expect(
      await screen.findByRole("heading", { level: 2, name: "Vérification & envoi" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Lancement Café Démo");
    expect(screen.getByText("Étape 3 sur 3")).toBeInTheDocument();
    // Description only on step 1.
    expect(screen.queryByText(/Trois étapes/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Quitter l'assistant/ })).toHaveAttribute(
      "href",
      "/espace/campagnes/7",
    );
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/espace/campagnes/nouvelle?id=7&etape=3", {
        scroll: false,
      }),
    );
  });
});

describe("CampaignWizard — step 1 Détails", () => {
  it("shows one error summary with 5 links and no field role=alert", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(await screen.findByRole("button", { name: /Continuer vers les Porteurs/ }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts).toHaveLength(1);
    const summary = alerts[0]!;
    expect(summary).toHaveTextContent("5 champs à corriger");
    expect(within(summary).getAllByRole("link")).toHaveLength(5);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("hints review-trigger terms under the objective without blocking", async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.type(await screen.findByLabelText(/^Objectif/), "Entrée gratuite ce week-end");
    expect(
      screen.getByText(/Le terme « gratuit » déclenche généralement un examen manuel/),
    ).toBeInTheDocument();
  });

  it("guards a link click while the form is dirty", async () => {
    const user = userEvent.setup();
    renderWizard(<Link href="/espace/reservations">Réservations</Link>);
    await user.type(await screen.findByLabelText(/Nom de la campagne/), "Lancement");
    await user.click(screen.getByRole("link", { name: "Réservations" }));
    expect(
      await screen.findByRole("dialog", { name: /^Quitter sans enregistrer\s\?$/ }),
    ).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("restores typed values from the local draft after a reload", async () => {
    const user = userEvent.setup();
    const first = renderWizard();
    await user.type(await screen.findByLabelText(/Nom de la campagne/), "Ouverture La Marsa");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 650));
    });
    first.unmount();
    resetUnsavedGuards();

    renderWizard();
    expect(await screen.findByText(/Saisie restaurée/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Nom de la campagne/)).toHaveValue("Ouverture La Marsa");
  });

  it("creates the draft with French date entry and HH:mm:ss times", async () => {
    const user = userEvent.setup();
    const created = campaign({ id: 42 });
    mocks.create.mockResolvedValue(created);
    renderWizard();

    await user.type(await screen.findByLabelText(/Nom de la campagne/), "Lancement");
    await user.type(screen.getByLabelText(/^Objectif/), "Faire connaître la boutique");
    await user.type(screen.getByLabelText(/Budget déclaré/), "2500");
    const start = isoInDays(3);
    const end = isoInDays(10);
    const fr = (iso: string) => iso.split("-").reverse().join("");
    await user.type(screen.getByLabelText(/Date de début/), fr(start));
    await user.type(screen.getByLabelText(/Date de fin/), fr(end));
    await user.click(screen.getByRole("button", { name: /Continuer vers les Porteurs/ }));

    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({
        name: "Lancement",
        objective: "Faire connaître la boutique",
        budget: 2500,
        startDate: start,
        endDate: end,
        startTime: "08:00:00",
        endTime: "22:00:00",
      }),
    );
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/espace/campagnes/nouvelle?id=42&etape=2", {
        scroll: false,
      }),
    );
  });

  it("locks the period when créneaux exist and offers « Changer de période… »", async () => {
    mocks.params.value = "id=7&etape=1";
    mocks.mine.mockResolvedValue([campaign()]);
    mocks.byCampaign.mockResolvedValue([reservation()]);
    renderWizard();

    expect(
      await screen.findByText(
        "La période est verrouillée : des Porteurs sont bloqués sur ces dates.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Date de début/)).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Changer de période…" })).toBeInTheDocument();
  });
});

describe("CampaignWizard — step 2 Porteurs (availability first, booking on Continue)", () => {
  it("lists every Porteur with its availability: busy disabled, free first, chip counts", async () => {
    mocks.params.value = "id=7&etape=2";
    mocks.mine.mockResolvedValue([campaign()]);
    mocks.byCampaign.mockResolvedValue([]);
    mocks.availability.mockImplementation((id: number) =>
      Promise.resolve(
        id === 11
          ? [
              {
                startDate: isoInDays(8),
                endDate: isoInDays(12),
                startTime: "08:00:00",
                endTime: "22:00:00",
                reservationStatus: "CONFIRMEE",
              },
            ]
          : [],
      ),
    );
    renderWizard();

    const busy = await screen.findByRole("checkbox", { name: /Écran LED Avenue/ });
    await waitFor(() => expect(busy).toBeDisabled());
    expect(screen.getByText(/^Réservé du /)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Totem Passage/ })).toBeEnabled();

    // Free first, busy last.
    const names = screen
      .getAllByRole("checkbox")
      .map((el) => el.closest("label")?.textContent ?? "");
    expect(names[names.length - 1]).toMatch(/Écran LED Avenue/);

    // Chip counts count free Porteurs; a zone without active Porteur is a disabled chip.
    const chips = screen.getByRole("list", { name: "Filtrer par zone" });
    expect(
      within(chips).getByRole("button", { name: /^Toutes\s*2\s*disponibles$/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(chips).getByRole("button", { name: /^Tunis Centre\s*2\s*disponibles$/ }),
    ).toBeEnabled();
    expect(within(chips).getByRole("button", { name: /Bizerte/ })).toBeDisabled();
    expect(within(chips).getByRole("button", { name: /Bizerte/ })).toHaveTextContent(
      "Aucun Porteur actif",
    );

    // Text filter on name + street.
    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox", { name: /Rechercher un Porteur/ }), "lac leman");
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: /Mât Lac/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voir en 3D\s*:\s*Mât Lac/ })).toHaveAttribute(
      "href",
      "/espace/reseau?porteur=13",
    );
    // Capacity is not shown to advertisers.
    expect(screen.queryByText(/Capacité de diffusion/)).not.toBeInTheDocument();
  });

  it("gates « Continuer » with a reason when nothing is selected or booked", async () => {
    mocks.params.value = "id=7&etape=2";
    mocks.mine.mockResolvedValue([campaign()]);
    mocks.byCampaign.mockResolvedValue([]);
    renderWizard();

    const cont = await screen.findByRole("button", { name: "Continuer" });
    expect(cont).toHaveAttribute("aria-disabled", "true");
    expect(cont).toHaveAccessibleDescription("Sélectionnez au moins un Porteur");
    expect(
      screen.queryByRole("region", { name: "Réservation des Porteurs" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Bloquer le créneau/ })).not.toBeInTheDocument();
  });

  it("books every selected Porteur with its own zone, then moves to step 3", async () => {
    const user = userEvent.setup();
    mocks.params.value = "id=7&etape=2";
    mocks.mine.mockResolvedValue([campaign()]);
    mocks.byCampaign.mockResolvedValue([]);
    mocks.createReservation
      .mockResolvedValueOnce(reservation({ id: 101, supportId: 11 }))
      .mockResolvedValueOnce(reservation({ id: 102, supportId: 12 }));
    renderWizard();

    await user.click(await screen.findByRole("checkbox", { name: /Écran LED Avenue/ }));
    await user.click(screen.getByRole("checkbox", { name: /Totem Passage/ }));
    const bar = screen.getByRole("region", { name: "Réservation des Porteurs" });
    expect(bar).toHaveTextContent("2 Porteurs sélectionnés");
    expect(bar).toHaveTextContent(
      "Bloquer verrouille la période de ce brouillon. Un créneau n'est pas libérable en ligne.",
    );
    expect(screen.getAllByText("À réserver")).toHaveLength(2);
    await user.click(within(bar).getByRole("button", { name: "Réserver 2 Porteurs et continuer" }));

    await waitFor(() => expect(mocks.createReservation).toHaveBeenCalledTimes(2));
    expect(mocks.createReservation).toHaveBeenNthCalledWith(1, {
      campaignId: 7,
      zoneId: 1,
      supportId: 11,
      startDate: campaign().startDate,
      endDate: campaign().endDate,
      startTime: "08:00:00",
      endTime: "22:00:00",
    });
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/espace/campagnes/nouvelle?id=7&etape=3", {
        scroll: false,
      }),
    );
  });

  it("stays on step 2 with the Porteur flagged when one booking conflicts (no toast)", async () => {
    const user = userEvent.setup();
    mocks.params.value = "id=7&etape=2";
    mocks.mine.mockResolvedValue([campaign()]);
    mocks.byCampaign.mockResolvedValue([]);
    mocks.createReservation
      .mockResolvedValueOnce(reservation({ id: 101, supportId: 11 }))
      .mockRejectedValueOnce(
        new ApiError(400, "Conflit", {
          rawMessage: "Support already reserved for the selected period",
        }),
      );
    renderWizard();

    await user.click(await screen.findByRole("checkbox", { name: /Écran LED Avenue/ }));
    await user.click(screen.getByRole("checkbox", { name: /Totem Passage/ }));
    await user.click(screen.getByRole("button", { name: "Réserver 2 Porteurs et continuer" }));

    await waitFor(() => expect(mocks.createReservation).toHaveBeenCalledTimes(2));
    const results = await screen.findByRole("list", { name: "Résultat de la réservation" });
    expect(results).toHaveTextContent("Écran LED Avenue : bloqué");
    expect(results).toHaveTextContent(
      "Totem Passage : Ce Porteur est déjà réservé sur votre période.",
    );
    expect(mocks.push).not.toHaveBeenCalledWith(
      "/espace/campagnes/nouvelle?id=7&etape=3",
      expect.anything(),
    );
    expect(screen.queryByText(/créneaux bloqués temporairement/)).not.toBeInTheDocument();
  });

  it("never reaches step 3 with a pending, unbooked selection", async () => {
    const user = userEvent.setup();
    mocks.params.value = "id=7&etape=2";
    mocks.mine.mockResolvedValue([campaign()]);
    // One créneau already exists: step 3 is reachable from the stepper…
    mocks.byCampaign.mockResolvedValue([reservation({ supportId: 13 })]);
    mocks.createReservation.mockRejectedValue(new ApiError(502, "Indisponible"));
    renderWizard();

    const steps = await screen.findByRole("navigation", {
      name: "Étapes de création de la campagne",
    });
    // …until a Porteur is selected but not booked.
    await user.click(await screen.findByRole("checkbox", { name: /Totem Passage/ }));
    const verification = within(steps).getByRole("button", { name: /Vérification & envoi/ });
    expect(verification).toHaveAttribute("aria-disabled", "true");
    await user.click(verification);

    // The bar's primary books first; a failure keeps the user on step 2.
    await user.click(screen.getByRole("button", { name: "Réserver 1 Porteur et continuer" }));
    await waitFor(() => expect(mocks.createReservation).toHaveBeenCalledTimes(1));
    await screen.findByRole("list", { name: "Résultat de la réservation" });
    expect(mocks.push).not.toHaveBeenCalledWith(
      "/espace/campagnes/nouvelle?id=7&etape=3",
      expect.anything(),
    );

    // Unselecting clears the block: « Continuer » goes on with the existing créneau.
    await user.click(screen.getByRole("checkbox", { name: /Totem Passage/ }));
    await user.click(screen.getByRole("button", { name: "Continuer" }));
    expect(mocks.push).toHaveBeenCalledWith("/espace/campagnes/nouvelle?id=7&etape=3", {
      scroll: false,
    });
  });

  it("keeps a « Libérer ce créneau » mailto on booked Porteurs", async () => {
    mocks.params.value = "id=7&etape=2";
    mocks.mine.mockResolvedValue([campaign()]);
    mocks.byCampaign.mockResolvedValue([reservation({ id: 555, supportId: 11 })]);
    renderWizard();

    const release = await screen.findByRole("link", { name: /Libérer ce créneau/ });
    expect(release.getAttribute("href")).toMatch(/^mailto:/);
    expect(decodeURIComponent(release.getAttribute("href") ?? "")).toMatch(/CAMP-00007.*n° 555/s);
    expect(screen.getAllByText("Bloqué · en attente de décision TPUB").length).toBeGreaterThan(0);
  });
});

describe("CampaignWizard — step 3 Vérification & envoi", () => {
  it("submits directly after the single checkbox gate, then shows the result", async () => {
    const user = userEvent.setup();
    mocks.params.value = "id=7&etape=3";
    mocks.mine.mockResolvedValue([
      campaign({ objective: "Entrée gratuite pour les moins de 12 ans" }),
    ]);
    mocks.byCampaign.mockResolvedValue([reservation()]);
    mocks.submit.mockResolvedValue(campaign({ status: "PENDING_AI_CHECK" }));
    mocks.checkContent.mockResolvedValue({
      campaignId: 7,
      aiStatus: "APPROVED",
      riskScore: 20,
      qualityScore: 75,
      detectedIssues: [],
      recommendation: "Contenu conforme pour diffusion",
    });
    renderWizard();

    expect((await screen.findByText(/Termes à préciser/)).closest("p")).toHaveTextContent(
      "« gratuit »",
    );
    expect(screen.getByText("Après envoi, la campagne n'est plus modifiable.")).toBeInTheDocument();
    const send = screen.getByRole("button", { name: /Soumettre à la modération/ });
    expect(send).toHaveAttribute("aria-disabled", "true");
    await user.click(send);
    expect(mocks.submit).not.toHaveBeenCalled();

    await user.click(screen.getByLabelText(/J'ai relu ma campagne/));
    await user.click(screen.getByRole("button", { name: /Soumettre à la modération/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    expect(await screen.findByRole("heading", { name: "Analyse favorable" })).toBeInTheDocument();
    expect(mocks.submit).toHaveBeenCalledWith(7);
    expect(mocks.checkContent).toHaveBeenCalledWith(7);
    expect(screen.getByRole("link", { name: /Voir la campagne/ })).toHaveAttribute(
      "href",
      "/espace/campagnes/7",
    );
  });

  it("offers the optional, collapsed creative preview", async () => {
    mocks.params.value = "id=7&etape=3";
    mocks.mine.mockResolvedValue([campaign()]);
    mocks.byCampaign.mockResolvedValue([reservation()]);
    renderWizard();
    const summary = await screen.findByText("Aperçu du visuel (facultatif)");
    expect(summary.closest("details")).not.toHaveAttribute("open");
  });
});
