import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EmergencyRequest, SupportResponse, ZoneResponse } from "@/lib/api/types";
import { draftStorageKey } from "@/lib/forms/form-draft";

const api = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@/lib/api/endpoints", () => ({
  emergencyApi: { create: api.create },
}));

import { EMERGENCY_DRAFT_KEY, EmergencyFormDialog } from "@/components/admin/emergency-form-dialog";

const zones = [
  { id: 1, name: "Tunis Centre", isActive: true, latitude: 36.8, longitude: 10.18, radiusKm: 3 },
  { id: 2, name: "La Marsa", isActive: true, latitude: 36.88, longitude: 10.33, radiusKm: 2 },
] as ZoneResponse[];

const supports = [
  { id: 7, zoneId: 1, zoneName: "Tunis Centre", name: "Bourguiba", technicalStatus: "ACTIF" },
  { id: 9, zoneId: 2, zoneName: "La Marsa", name: "Corniche", technicalStatus: "ACTIF" },
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
  return { onOpenChange, onCreated };
}

describe("EmergencyFormDialog", () => {
  it("posts once per selected zone after the in-dialog confirmation", async () => {
    api.create.mockImplementation((body: EmergencyRequest) =>
      Promise.resolve({
        ...body,
        id: body.zoneId * 10,
        isActive: true,
        startTime: null,
        endTime: null,
      }),
    );
    const { onOpenChange, onCreated } = renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Nouveau message prioritaire" });

    fireEvent.change(within(dialog).getByLabelText(/Titre affiché/), {
      target: { value: "Route fermée" },
    });
    expect(within(dialog).getByText(/12\/60 caractères recommandés/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Toutes les zones" }));
    expect(
      within(dialog).getByText(
        "Visible sur 2 Porteurs actifs à La Marsa et Tunis Centre, dès aujourd'hui.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Passe en premier" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Vérifier et diffuser" }));

    const confirm = await screen.findByRole("dialog", { name: "Confirmer la diffusion" });
    expect(api.create).not.toHaveBeenCalled();
    expect(within(confirm).getByText("Diffusion immédiate")).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole("button", { name: "Diffuser dans 2 zones" }));

    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(2));
    expect(api.create.mock.calls.map((c) => (c[0] as EmergencyRequest).zoneId)).toEqual([2, 1]);
    expect(api.create.mock.calls[0]?.[0]).toMatchObject({
      title: "Route fermée",
      content: "Route fermée",
      priority: 1,
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ sampleSupportId: 7, messages: expect.any(Array) }),
    );
  });

  it("lists per-zone results when a zone fails", async () => {
    api.create.mockImplementation((body: EmergencyRequest) =>
      body.zoneId === 1
        ? Promise.reject(new Error("Zone indisponible"))
        : Promise.resolve({ ...body, id: 20, isActive: true, startTime: null, endTime: null }),
    );
    const { onOpenChange } = renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Nouveau message prioritaire" });
    fireEvent.change(within(dialog).getByLabelText(/Titre affiché/), {
      target: { value: "Alerte" },
    });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Toutes les zones" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Vérifier et diffuser" }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Confirmer la diffusion" })).getByRole(
        "button",
        { name: "Diffuser dans 2 zones" },
      ),
    );
    const results = await screen.findByRole("dialog", { name: "Résultat de la diffusion" });
    expect(within(results).getByRole("button", { name: "Réessayer 1 zone" })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("asks before discarding a typed title on Escape", () => {
    const { onOpenChange } = renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Nouveau message prioritaire" });
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
      draftStorageKey(EMERGENCY_DRAFT_KEY, null, 2),
      JSON.stringify({
        savedAt: Date.now(),
        value: { title: "Brouillon restauré", zoneIds: ["2"] },
      }),
    );
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Nouveau message prioritaire" });
    await waitFor(() =>
      expect(within(dialog).getByLabelText(/Titre affiché/)).toHaveValue("Brouillon restauré"),
    );
    expect(within(dialog).getByText(/Saisie restaurée/)).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: /La Marsa/ })).toBeChecked();
  });
});
