import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import type { Diffusion } from "@/lib/api/types";

const api = vi.hoisted(() => ({ next: vi.fn() }));

vi.mock("@/lib/api/endpoints", () => ({ diffusionApi: { next: api.next } }));

import { PlayerScreen } from "@/components/player/player-screen";

const urgent: Diffusion = {
  type: "URGENCE",
  campaignId: null,
  title: "Voie fermée, déviation conseillée",
  mediaUrl: null,
  duration: 15,
  zone: "Tunis Centre",
  priority: 1,
};

beforeEach(() => {
  api.next.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PlayerScreen", () => {
  it("polls with the support id and a local ISO date-time without timezone", async () => {
    api.next.mockResolvedValue({
      type: "PUBLICITE",
      campaignId: 4,
      title: "Lancement Café Démo",
      mediaUrl: null,
      duration: 10,
      zone: "Tunis Centre",
      priority: 0,
    } satisfies Diffusion);

    render(<PlayerScreen supportId={12} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Écran de diffusion n° 12" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Lancement Café Démo")).toBeInTheDocument();
    const [query] = api.next.mock.calls[0] as [{ supportId: number; datetime: string }];
    expect(query.supportId).toBe(12);
    expect(query.datetime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(screen.getByText(/Chaque appel est journalisé/)).toBeInTheDocument();
    expect(screen.getByText("Publicité", { selector: "dd" })).toBeInTheDocument();
  });

  it("takes over with a priority message announced once via role=alert", async () => {
    api.next.mockResolvedValue(urgent);
    render(<PlayerScreen supportId={3} />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Message prioritaire : Voie fermée, déviation conseillée. Zone : Tunis Centre.",
      ),
    );
    expect(screen.getAllByText("Message prioritaire").length).toBeGreaterThan(0);
  });

  it("shows the offline state with a retry, then recovers", async () => {
    api.next.mockRejectedValueOnce(
      new ApiError(502, "Le service TPUB est momentanément indisponible."),
    );
    api.next.mockResolvedValue({ ...urgent, type: "DEFAUT", title: "TPUB - Contenu par defaut" });

    render(<PlayerScreen supportId={3} />);

    expect(await screen.findByText("Service momentanément indisponible")).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Réessayer maintenant" }));
    });
    await waitFor(() =>
      expect(screen.queryByText("Service momentanément indisponible")).toBeNull(),
    );
    expect(api.next).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Contenu par défaut", { selector: "dd" })).toBeInTheDocument();
  });

  it("explains an unknown screen", async () => {
    api.next.mockRejectedValue(
      new ApiError(404, "Écran introuvable.", { rawMessage: "Support not found: 99" }),
    );
    render(<PlayerScreen supportId={99} />);
    expect(await screen.findByText("Écran introuvable")).toBeInTheDocument();
    // Visible card + the polite live region.
    expect(screen.getAllByText(/identifiant 99/)).toHaveLength(2);
  });

  it("starts compact on phones and expands the details on demand", async () => {
    const original = window.matchMedia;
    window.matchMedia = (query: string) => ({
      ...original(query),
      matches: query.includes("prefers-reduced-motion") || query.includes("max-width: 639px"),
    });
    try {
      api.next.mockResolvedValue(urgent);
      render(<PlayerScreen supportId={3} />);
      await screen.findByRole("complementary", { name: "Informations du lecteur" });
      // The logging note is always visible, the detail grid is not.
      expect(screen.getByText(/Chaque appel est journalisé/)).toBeInTheDocument();
      // The aside mounts before the first /diffusion/next answer: wait for the data under load.
      expect(
        await screen.findByText("Message prioritaire", { selector: "dd" }, { timeout: 4000 }),
      ).not.toBeVisible();
      const toggle = screen.getByRole("button", { name: "Détails du lecteur" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      fireEvent.click(toggle);
      expect(screen.getByText("Message prioritaire", { selector: "dd" })).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Réduire les informations du lecteur" }),
      ).toHaveAttribute("aria-expanded", "true");
    } finally {
      window.matchMedia = original;
    }
  });

  it("can hide and show the corner overlay", async () => {
    api.next.mockResolvedValue(urgent);
    render(<PlayerScreen supportId={3} />);
    await screen.findByRole("complementary", { name: "Informations du lecteur" });
    fireEvent.click(screen.getByRole("button", { name: "Masquer les informations de l'écran" }));
    expect(screen.queryByRole("complementary", { name: "Informations du lecteur" })).toBeNull();
    fireEvent.keyDown(window, { key: "i" });
    expect(
      screen.getByRole("complementary", { name: "Informations du lecteur" }),
    ).toBeInTheDocument();
  });
});
