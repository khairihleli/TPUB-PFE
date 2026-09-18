import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DeviceKeyStatusResponse, SupportResponse } from "@/lib/api/types";

const api = vi.hoisted(() => ({ issue: vi.fn(), revoke: vi.fn() }));
vi.mock("@/lib/api/endpoints", () => ({ deviceKeysApi: api }));

import {
  DevicePairingDialog,
  deviceStatusLabel,
  pairingUrl,
  statusAfterIssue,
} from "@/components/admin/device-pairing-dialog";
import { ToastProvider } from "@/components/ui/toast";

const KEY = `tpd_${"x".repeat(43)}`;

const support: SupportResponse = {
  id: 7,
  zoneId: 2,
  zoneName: "Lac",
  name: "Porteur Lac Nord",
  supportType: "ECRAN",
  latitude: 36.8,
  longitude: 10.2,
  technicalStatus: "ACTIF",
  diffusionCapacity: 2,
  visibilityScore: 80,
};

const unpaired: DeviceKeyStatusResponse = {
  supportId: 7,
  supportName: "Porteur Lac Nord",
  paired: false,
  keyPrefix: null,
  createdAt: null,
  lastUsedAt: null,
  lastUsedIp: null,
};

function renderDialog(status: DeviceKeyStatusResponse | undefined, canAct = true) {
  const onStatusChange = vi.fn();
  render(
    <ToastProvider>
      <DevicePairingDialog
        support={support}
        status={status}
        canAct={canAct}
        onOpenChange={vi.fn()}
        onStatusChange={onStatusChange}
      />
    </ToastProvider>,
  );
  return { onStatusChange };
}

beforeEach(() => {
  api.issue.mockReset();
  api.revoke.mockReset();
});

describe("device pairing helpers", () => {
  it("builds the pairing URL only from a player path with a well-formed key", () => {
    expect(pairingUrl("http://localhost:3000/", `/ecran/7?cle=${KEY}`)).toBe(
      `http://localhost:3000/ecran/7?cle=${KEY}`,
    );
    expect(pairingUrl("http://localhost:3000", "/admin?cle=x")).toBeNull();
    expect(pairingUrl("http://localhost:3000", `https://evil.test/ecran/7?cle=${KEY}`)).toBeNull();
  });

  it("labels the pairing status", () => {
    expect(deviceStatusLabel(undefined)).toBe("Écran non appairé");
    expect(deviceStatusLabel({ paired: true, lastUsedAt: null })).toBe(
      "Écran appairé · jamais connecté",
    );
    expect(deviceStatusLabel({ paired: true, lastUsedAt: new Date().toISOString() })).toMatch(
      /^Écran appairé · dernier contact /,
    );
    expect(
      statusAfterIssue(support, {
        supportId: 7,
        deviceKey: KEY,
        keyPrefix: KEY.slice(0, 12),
        createdAt: "2026-09-17T10:00:00Z",
        pairingPath: `/ecran/7?cle=${KEY}`,
      }),
    ).toEqual({
      ...unpaired,
      paired: true,
      keyPrefix: KEY.slice(0, 12),
      createdAt: "2026-09-17T10:00:00Z",
    });
  });
});

describe("DevicePairingDialog", () => {
  it("generates a key and shows it once with the pairing URL, a copy button and a QR code", async () => {
    api.issue.mockResolvedValue({
      supportId: 7,
      deviceKey: KEY,
      keyPrefix: KEY.slice(0, 12),
      createdAt: "2026-09-17T10:00:00Z",
      pairingPath: `/ecran/7?cle=${KEY}`,
    });
    const { onStatusChange } = renderDialog(unpaired);
    const dialog = screen.getByRole("dialog", { name: /Appairer l'écran/ });
    expect(within(dialog).getByText("Écran non appairé")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Générer la clé de l'écran" }));
    await waitFor(() => expect(api.issue).toHaveBeenCalledWith(7));
    expect(await within(dialog).findByText("Cette clé ne sera plus affichée")).toBeInTheDocument();
    const url = `${window.location.origin}/ecran/7?cle=${KEY}`;
    expect(within(dialog).getByText(url)).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Copier le lien d'appairage" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("img", { name: /QR code du lien d'appairage/ }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /Ouvrir le lecteur/ })).toHaveAttribute(
      "href",
      url,
    );
    expect(onStatusChange).toHaveBeenCalledWith(expect.objectContaining({ paired: true }));
  });

  it("asks before rotating and revokes a paired screen", async () => {
    api.revoke.mockResolvedValue(undefined);
    const { onStatusChange } = renderDialog({
      ...unpaired,
      paired: true,
      keyPrefix: "tpd_abcdefgh",
      createdAt: "2026-09-10T10:00:00Z",
      lastUsedAt: "2026-09-17T09:00:00Z",
      lastUsedIp: "10.0.0.4",
    });
    const dialog = screen.getByRole("dialog", { name: /Appairer l'écran/ });
    expect(within(dialog).getByText("tpd_abcdefgh…")).toBeInTheDocument();
    expect(within(dialog).getByText(/IP 10\.0\.0\.4/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Remplacer la clé" }));
    expect(await screen.findByText(/L'ancien écran sera déconnecté/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(api.issue).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Révoquer" }));
    expect(await screen.findByText(/cessera immédiatement de diffuser/)).toBeInTheDocument();
    const revokeButtons = screen.getAllByRole("button", { name: "Révoquer" });
    fireEvent.click(revokeButtons[revokeButtons.length - 1]!);
    await waitFor(() => expect(api.revoke).toHaveBeenCalledWith(7));
    expect(onStatusChange).toHaveBeenCalledWith(expect.objectContaining({ paired: false }));
  });

  it("is read-only for non-administrators", () => {
    renderDialog(unpaired, false);
    expect(screen.queryByRole("button", { name: "Générer la clé de l'écran" })).toBeNull();
    expect(screen.getByText(/Seul un administrateur/)).toBeInTheDocument();
  });
});
