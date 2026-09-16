import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mine: vi.fn(),
  remove: vi.fn(),
  submit: vi.fn(),
  update: vi.fn(),
  duplicate: vi.fn(),
  byCampaign: vi.fn(),
  createReservation: vi.fn(),
  report: vi.fn(),
  checkContent: vi.fn(),
  supportsAll: vi.fn(),
  zonesAll: vi.fn(),
  zonesActive: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  params: { value: "" },
}));

vi.mock("@/lib/api/endpoints", () => ({
  campaignsApi: {
    mine: mocks.mine,
    remove: mocks.remove,
    submit: mocks.submit,
    update: mocks.update,
    duplicate: mocks.duplicate,
  },
  reservationsApi: { byCampaign: mocks.byCampaign, create: mocks.createReservation },
  aiApi: { report: mocks.report, checkContent: mocks.checkContent },
  supportsApi: { all: mocks.supportsAll },
  zonesApi: { all: mocks.zonesAll, active: mocks.zonesActive },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.params.value),
  usePathname: () => "/espace/campagnes/7",
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, back: vi.fn() }),
}));

import Link from "next/link";

import { CampaignDetail, deleteDescription } from "@/components/campaign/campaign-detail";
import { CampaignEdit } from "@/components/campaign/campaign-edit";
import { NavigationGuardProvider } from "@/components/shell/navigation-guard";
import { ToastProvider } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import type {
  CampaignResponse,
  ReservationResponse,
  SupportResponse,
  ZoneResponse,
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

const ZONE: ZoneResponse = {
  id: 1,
  name: "Tunis Centre",
  latitude: 36.8,
  longitude: 10.18,
  radiusKm: 3,
  isActive: true,
};

const SCREENS: SupportResponse[] = [
  {
    id: 11,
    zoneId: 1,
    zoneName: "Tunis Centre",
    name: "Écran LED Avenue",
    supportType: "ECRAN",
    latitude: 0,
    longitude: 0,
    technicalStatus: "ACTIF",
    diffusionCapacity: 6,
  },
  {
    id: 12,
    zoneId: 1,
    zoneName: "Tunis Centre",
    name: "Totem Passage",
    supportType: "PANNEAU_NUMERIQUE",
    latitude: 0,
    longitude: 0,
    technicalStatus: "ACTIF",
    diffusionCapacity: 2,
  },
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

function noReport() {
  return new ApiError(400, "x", { rawMessage: "No AI report found for campaign: 7" });
}

function renderWithToasts(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearResourceCache();
  resetUnsavedGuards();
  window.sessionStorage.clear();
  mocks.params.value = "";
  mocks.supportsAll.mockResolvedValue(SCREENS);
  mocks.zonesAll.mockResolvedValue([ZONE]);
  mocks.zonesActive.mockResolvedValue([ZONE]);
});

afterEach(() => {
  vi.useRealTimers();
  setVisibility("visible");
});

describe("CampaignDetail", () => {
  it("never shows a campaign that is not in /campaigns/mine (IA-23)", async () => {
    mocks.mine.mockResolvedValue([campaign({ id: 3, name: "Soldes d'été" })]);
    renderWithToasts(<CampaignDetail idParam="7" />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Campagne introuvable" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Cette campagne n'existe pas ou n'appartient pas à votre espace."),
    ).toBeInTheDocument();
    // trail Campagnes › Introuvable (inline outside the shell)
    expect(screen.getByRole("navigation", { name: "Fil d'Ariane" })).toHaveTextContent(
      /Campagnes.*Introuvable/,
    );
    // recent campaigns from /mine, served by the shared cache
    expect(await screen.findByRole("link", { name: "Soldes d'été" })).toHaveAttribute(
      "href",
      "/espace/campagnes/3",
    );
    expect(screen.getByRole("button", { name: /Rechercher/ })).toBeInTheDocument();
    expect(mocks.mine).toHaveBeenCalledTimes(1);
    expect(mocks.byCampaign).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("renders a draft: header actions, sections, linked objects, no AI report request", async () => {
    mocks.mine.mockResolvedValue([campaign()]);
    mocks.byCampaign.mockResolvedValue([reservation()]);
    renderWithToasts(<CampaignDetail idParam="7" />);

    const h1 = await screen.findByRole("heading", { level: 1, name: "Lancement Café Démo" });
    // status pill right after the title (VD-20), advertiser wording
    expect(h1.nextElementSibling).toHaveTextContent("Brouillon");
    expect(screen.getByText("CAMP-00007")).toBeInTheDocument();
    expect(mocks.report).not.toHaveBeenCalled();

    const header = h1.closest("header")!;
    const finalise = within(header).getByRole("link", { name: /Finaliser/ });
    expect(finalise).toHaveAttribute("href", "/espace/campagnes/nouvelle?id=7&etape=3");
    const details = within(header).getByRole("link", { name: /Modifier les détails/ });
    expect(details).toHaveAttribute("href", "/espace/campagnes/nouvelle?id=7&etape=1");
    // one editing flow per status: no /modifier for drafts (IA-05)
    expect(
      screen.queryAllByRole("link").filter((l) => l.getAttribute("href")?.endsWith("/modifier")),
    ).toHaveLength(0);
    // tab order primary → secondary → overflow (FFA-24)
    const focusables = Array.from(header.querySelectorAll<HTMLElement>("a[href], button"));
    const labels = focusables.map((el) => el.getAttribute("aria-label") ?? el.textContent?.trim());
    expect(labels.indexOf("Finaliser")).toBeLessThan(labels.indexOf("Modifier les détails"));
    expect(labels.indexOf("Modifier les détails")).toBeLessThan(labels.indexOf("Plus d'actions"));
    // no submit gate on the detail page: submission lives in the wizard
    expect(screen.queryByRole("button", { name: /^Soumettre/ })).not.toBeInTheDocument();

    // sections
    expect(
      screen.getByRole("heading", { level: 2, name: "Suivi de la campagne" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Coût estimé des créneaux" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Budget déclaré", { selector: "dt" }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Budget total/)).not.toBeInTheDocument();
    expect(screen.getByText("Aucune analyse pour cette campagne")).toBeInTheDocument();

    // linked objects (IA-06, IA-07, IA-13)
    expect(screen.getByRole("link", { name: "Écran LED Avenue" })).toHaveAttribute(
      "href",
      "/espace/reseau?porteur=11",
    );
    expect(screen.getByRole("link", { name: /Voir en 3D.*Écran LED Avenue/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Tunis Centre/ })).toHaveAttribute(
      "href",
      "/espace/reseau?zone=1",
    );
    expect(screen.getByRole("link", { name: /Tout voir dans Réservations/ })).toHaveAttribute(
      "href",
      "/espace/reservations?campagne=7",
    );
    expect(screen.getByText("Bloqué · en attente de décision TPUB")).toBeInTheDocument();
  });

  it("deletes after a confirmation naming the campaign and the créneaux released", async () => {
    const user = userEvent.setup();
    mocks.mine.mockResolvedValue([campaign()]);
    mocks.byCampaign.mockResolvedValue([reservation(), reservation({ id: 101, supportId: 12 })]);
    mocks.remove.mockResolvedValue(undefined);
    renderWithToasts(<CampaignDetail idParam="7" />);

    await screen.findByRole("heading", { level: 1, name: "Lancement Café Démo" });
    await user.click(screen.getAllByRole("button", { name: "Plus d'actions" })[0]!);
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Dupliquer", "Supprimer"]);
    await user.click(items[1]!);

    const dialog = await screen.findByRole("dialog", {
      // frTypo binds « » and ? with no-break spaces.
      name: /^Supprimer «\sLancement Café Démo\s»\s\?$/,
    });
    expect(dialog).toHaveTextContent(
      /2 créneaux bloqués du .+ seront libérés\. Action définitive\./,
    );
    await user.click(within(dialog).getByRole("button", { name: "Supprimer" }));

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(7));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/espace/campagnes"));
  });

  it("offers « Dupliquer et corriger » for REJECTED_BY_AI and opens step 2 of the copy", async () => {
    const user = userEvent.setup();
    const rejected = campaign({
      status: "REJECTED_BY_AI",
      aiStatus: "REJECTED",
      submittedAt: "2026-09-10T10:00:00Z",
    });
    mocks.mine.mockResolvedValue([rejected]);
    mocks.byCampaign.mockResolvedValue([reservation()]);
    mocks.report.mockResolvedValue({
      campaignId: 7,
      aiStatus: "REJECTED",
      riskScore: 80,
      qualityScore: 30,
      detectedIssues: ["texte ambigu"],
      recommendation: "Revoir le message",
    });
    mocks.duplicate.mockResolvedValue(campaign({ id: 8 }));
    renderWithToasts(<CampaignDetail idParam="7" />);

    expect(await screen.findByText("texte ambigu")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Prochaine étape" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Soumettre/ })).not.toBeInTheDocument();

    // non-draft editable status keeps /modifier, in the overflow menu
    await user.click(screen.getByRole("button", { name: "Plus d'actions" }));
    expect(
      await screen.findByRole("menuitem", { name: /Modifier les informations/ }),
    ).toHaveAttribute("href", "/espace/campagnes/7/modifier");
    await user.keyboard("{Escape}");

    await user.click(screen.getAllByRole("button", { name: /Dupliquer et corriger/ })[0]!);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Dupliquer" }));

    await waitFor(() => expect(mocks.duplicate).toHaveBeenCalledWith(rejected));
    expect(mocks.remove).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/espace/campagnes/nouvelle?id=8&etape=2"),
    );
  });

  it("tells the truth about a validated campaign that starts later (FLOW-14, §6.4–6.5)", async () => {
    mocks.mine.mockResolvedValue([
      campaign({
        status: "ACTIVE",
        aiStatus: "APPROVED",
        adminStatus: "VALIDATED",
        submittedAt: "2026-09-01T10:00:00Z",
        validatedAt: "2026-09-02T10:00:00Z",
      }),
    ]);
    mocks.byCampaign.mockResolvedValue([reservation({ reservationStatus: "CONFIRMEE" })]);
    mocks.report.mockResolvedValue({
      campaignId: 7,
      aiStatus: "APPROVED",
      riskScore: 10,
      qualityScore: 80,
      detectedIssues: [],
      recommendation: "Conforme",
    });
    renderWithToasts(<CampaignDetail idParam="7" />);

    const h1 = await screen.findByRole("heading", { level: 1, name: "Lancement Café Démo" });
    expect(h1.nextElementSibling).toHaveTextContent("Programmée");
    const stepper = screen.getByRole("list", { name: "Étapes de la campagne" });
    const steps = within(stepper).getAllByRole("listitem");
    expect(steps[2]).toHaveTextContent("Validation TPUB — Terminée");
    expect(steps[3]).toHaveTextContent("Diffusion — À venir");
    expect(steps[3]).toHaveTextContent("Dans 5 jours");
    expect(steps[3]).not.toHaveAttribute("aria-current");
    expect(screen.getAllByText("Diffusion dans 5 jours").length).toBeGreaterThan(0);

    const mail = screen.getByRole("link", { name: /Envoyer le visuel par e-mail/ });
    expect(mail.getAttribute("href")).toMatch(/^mailto:/);
    expect(decodeURIComponent(mail.getAttribute("href")!)).toContain("CAMP-00007");
    // no edit, no delete once validated
    expect(screen.queryByRole("button", { name: "Plus d'actions" })).not.toBeInTheDocument();
  });

  it("gives a contact for a refused campaign", async () => {
    mocks.mine.mockResolvedValue([
      campaign({ status: "BLOCKED", submittedAt: "2026-09-01T10:00:00Z" }),
    ]);
    mocks.byCampaign.mockResolvedValue([reservation({ reservationStatus: "ANNULEE" })]);
    mocks.report.mockRejectedValue(noReport());
    renderWithToasts(<CampaignDetail idParam="7" />);

    expect(
      await screen.findByText("Contactez TPUB pour connaître le motif du refus."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Contacter TPUB/ }).getAttribute("href")).toMatch(
      /^mailto:.*Motif/,
    );
    expect(screen.getByText("Libéré")).toBeInTheDocument();
  });

  it("states the support hours while TPUB reviews, with the refresh time", async () => {
    mocks.mine.mockResolvedValue([
      campaign({ status: "REVIEW_REQUIRED", submittedAt: "2026-09-01T10:00:00Z" }),
    ]);
    mocks.byCampaign.mockResolvedValue([reservation()]);
    mocks.report.mockRejectedValue(noReport());
    renderWithToasts(<CampaignDetail idParam="7" />);

    expect(await screen.findByText(/lun–⁠?ven, 9\s?h–⁠?18\s?h/)).toBeInTheDocument();
    expect(screen.getByText(/Mis à jour à \d{2}:\d{2}/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualiser" })).toBeInTheDocument();
    expect(screen.getByText(/Actualisation automatique chaque minute/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Vous serez informé/);
  });

  it("polls every 10 s while the AI check is pending, pauses when hidden, stops after 2 minutes", async () => {
    vi.useFakeTimers();
    mocks.mine.mockResolvedValue([
      campaign({ status: "PENDING_AI_CHECK", submittedAt: "2026-09-12T10:00:00Z" }),
    ]);
    mocks.byCampaign.mockResolvedValue([reservation()]);
    mocks.report.mockRejectedValue(noReport());
    renderWithToasts(<CampaignDetail idParam="7" />);

    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(
      screen.getByRole("heading", { level: 1, name: "Lancement Café Démo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Le résultat s'affiche ici dès qu'il est prêt (actualisation automatique pendant 2 minutes).",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Relancer l'analyse/ })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Vous serez informé/);
    expect(mocks.mine).toHaveBeenCalledTimes(1);

    // React commits state updates when act() ends: flush the refetch it schedules.
    const advance = async (ms: number) => {
      await act(() => vi.advanceTimersByTimeAsync(ms));
      await act(() => vi.advanceTimersByTimeAsync(50));
    };

    await advance(10_000);
    expect(mocks.mine).toHaveBeenCalledTimes(2);

    setVisibility("hidden");
    await advance(30_000);
    expect(mocks.mine).toHaveBeenCalledTimes(2);

    setVisibility("visible");
    await advance(90_000);
    const calls = mocks.mine.mock.calls.length;
    expect(calls).toBeGreaterThan(2);
    await advance(60_000);
    expect(mocks.mine).toHaveBeenCalledTimes(calls);
    expect(screen.getByText(/Actualisation automatique arrêtée/)).toBeInTheDocument();
  });
});

describe("deleteDescription", () => {
  it("names the créneaux released, or says there are none", () => {
    expect(deleteDescription({ startDate: "2026-10-14", endDate: "2026-10-20" }, 1)).toBe(
      "1 créneau bloqué du mer. 14 oct. au mar. 20 oct. 2026 sera libéré. Action définitive.",
    );
    expect(deleteDescription({ startDate: null, endDate: null }, 0)).toBe(
      "Aucun créneau n'est bloqué pour cette campagne. Action définitive.",
    );
  });
});

describe("CampaignEdit (/modifier)", () => {
  it("redirects a draft to the wizard « Détails » step (IA-05)", async () => {
    mocks.mine.mockResolvedValue([campaign()]);
    mocks.byCampaign.mockResolvedValue([]);
    renderWithToasts(<CampaignEdit idParam="7" />);
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/espace/campagnes/nouvelle?id=7&etape=1"),
    );
    expect(screen.queryByRole("button", { name: /Enregistrer/ })).not.toBeInTheDocument();
  });

  it("guards a dirty edit when leaving through a link (FLOW-07)", async () => {
    const user = userEvent.setup();
    mocks.mine.mockResolvedValue([campaign({ status: "REJECTED_BY_AI", aiStatus: "REJECTED" })]);
    mocks.byCampaign.mockResolvedValue([]);
    render(
      <ToastProvider>
        <NavigationGuardProvider>
          <nav aria-label="Navigation principale">
            <Link href="/espace">Tableau de bord</Link>
          </nav>
          <CampaignEdit idParam="7" />
        </NavigationGuardProvider>
      </ToastProvider>,
    );

    const name = await screen.findByLabelText(/Nom de la campagne/);
    await user.type(name, " v2");
    await user.click(screen.getByRole("link", { name: "Tableau de bord" }));
    expect(
      await screen.findByRole("dialog", { name: /^Quitter sans enregistrer\s\?$/ }),
    ).toBeInTheDocument();
  });

  it("restores a local draft (FFA-01, key campaign:{id}:edit)", async () => {
    window.sessionStorage.setItem(
      "tpub:draft:v1:anon:campaign:7:edit",
      JSON.stringify({ savedAt: Date.now() - 60_000, value: { name: "Nom restauré" } }),
    );
    mocks.mine.mockResolvedValue([campaign({ status: "REJECTED_BY_AI", aiStatus: "REJECTED" })]);
    mocks.byCampaign.mockResolvedValue([]);
    renderWithToasts(<CampaignEdit idParam="7" />);

    expect(await screen.findByText(/Saisie restaurée/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Nom de la campagne/)).toHaveValue("Nom restauré");
  });

  it("summarises several errors on submit without calling the API (FFA-12)", async () => {
    const user = userEvent.setup();
    mocks.mine.mockResolvedValue([campaign({ status: "REJECTED_BY_AI", aiStatus: "REJECTED" })]);
    mocks.byCampaign.mockResolvedValue([]);
    renderWithToasts(<CampaignEdit idParam="7" />);

    await user.clear(await screen.findByLabelText(/Nom de la campagne/));
    await user.clear(screen.getByLabelText(/^Objectif/));
    await user.click(screen.getByRole("button", { name: /Enregistrer les modifications/ }));

    const summary = await screen.findByRole("alert", { name: /2 champs à corriger/ });
    expect(within(summary).getAllByRole("link")).toHaveLength(2);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
