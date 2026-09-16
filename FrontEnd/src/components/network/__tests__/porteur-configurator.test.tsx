import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as Endpoints from "@/lib/api/endpoints";

import { campaign, reservation } from "@/components/espace/__tests__/fixtures";
import {
  CAMPAIGN_NOT_DRAFT_MESSAGE,
  createDefaultSchedule,
  RESERVATION_CONFLICT_MESSAGE,
} from "@/components/network/booking-plan";
import type { StudioCreativeState } from "@/components/network/creative-preview-import";
import {
  CHOOSE_CAMPAIGN_MESSAGE,
  PorteurConfigurator,
  type BookingState,
} from "@/components/network/porteur-configurator";
import { ToastProvider } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import type { CampaignResponse, SupportAvailabilitySlot, SupportResponse } from "@/lib/api/types";
import { support } from "@/lib/network/__tests__/fixtures";
import type { ResourceState } from "@/lib/use-resource";

const api = vi.hoisted(() => ({
  availability: vi.fn(),
  createReservation: vi.fn(),
  createCampaign: vi.fn(),
  getCampaign: vi.fn(),
}));

vi.mock("@/lib/api/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof Endpoints>();
  return {
    ...actual,
    supportsApi: { ...actual.supportsApi, availability: api.availability },
    reservationsApi: { ...actual.reservationsApi, create: api.createReservation },
    campaignsApi: { ...actual.campaignsApi, create: api.createCampaign, get: api.getCampaign },
  };
});

// three.js never loads in jsdom: keep the studio module light.
vi.mock("@/components/porteur3d/porteur-studio", () => ({ PorteurStudio: () => null }));

const TODAY = "2026-09-13";

const PORTEUR: SupportResponse = support({
  id: 6,
  zoneId: 4,
  zoneName: "Tunis Médina",
  name: "Porteur Bab Bhar",
  porteurType: "B",
  mastHeightM: 25,
  headingDeg: 200,
  address: "Place de la Victoire, Tunis",
});

/** Draft whose own period (14 → 20 sept., soirée) is free on the Porteur. */
const RENTREE = campaign({
  id: 5,
  name: "Rentrée Médina",
  startDate: "2026-09-14",
  endDate: "2026-09-20",
  startTime: "19:00:00",
  endTime: "23:00:00",
});

const BOOKED_28_SEPT: SupportAvailabilitySlot = {
  startDate: "2026-09-28",
  endDate: "2026-10-08",
  startTime: "17:00:00",
  endTime: "23:00:00",
  reservationStatus: "TEMPORAIRE",
};

const NO_CREATIVE: StudioCreativeState = {
  creative: null,
  campaignCreative: null,
  source: null,
  storeKey: 0,
};

const STRIP = { name: "Calendrier des disponibilités du Porteur" };
const RESERVE = /^Réserver ce Porteur/;
/** jsdom renders of the Studio configurator can be slow when many test files run in parallel. */
const SLOW = { timeout: 5000 };

function Harness({
  porteur = PORTEUR,
  campaigns = [RENTREE],
  initial,
}: {
  porteur?: SupportResponse;
  campaigns?: CampaignResponse[];
  initial?: Partial<BookingState>;
}) {
  const [booking, setBooking] = useState<BookingState>({
    schedule: createDefaultSchedule(TODAY),
    campaignId: null,
    ...initial,
  });
  const [list, setList] = useState(campaigns);
  const resource: ResourceState<CampaignResponse[]> = {
    data: list,
    error: null,
    loading: false,
    reload: () => undefined,
    setData: (u) => setList((prev) => (typeof u === "function" ? u(prev) : u)),
  };
  return (
    <ToastProvider>
      <PorteurConfigurator
        support={porteur}
        today={TODAY}
        booking={booking}
        onBookingChange={(patch) => setBooking((b) => ({ ...b, ...patch }))}
        campaigns={resource}
        creative={NO_CREATIVE}
        preview={{
          view: "orbite",
          onViewChange: () => undefined,
          timeOfDay: "jour",
          onTimeOfDayChange: () => undefined,
          face: "all",
          onFaceChange: () => undefined,
          onResetView: () => undefined,
        }}
      />
    </ToastProvider>
  );
}

function reserveButton() {
  return screen.getByRole("button", { name: RESERVE });
}

beforeEach(() => {
  api.availability.mockReset().mockResolvedValue([BOOKED_28_SEPT]);
  api.createReservation.mockReset();
  api.createCampaign.mockReset();
  api.getCampaign
    .mockReset()
    .mockImplementation((id: number) => Promise.resolve({ ...RENTREE, id }));
});

describe("PorteurConfigurator", () => {
  it("orders the sections campaign first", () => {
    render(<Harness />);
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings.slice(0, 4)).toEqual(["Campagne", "Créneau", "Aperçu", "Identité"]);
  });

  it("applies and locks the chosen campaign period, then books inline (no toast)", async () => {
    api.createReservation.mockImplementation((body: { supportId: number; campaignId: number }) =>
      Promise.resolve(
        reservation({
          id: 77,
          campaignId: body.campaignId,
          supportId: body.supportId,
          zoneId: 4,
          startDate: "2026-09-14",
          endDate: "2026-09-20",
        }),
      ),
    );
    render(<Harness />);

    expect(screen.getByText("Type B · Double face")).toBeInTheDocument();
    expect(screen.getByText("25 m · Majeur")).toBeInTheDocument();
    expect(screen.getByText(/Écran principal orienté S/)).toBeInTheDocument();
    expect(screen.getByText(/intention de conception/)).toBeInTheDocument();

    const strip = await screen.findByRole("group", STRIP, SLOW);
    expect(api.availability).toHaveBeenCalledWith(
      6,
      { from: TODAY, to: "2026-12-11" },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(within(strip).getAllByRole("button")).toHaveLength(60);
    expect(
      within(strip).getByRole("button", { name: /28 septembre 2026 — Réservé \(temporaire\)/ }),
    ).toBeInTheDocument();

    // Gated until a campaign is chosen (focusable, with the reason).
    expect(reserveButton()).toHaveAttribute("aria-disabled", "true");
    expect(reserveButton()).toHaveAccessibleDescription(/Choisissez une campagne/);

    fireEvent.click(screen.getByRole("radio", { name: /Rentrée Médina/ }));

    // The campaign period (14 → 20 sept., 19:00–23:00) is applied and locked.
    expect(screen.getByLabelText(/^Début/)).toHaveValue("14/09/2026");
    expect(screen.getByLabelText(/^Fin/)).toHaveValue("20/09/2026");
    expect(screen.getByLabelText(/^Début/)).toHaveAttribute("readonly");
    expect(screen.getByText("Période de la campagne")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Réserver hors période" })).not.toBeChecked();
    expect(reserveButton()).toHaveAccessibleName("Réserver ce Porteur · 14–20 sept.");
    expect(reserveButton()).not.toHaveAttribute("aria-disabled");
    expect(screen.getByText("Non libérable en ligne.", { exact: false })).toBeInTheDocument();

    fireEvent.click(reserveButton());
    await waitFor(() => expect(api.createReservation).toHaveBeenCalledTimes(1), SLOW);
    expect(api.createReservation).toHaveBeenCalledWith({
      campaignId: 5,
      zoneId: 4,
      supportId: 6,
      startDate: "2026-09-14",
      endDate: "2026-09-20",
      startTime: "19:00:00",
      endTime: "23:00:00",
    });

    const success = await screen.findByText(
      "Porteur réservé pour « Rentrée Médina »",
      undefined,
      SLOW,
    );
    const panel = success.closest("[role='status']") as HTMLElement;
    expect(panel.closest("[data-studio-footer]")).not.toBeNull();
    expect(within(panel).getByRole("link", { name: "Voir la campagne" })).toHaveAttribute(
      "href",
      "/espace/campagnes/5",
    );
    expect(within(panel).getByRole("link", { name: /Continuer dans l'assistant/ })).toHaveAttribute(
      "href",
      "/espace/campagnes/nouvelle?id=5&etape=3",
    );
    // No toast region content: the confirmation is inline only.
    expect(screen.getAllByText("Porteur réservé pour « Rentrée Médina »")).toHaveLength(1);
  });

  it("focuses the campaign section when booking without a campaign", async () => {
    render(<Harness />);
    await screen.findByRole("group", STRIP, SLOW);
    fireEvent.click(reserveButton());
    const section = document.getElementById("studio-section-campagne");
    expect(section).not.toBeNull();
    expect(document.activeElement).toBe(section);
    expect(await screen.findByText(CHOOSE_CAMPAIGN_MESSAGE, undefined, SLOW)).toBeInTheDocument();
    expect(api.createReservation).not.toHaveBeenCalled();
  });

  it("opens on the first free week without an alert when the default week is booked", async () => {
    api.availability.mockResolvedValue([
      { ...BOOKED_28_SEPT, startDate: "2026-09-14", endDate: "2026-09-17" },
    ]);
    render(<Harness />);
    await screen.findByRole("group", STRIP, SLOW);
    await waitFor(() =>
      expect(reserveButton()).toHaveAccessibleName("Réserver ce Porteur · 18–24 sept."),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/^Période indisponible/)).toBeNull();
  });

  it("shows a neutral next-availability note before any change, with « Utiliser ces dates »", async () => {
    api.availability.mockResolvedValue([
      { ...BOOKED_28_SEPT, startDate: "2026-09-14", endDate: "2026-09-17" },
    ]);
    render(<Harness initial={{ scheduleSource: "user" }} />);
    expect(
      await screen.findByText("Prochaine disponibilité : 18 sept. → 24 sept.", undefined, SLOW),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector("[data-conflict='note']")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Utiliser ces dates" }));
    expect(reserveButton()).toHaveAccessibleName("Réserver ce Porteur · 18–24 sept.");
    expect(screen.queryByText(/Prochaine disponibilité/)).toBeNull();
  });

  it("turns a conflict into an alert after a user change and offers the next free slot", async () => {
    render(<Harness />);
    const strip = await screen.findByRole("group", STRIP, SLOW);
    fireEvent.click(within(strip).getByRole("button", { name: /^mercredi 30 septembre 2026/ }));
    fireEvent.click(within(strip).getByRole("button", { name: /^vendredi 2 octobre 2026/ }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/^Période indisponible : ce Porteur est déjà réservé/);
    expect(alert).toHaveTextContent("Prochaine disponibilité : 14 sept. → 16 sept.");

    // Jump on the strip
    fireEvent.click(screen.getByRole("button", { name: /Prochain créneau libre/ }));

    fireEvent.click(within(strip).getByRole("button", { name: /^samedi 10 octobre 2026/ }));
    fireEvent.click(within(strip).getByRole("button", { name: /^lundi 12 octobre 2026/ }));
    expect(screen.queryByText(/^Période indisponible/)).toBeNull();
    expect(reserveButton()).toHaveAccessibleName("Réserver ce Porteur · 10–12 oct.");
  });

  it("needs « Réserver hors période » to leave a booked campaign period", async () => {
    const october = campaign({ id: 8, name: "Octobre rose" }); // 1 → 31 oct., booked until 8 oct.
    api.getCampaign.mockResolvedValue(october);
    api.createReservation.mockImplementation((body: { campaignId: number }) =>
      Promise.resolve(reservation({ id: 90, campaignId: body.campaignId })),
    );
    render(<Harness campaigns={[october]} />);
    await screen.findByRole("group", STRIP, SLOW);
    fireEvent.click(screen.getByRole("radio", { name: /Octobre rose/ }));

    expect(
      await screen.findByText(/déjà réservé sur une partie de la période de la campagne/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Utiliser ces dates" })).toBeNull();
    expect(reserveButton()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(reserveButton());
    expect(api.createReservation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox", { name: "Réserver hors période" }));
    expect(
      screen.getByText("Le créneau ne correspondra pas à la période de la campagne."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Début/)).not.toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("button", { name: "Utiliser ces dates" }));
    expect(reserveButton()).toHaveAccessibleName("Réserver ce Porteur · 9 oct. – 8 nov.");

    fireEvent.click(reserveButton());
    await waitFor(() => expect(api.createReservation).toHaveBeenCalledTimes(1), SLOW);
    expect(api.createReservation).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: "2026-10-09", endDate: "2026-11-08" }),
    );
  });

  it("refuses to book on a campaign submitted since the list was loaded", async () => {
    api.getCampaign.mockResolvedValue({ ...RENTREE, status: "PENDING_AI_CHECK" });
    render(<Harness />);
    await screen.findByRole("group", STRIP, SLOW);
    fireEvent.click(screen.getByRole("radio", { name: /Rentrée Médina/ }));
    fireEvent.click(reserveButton());
    expect(
      await screen.findByText(CAMPAIGN_NOT_DRAFT_MESSAGE, undefined, SLOW),
    ).toBeInTheDocument();
    expect(api.createReservation).not.toHaveBeenCalled();
    expect(screen.queryByRole("radio", { name: /Rentrée Médina/ })).toBeNull();
  });

  it("maps a backend conflict to an inline message", async () => {
    api.createReservation.mockRejectedValue(
      new ApiError(400, "Support déjà réservé", {
        rawMessage: "Support already reserved for the selected period",
      }),
    );
    render(<Harness />);
    await screen.findByRole("group", STRIP, SLOW);
    fireEvent.click(screen.getByRole("radio", { name: /Rentrée Médina/ }));
    fireEvent.click(reserveButton());
    expect(
      await screen.findByText(RESERVATION_CONFLICT_MESSAGE, undefined, SLOW),
    ).toBeInTheDocument();
  });

  it("creates a quick draft with French date fields, a review-term hint, and selects it", async () => {
    api.createCampaign.mockImplementation((body: { name: string }) =>
      Promise.resolve(campaign({ id: 9, name: body.name })),
    );
    render(<Harness campaigns={[]} />);
    await screen.findByRole("group", STRIP, SLOW);
    expect(screen.getByText(/Aucune campagne en brouillon/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Créer un brouillon rapide" }));
    const form = screen.getByRole("form", { name: "Créer un brouillon rapide" });
    fireEvent.change(within(form).getByLabelText(/Nom de la campagne/), {
      target: { value: "Flash rentrée" },
    });
    fireEvent.change(within(form).getByLabelText(/Objectif/), {
      target: { value: "Entrée gratuite pour les familles du quartier" },
    });
    expect(within(form).getByRole("note")).toHaveTextContent(/Le terme « gratuit »/);
    fireEvent.change(within(form).getByLabelText(/Objectif/), {
      target: { value: "Annoncer la rentrée aux familles du quartier" },
    });
    expect(within(form).queryByText(/Le terme « gratuit »/)).toBeNull();
    // The period uses the French date fields, prefilled with the créneau.
    expect(within(form).getByLabelText(/^Début/)).toHaveValue("14/09/2026");
    fireEvent.change(within(form).getByLabelText(/Budget déclaré/), { target: { value: "900" } });
    fireEvent.click(within(form).getByRole("button", { name: "Créer le brouillon" }));

    await waitFor(() => expect(api.createCampaign).toHaveBeenCalledTimes(1), SLOW);
    expect(api.createCampaign).toHaveBeenCalledWith({
      name: "Flash rentrée",
      objective: "Annoncer la rentrée aux familles du quartier",
      budget: 900,
      startDate: "2026-09-14",
      endDate: "2026-09-20",
      startTime: "08:00:00",
      endTime: "22:00:00",
    });
    expect(await screen.findByRole("radio", { name: /Flash rentrée/ })).toBeChecked();
  });

  it("gates booking for a type D Porteur with the reason", () => {
    render(
      <Harness
        porteur={support({ id: 7, name: "Relais", porteurType: "D", supportType: "POINT_WIFI" })}
      />,
    );
    expect(reserveButton()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getAllByText(/infrastructure sans écran, non réservable/).length).toBeGreaterThan(
      0,
    );
    expect(api.availability).not.toHaveBeenCalled();
  });
});
