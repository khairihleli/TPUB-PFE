import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import type { Diffusion } from "@/lib/api/types";

const api = vi.hoisted(() => ({ next: vi.fn(), interaction: vi.fn() }));

vi.mock("@/lib/api/endpoints", () => ({
  diffusionApi: { next: api.next, interaction: api.interaction },
}));

import { PlayerScreen } from "@/components/player/player-screen";
import { readDeviceKey, storeDeviceKey } from "@/lib/player/device-key";

const KEY = "tpd_" + "A".repeat(43);
const NEW_KEY = "tpd_" + "b".repeat(43);

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
  api.interaction.mockReset();
  api.interaction.mockResolvedValue(undefined);
  window.localStorage.clear();
  for (const id of [2, 3, 5, 8, 12, 99]) storeDeviceKey(id, KEY);
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

  it("renders the image of a publicité and records one CLIC per diffusion", async () => {
    api.next.mockResolvedValue({
      type: "PUBLICITE",
      diffusionLogId: 41,
      campaignId: 4,
      title: "Café Démo",
      mediaUrl: "/uploads/campaigns/4/visuel.jpg",
      mediaType: "IMAGE",
      duration: 10,
      zone: "Tunis Centre",
      priority: 80,
    } satisfies Diffusion);
    render(<PlayerScreen supportId={5} />);

    const img = await screen.findByRole("img", { name: "Café Démo" });
    expect(img).toHaveAttribute("src", "/uploads/campaigns/4/visuel.jpg");
    const tap = screen.getByRole("button", { name: "Je suis intéressé par « Café Démo »" });
    fireEvent.click(tap);
    fireEvent.click(tap);
    expect(api.interaction).toHaveBeenCalledTimes(1);
    expect(api.interaction).toHaveBeenCalledWith(
      { diffusionLogId: 41, type: "CLIC" },
      { supportId: 5, deviceKey: KEY },
    );
    expect(await screen.findByText("Intérêt enregistré, merci")).toBeInTheDocument();
  });

  it("falls back to the title card when the image cannot be loaded", async () => {
    api.next.mockResolvedValue({
      type: "PUBLICITE",
      diffusionLogId: 42,
      campaignId: 4,
      title: "Café Démo",
      mediaUrl: "/uploads/campaigns/4/manquant.jpg",
      mediaType: "IMAGE",
      duration: 10,
      zone: "Tunis Centre",
      priority: 80,
    } satisfies Diffusion);
    render(<PlayerScreen supportId={5} />);
    fireEvent.error(await screen.findByRole("img", { name: "Café Démo" }));
    expect(screen.queryByRole("img", { name: "Café Démo" })).toBeNull();
    expect(screen.getByText("Campagne")).toBeInTheDocument();
  });

  it("plays a video muted and asks for the next content when it ends", async () => {
    api.next.mockResolvedValue({
      type: "PUBLICITE",
      diffusionLogId: 50,
      campaignId: 9,
      title: "Spot vidéo",
      mediaUrl: "/uploads/campaigns/9/spot.mp4",
      mediaType: "VIDEO",
      duration: 30,
      zone: "Sousse",
      priority: 60,
    } satisfies Diffusion);
    const { container } = render(<PlayerScreen supportId={8} />);
    await screen.findByLabelText("Vidéo publicitaire : Spot vidéo");
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute("playsinline");
    expect(api.next).toHaveBeenCalledTimes(1);
    fireEvent.ended(video);
    await waitFor(() => expect(api.next).toHaveBeenCalledTimes(2));
  });

  it("shows the title and the content of a priority message with the urgency colours", async () => {
    api.next.mockResolvedValue({
      ...urgent,
      emergencyId: 3,
      content: "Empruntez l'avenue Habib-Bourguiba.",
      urgencyLevel: "MEDIUM",
    } satisfies Diffusion);
    const { container } = render(<PlayerScreen supportId={3} />);
    expect(await screen.findByText("Empruntez l'avenue Habib-Bourguiba.")).toBeInTheDocument();
    expect(screen.getByText("Message important")).toBeInTheDocument();
    expect(container.querySelector("[data-urgency=MEDIUM]")).not.toBeNull();
  });

  it("sends the simulated date-time given by ?datetime", async () => {
    api.next.mockResolvedValue({
      ...urgent,
      type: "DEFAUT",
      title: "TPUB",
      content: "Espace de diffusion TPUB",
    });
    render(<PlayerScreen supportId={2} simulatedAt="2026-12-24T20:00:00" />);
    expect(await screen.findByText("Espace de diffusion TPUB")).toBeInTheDocument();
    const [query] = api.next.mock.calls[0] as [{ datetime: string }];
    expect(query.datetime.startsWith("2026-12-24T20:00:0")).toBe(true);
    expect(screen.getByText("Heure simulée (?datetime)")).toBeInTheDocument();
  });

  it("sends the stored device key of the screen", async () => {
    api.next.mockResolvedValue(urgent);
    render(<PlayerScreen supportId={3} />);
    await waitFor(() => expect(api.next).toHaveBeenCalled());
    const [, options] = api.next.mock.calls[0] as [unknown, { deviceKey: string }];
    expect(options.deviceKey).toBe(KEY);
  });

  it("never polls an unpaired screen and explains how to pair it", async () => {
    window.localStorage.clear();
    render(<PlayerScreen supportId={7} />);
    expect(await screen.findByText("Écran non appairé")).toBeInTheDocument();
    expect(screen.getByText(/Réseau › Porteur › Appairer l.écran/)).toBeInTheDocument();
    expect(api.next).not.toHaveBeenCalled();
  });

  it("stores the pairing key of the URL and removes it from the address bar", async () => {
    window.localStorage.clear();
    window.history.replaceState(null, "", `/ecran/7?cle=${NEW_KEY}&datetime=2026-12-24T20:00`);
    api.next.mockResolvedValue(urgent);
    render(<PlayerScreen supportId={7} pairingKey={NEW_KEY} />);
    await waitFor(() => expect(api.next).toHaveBeenCalled());
    expect(readDeviceKey(7)).toBe(NEW_KEY);
    expect(window.location.search).toBe("?datetime=2026-12-24T20%3A00");
    const [, options] = api.next.mock.calls[0] as [unknown, { deviceKey: string }];
    expect(options.deviceKey).toBe(NEW_KEY);
    window.history.replaceState(null, "", "/");
  });

  it("forgets a revoked key and stops polling", async () => {
    api.next.mockRejectedValue(
      new ApiError(401, "Clé d'appareil invalide ou révoquée.", { code: "DEVICE_KEY_INVALID" }),
    );
    render(<PlayerScreen supportId={3} />);
    expect(await screen.findByText("Écran non appairé")).toBeInTheDocument();
    expect(screen.getByText(/a été révoquée ou remplacée/)).toBeInTheDocument();
    expect(readDeviceKey(3)).toBeNull();
    expect(api.next).toHaveBeenCalledTimes(1);
  });

  it("warns when the backend ignored the simulated date-time", async () => {
    api.next.mockResolvedValue({ ...urgent, type: "DEFAUT", title: "TPUB", simulatedTime: false });
    render(<PlayerScreen supportId={2} simulatedAt="2026-12-24T20:00:00" />);
    expect(
      await screen.findByText("Heure simulée ignorée : le serveur utilise son horloge"),
    ).toBeInTheDocument();
  });
});
