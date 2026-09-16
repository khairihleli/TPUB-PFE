import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createReservation: vi.fn(),
  supportsAll: vi.fn(),
  zonesActive: vi.fn(),
  availability: vi.fn(),
}));

vi.mock("@/lib/api/endpoints", () => ({
  reservationsApi: { create: mocks.createReservation },
  supportsApi: { all: mocks.supportsAll, availability: mocks.availability },
  zonesApi: { active: mocks.zonesActive },
}));

// three.js is not exercised here: the studio is covered by its own tests.
vi.mock("@/components/porteur3d", () => ({
  PorteurStudio: ({ support }: { support: { name: string } }) => (
    <div data-testid="studio">Studio 3D {support.name}</div>
  ),
  StudioControls: () => null,
}));

import { StepScreens, screenRows, sortRows } from "@/components/campaign/step-screens";
import { bookableSelection, mapSelectionFor } from "@/components/campaign/step-screens-map";
import { WizardPorteurDialog } from "@/components/campaign/wizard-porteur-dialog";
import { ToastProvider } from "@/components/ui/toast";
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

const CAMPAIGN: CampaignResponse = {
  id: 7,
  clientId: 1,
  name: "Lancement Café Démo",
  objective: "Notoriété",
  budget: 2500,
  consumedBudget: 0,
  status: "BROUILLON",
  aiStatus: null,
  adminStatus: null,
  startDate: isoInDays(5),
  endDate: isoInDays(20),
  startTime: "08:00:00",
  endTime: "22:00:00",
  estimatedViews: 0,
  priorityScore: 0,
  createdAt: "2026-09-01T10:00:00Z",
  submittedAt: null,
  validatedAt: null,
};

const ZONES: ZoneResponse[] = [
  { id: 1, name: "Tunis Centre", latitude: 36.8, longitude: 10.18, radiusKm: 3, isActive: true },
  { id: 3, name: "Sfax Centre", latitude: 34.74, longitude: 10.76, radiusKm: 4, isActive: true },
];

const SCREENS: SupportResponse[] = [
  {
    id: 11,
    zoneId: 1,
    zoneName: "Tunis Centre",
    name: "Écran LED Avenue Habib Bourguiba",
    supportType: "ECRAN",
    latitude: 36.7995,
    longitude: 10.1857,
    technicalStatus: "ACTIF",
    diffusionCapacity: 1,
    porteurType: "A",
    mastHeightM: 25,
    headingDeg: 90,
    address: null,
  },
  {
    id: 31,
    zoneId: 3,
    zoneName: "Sfax Centre",
    name: "Rond-point Sfax El Jadida",
    supportType: "ECRAN",
    latitude: 34.745,
    longitude: 10.755,
    technicalStatus: "ACTIF",
    diffusionCapacity: 1,
    porteurType: "A",
    mastHeightM: 25,
    headingDeg: 0,
    address: null,
  },
  {
    id: 32,
    zoneId: 3,
    zoneName: "Sfax Centre",
    name: "Relais Sfax",
    supportType: "POINT_WIFI",
    latitude: 34.9,
    longitude: 10.4,
    technicalStatus: "ACTIF",
    diffusionCapacity: 1,
    porteurType: "D",
    mastHeightM: 30,
    headingDeg: null,
    address: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  clearResourceCache();
  resetUnsavedGuards();
  mocks.supportsAll.mockResolvedValue(SCREENS);
  mocks.zonesActive.mockResolvedValue(ZONES);
  mocks.availability.mockResolvedValue([]);
});

describe("map selection binding", () => {
  it("derives whole-zone flags from the selected bookable Porteurs", () => {
    const booked = new Set<number>();
    expect(mapSelectionFor(ZONES, SCREENS, new Set([31]), booked)).toEqual({
      zoneIds: [3],
      supportIds: [31],
    });
    // Tunis: its only Porteur is booked → nothing left to choose, zone not flagged.
    expect(mapSelectionFor(ZONES, SCREENS, new Set(), new Set([11])).zoneIds).toEqual([]);
  });

  it("keeps only known, not-yet-booked ids from the map", () => {
    expect(
      bookableSelection({ zoneIds: [1], supportIds: [11, 31, 999] }, SCREENS, new Set([11])),
    ).toEqual([31]);
  });
});

describe("Porteur rows (availability first)", () => {
  const period = { start: CAMPAIGN.startDate!, end: CAMPAIGN.endDate! };

  it("derives card states: own créneau, not bookable, busy with its conflict, free", () => {
    const busySlot = {
      startDate: isoInDays(8),
      endDate: isoInDays(9),
      startTime: "08:00:00",
      endTime: "22:00:00",
      reservationStatus: "TEMPORAIRE" as const,
    };
    const rows = screenRows(
      SCREENS,
      new Map(),
      new Map([
        [11, { state: "busy" as const, slots: [busySlot] }],
        [31, { state: "free" as const, slots: [] }],
      ]),
      period,
    );
    expect(rows.map((r) => [r.screen.id, r.state])).toEqual([
      [11, "busy"],
      [31, "free"],
      [32, "blocked"],
    ]);
    expect(rows[0]?.conflict).toEqual(busySlot);
    expect(
      screenRows(SCREENS, new Map([[11, "TEMPORAIRE" as const]]), new Map(), period)[0]?.state,
    ).toBe("booked");
    expect(sortRows(rows).map((r) => r.screen.id)).toEqual([31, 11, 32]);
  });
});

describe("StepScreens — Carte", () => {
  function renderStep(reservations: ReservationResponse[] = []) {
    render(
      <ToastProvider>
        <StepScreens
          campaign={CAMPAIGN}
          reservations={reservations}
          onReserved={vi.fn()}
          onBack={vi.fn()}
          onNext={vi.fn()}
        />
      </ToastProvider>,
    );
  }

  it("keeps the list by default and switches to the map with the selection rail", async () => {
    const user = userEvent.setup();
    renderStep();
    const liste = await screen.findByRole("button", { name: "Liste" }, { timeout: 5000 });
    expect(liste).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("list", { name: "Filtrer par zone" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Carte" }));
    expect(
      await screen.findByRole("complementary", { name: "Sélection sur la carte" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Filtrer par zone" })).not.toBeInTheDocument();
    expect(screen.getByText("Aucun Porteur sélectionné pour l'instant.")).toBeInTheDocument();
  });
});

describe("WizardPorteurDialog", () => {
  function renderDialog(over: Partial<Parameters<typeof WizardPorteurDialog>[0]> = {}) {
    const onToggleSelect = vi.fn();
    render(
      <WizardPorteurDialog
        support={SCREENS[1]!}
        campaign={CAMPAIGN}
        today={todayISO()}
        booked={false}
        selected={false}
        canBook
        booking={false}
        onOpenChange={vi.fn()}
        onToggleSelect={onToggleSelect}
        {...over}
      />,
    );
    return { onToggleSelect };
  }

  it("adds the Porteur to the selection without booking it", async () => {
    const user = userEvent.setup();
    const { onToggleSelect } = renderDialog();
    const dialog = await screen.findByRole("dialog", { name: "Rond-point Sfax El Jadida" });
    expect(within(dialog).getByTestId("studio")).toBeInTheDocument();
    expect(within(dialog).getByText("Créneau de la campagne")).toBeInTheDocument();
    await waitFor(() =>
      expect(mocks.availability).toHaveBeenCalledWith(
        31,
        expect.objectContaining({ from: todayISO() }),
        expect.anything(),
      ),
    );
    const add = within(dialog).getByRole("button", { name: "Ajouter à la sélection" });
    await waitFor(() => expect(add).not.toHaveAttribute("aria-disabled"));
    expect(add).toHaveAttribute("aria-pressed", "false");
    await user.click(add);
    expect(onToggleSelect).toHaveBeenCalledWith(SCREENS[1]);
    expect(mocks.createReservation).not.toHaveBeenCalled();
    expect(within(dialog).queryByRole("button", { name: "Ajouter à la campagne" })).toBeNull();
  });

  it("gates the selection with a reason when the period overlaps a booking", async () => {
    const user = userEvent.setup();
    mocks.availability.mockResolvedValue([
      {
        startDate: isoInDays(10),
        endDate: isoInDays(12),
        startTime: "08:00:00",
        endTime: "12:00:00",
        reservationStatus: "CONFIRMEE",
      },
    ]);
    const { onToggleSelect } = renderDialog();
    const dialog = await screen.findByRole("dialog", { name: "Rond-point Sfax El Jadida" });
    const add = within(dialog).getByRole("button", { name: "Ajouter à la sélection" });
    await waitFor(() => expect(add).toHaveAccessibleDescription(/Période indisponible/));
    expect(add).toHaveAttribute("aria-disabled", "true");
    await user.click(add);
    expect(onToggleSelect).not.toHaveBeenCalled();
    // Not an alert on open (the advertiser did not change anything).
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });
});
