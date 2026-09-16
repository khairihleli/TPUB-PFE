import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MediaPlanBuilder } from "@/components/offer/media-plan-builder";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

describe("MediaPlanBuilder", () => {
  beforeEach(() => push.mockClear());

  it("updates the brief summary as criteria are ticked, then routes to the contact form", () => {
    render(<MediaPlanBuilder />);

    const status = screen.getByText(/critères? sur 6 précisés?/);
    expect(status).toHaveTextContent("0 critère sur 6 précisé");
    expect(screen.getByRole("button", { name: "Tout effacer" })).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: "Marque" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Grand axe" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Soirée" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Zones visées/ }), {
      target: { value: "Sousse" },
    });

    expect(status).toHaveTextContent("2 critères sur 6 précisés");
    expect(screen.getByRole("checkbox", { name: "Grand axe" })).toBeChecked();

    const summary = screen.getByRole("complementary", { name: "Récapitulatif de votre brief" });
    expect(summary).toHaveTextContent("Grand axe, Sousse");

    fireEvent.click(screen.getByRole("button", { name: /Continuer vers le formulaire/ }));
    expect(push).toHaveBeenCalledTimes(1);
    const href = String(push.mock.calls[0]?.[0]);
    const url = new URL(href, "http://localhost");
    const params = url.searchParams;
    expect(url.pathname).toBe("/contact");
    expect(url.hash).toBe("#formulaire");
    expect(params.get("besoin")).toBe("plan-media");
    expect(params.get("profil")).toBe("marque");
    expect(params.getAll("emplacements")).toEqual(["grand-axe"]);
    expect(params.getAll("creneaux")).toEqual(["soiree"]);
    expect(params.get("zones")).toBe("Sousse");
  });

  it("copies the brief to the clipboard, with a visible fallback when copy fails", async () => {
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("x"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<MediaPlanBuilder />);

    const copyButton = screen.getByRole("button", { name: "Copier mon brief" });
    expect(copyButton).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: "Agence média" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Ramadan" }));
    fireEvent.click(screen.getByRole("button", { name: "Copier mon brief" }));
    expect(await screen.findByRole("button", { name: "Brief copié" })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(
      "Demande de plan média préparée depuis la page Tarifs.\nProfil : Agence média\nSaison : Ramadan",
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Rentrée" }));
    fireEvent.click(screen.getByRole("button", { name: "Copier mon brief" }));
    const fallback = await screen.findByRole("textbox", { name: "Texte de votre brief" });
    expect(fallback).toHaveValue(
      "Demande de plan média préparée depuis la page Tarifs.\nProfil : Agence média\nSaison : Rentrée, Ramadan",
    );
  });

  it("resets the brief", () => {
    render(<MediaPlanBuilder />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Vidéo" }));
    fireEvent.click(screen.getByRole("button", { name: "Tout effacer" }));
    expect(screen.getByRole("checkbox", { name: "Vidéo" })).not.toBeChecked();
    expect(screen.getByText(/critères? sur 6/)).toHaveTextContent("0 critère sur 6 précisé");
  });

  it("degrades to a native GET form towards /contact", () => {
    const { container } = render(<MediaPlanBuilder />);
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("action", "/contact");
    expect(form).toHaveAttribute("method", "get");
    expect(container.querySelector('input[type="hidden"][name="besoin"]')).toHaveValue(
      "plan-media",
    );
  });
});
