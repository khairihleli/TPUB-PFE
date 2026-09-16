import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { draftStorageKey } from "@/lib/forms/form-draft";

vi.mock("@/lib/api/endpoints", () => ({
  zonesApi: { create: vi.fn(), update: vi.fn() },
  supportsApi: { create: vi.fn(), update: vi.fn() },
}));

// The mini-map (MapLibre) is not needed to test form safety.
vi.mock("@/components/admin/zone-map-picker", () => ({ ZoneMapPicker: () => null }));

import { SupportFormDialog } from "@/components/admin/support-form-dialog";
import { ZoneFormDialog } from "@/components/admin/zone-form-dialog";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("Zone & Porteur dialogs — form safety", () => {
  it("Escape on a dirty zone dialog shows the inline discard bar instead of closing", () => {
    const onOpenChange = vi.fn();
    render(<ZoneFormDialog open zone={null} onOpenChange={onOpenChange} onSaved={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Nouvelle zone" });

    // Clean: Escape closes.
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    onOpenChange.mockClear();

    fireEvent.change(within(dialog).getByLabelText(/Nom de la zone/), {
      target: { value: "Sousse" },
    });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(
      screen.getByRole("alertdialog", { name: "Abandonner les modifications ?" }),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(within(dialog).getByLabelText(/Nom de la zone/)).toHaveValue("Sousse");

    fireEvent.click(screen.getByRole("button", { name: "Garder" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("restores a local Porteur draft with its notice", async () => {
    window.sessionStorage.setItem(
      draftStorageKey("admin:support:new", null),
      JSON.stringify({ savedAt: Date.now(), value: { name: "Rond-point Lac", zoneId: 42 } }),
    );
    render(
      <SupportFormDialog open support={null} zones={[]} onOpenChange={vi.fn()} onSaved={vi.fn()} />,
    );
    const dialog = screen.getByRole("dialog", { name: "Nouveau Porteur" });
    await waitFor(() =>
      expect(within(dialog).getByLabelText(/Nom du Porteur/)).toHaveValue("Rond-point Lac"),
    );
    expect(within(dialog).getByText(/Saisie restaurée/)).toBeInTheDocument();
  });
});
