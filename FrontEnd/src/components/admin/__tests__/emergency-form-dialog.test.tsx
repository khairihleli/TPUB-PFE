import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import type { SupportResponse, ZoneResponse } from "@/lib/api/types";
import { draftStorageKey } from "@/lib/forms/form-draft";

const api = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@/lib/api/endpoints-carte", () => ({
  emergencyCarteApi: { create: api.create },
}));

// MapLibre is not available in jsdom: the picker is replaced by a button placing a point.
vi.mock("@/components/admin/zone-map-picker", () => ({
  ZoneMapPicker: ({ onPick }: { onPick: (lat: number, lng: number) => void }) => (
    <button type="button" onClick={() => onPick(36.8, 10.18)}>
      Placer le point
    </button>
  ),
}));

import { EMERGENCY_DRAFT_KEY, EmergencyFormDialog } from "@/components/admin/emergency-form-dialog";

const zones = [
  { id: 1, name: "Tunis Centre", isActive: true, latitude: 36.8, longitude: 10.18, radiusKm: 3 },
  { id: 2, name: "La Marsa", isActive: true, latitude: 36.88, longitude: 10.33, radiusKm: 2 },
] as ZoneResponse[];

const supports = [
  {
    id: 7,
    zoneId: 1,
    name: "Bourguiba",
    latitude: 36.8,
    longitude: 10.181,
    technicalStatus: "ACTIF",
  },
  {
    id: 8,
    zoneId: 1,
    name: "Kasbah",
    latitude: 36.801,
    longitude: 10.18,
    technicalStatus: "HORS_LIGNE",
  },
  {
    id: 9,
    zoneId: 2,
    name: "Corniche",
    latitude: 36.88,
    longitude: 10.33,
    technicalStatus: "ACTIF",
  },
] as SupportResponse[];

beforeEach(() => {
  api.create.mockReset();
  window.sessionStorage.clear();
});

function renderDialog() {
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  render(
    <EmergencyFormDialog
      open
      onOpenChange={onOpenChange}
      zones={zones}
      supports={supports}
      onCreated={onCreated}
    />,
  );
  return {
    onOpenChange,
    onCreated,
    dialog: screen.getByRole("dialog", { name: "Nouveau message prioritaire" }),
  };
}

function fill(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText(/Titre affiché/), {
    target: { value: "Route fermée" },
  });
  fireEvent.change(within(dialog).getByLabelText(/Contenu affiché/), {
    target: { value: "Déviation par l'avenue voisine" },
  });
}

describe("EmergencyFormDialog", () => {
  it("targets a circle picked on the map, counts active Porteurs and posts after confirmation", async () => {
    api.create.mockImplementation((body: Record<string, unknown>) =>
      Promise.resolve({ ...body, id: 40, zoneId: 1, isActive: true, state: "EN_COURS" }),
    );
    const { onOpenChange, onCreated, dialog } = renderDialog();
    fill(dialog);
    expect(within(dialog).getByText(/12\/60 caractères recommandés/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Placer le point" }));
    expect(within(dialog).getByText("1 Porteur actif dans le cercle")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/Niveau d'urgence/), {
      target: { value: "CRITICAL" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Durée d'affichage/), {
      target: { value: "20" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Vérifier et diffuser" }));

    const confirm = await screen.findByRole("dialog", { name: "Confirmer la diffusion" });
    expect(api.create).not.toHaveBeenCalled();
    expect(within(confirm).getByText(/Cercle de 2 km/)).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole("button", { name: "Diffuser le message" }));

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls[0]?.[0]).toMatchObject({
      title: "Route fermée",
      content: "Déviation par l'avenue voisine",
      latitude: 36.8,
      longitude: 10.18,
      radiusKm: 2,
      zoneId: null,
      urgencyLevel: "CRITICAL",
      durationSeconds: 20,
      priority: 1,
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 40 }));
  });

  it("refuses to continue without a target", () => {
    const { dialog } = renderDialog();
    fill(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Vérifier et diffuser" }));
    expect(
      within(dialog).getByText("Placez le point sur la carte ou choisissez une zone."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Confirmer la diffusion" })).toBeNull();
  });

  it("brings a backend window error back to the form", async () => {
    api.create.mockRejectedValue(
      new ApiError(400, "La fin de diffusion doit être après le début et dans le futur.", {
        code: "INVALID_EMERGENCY_WINDOW",
      }),
    );
    const { dialog } = renderDialog();
    fill(dialog);
    fireEvent.change(within(dialog).getByLabelText("Zone (facultatif)"), {
      target: { value: "2" },
    });
    expect(within(dialog).getByText("1 Porteur actif dans la zone La Marsa")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Vérifier et diffuser" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Confirmer la diffusion" })).getByRole(
        "button",
        { name: "Diffuser le message" },
      ),
    );
    const back = await screen.findByRole("dialog", { name: "Nouveau message prioritaire" });
    expect(
      await within(back).findByText(
        "La fin de diffusion doit être après le début et dans le futur.",
      ),
    ).toBeInTheDocument();
  });

  it("asks before discarding a typed title on Escape", () => {
    const { onOpenChange, dialog } = renderDialog();
    fireEvent.change(within(dialog).getByLabelText(/Titre affiché/), {
      target: { value: "Route" },
    });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(
      screen.getByRole("alertdialog", { name: "Abandonner les modifications ?" }),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("restores a local draft", async () => {
    window.sessionStorage.setItem(
      draftStorageKey(EMERGENCY_DRAFT_KEY, null, 3),
      JSON.stringify({ savedAt: Date.now(), value: { title: "Brouillon restauré", zoneId: "2" } }),
    );
    const { dialog } = renderDialog();
    await waitFor(() =>
      expect(within(dialog).getByLabelText(/Titre affiché/)).toHaveValue("Brouillon restauré"),
    );
    expect(within(dialog).getByText(/Saisie restaurée/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Zone (facultatif)")).toHaveValue("2");
  });
});
