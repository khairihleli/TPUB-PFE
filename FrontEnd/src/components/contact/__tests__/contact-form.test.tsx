import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";

const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, apiFetch };
});

import { ContactForm } from "@/components/contact/contact-form";
import { ApiError } from "@/lib/api";

function fillValid() {
  fireEvent.change(screen.getByLabelText(/^Nom et prénom/), { target: { value: "Nadia K." } });
  fireEvent.change(screen.getByLabelText(/^E-mail professionnel/), {
    target: { value: "nadia@agence.tn" },
  });
  fireEvent.change(screen.getByLabelText(/^Message/), {
    target: { value: "Plan média rentrée sur Tunis et Sfax." },
  });
  fireEvent.click(screen.getByLabelText(/J'accepte que ZELQANE/));
}

describe("ContactForm", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("pre-fills profile and need from the query and shows the routing hint", () => {
    render(<ContactForm initial={{ profil: "agence", besoin: "plan-media" }} />);
    expect(screen.getByLabelText("Agence média")).toBeChecked();
    expect(screen.getByLabelText(/^Votre besoin/)).toHaveValue("plan-media");
    expect(screen.getByText(/Pour un plan média/)).toBeInTheDocument();
  });

  it("applies a new pre-fill from a persona link without losing typed values", () => {
    const { rerender } = render(<ContactForm initial={{ profil: "", besoin: "" }} />);
    fireEvent.change(screen.getByLabelText(/^Nom et prénom/), { target: { value: "Nadia K." } });
    rerender(<ContactForm initial={{ profil: "institution", besoin: "interet-general" }} />);
    expect(screen.getByLabelText("Institution")).toBeChecked();
    expect(screen.getByLabelText(/^Votre besoin/)).toHaveValue("interet-general");
    expect(screen.getByLabelText(/^Nom et prénom/)).toHaveValue("Nadia K.");
  });

  it("shows French validation errors and does not submit", async () => {
    render(<ContactForm initial={{ profil: "", besoin: "" }} />);
    fireEvent.click(screen.getByRole("button", { name: /Envoyer ma demande/ }));
    expect((await screen.findAllByText("Ce champ est requis.")).length).toBeGreaterThanOrEqual(4);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("posts to /api/contact and shows the success copy", async () => {
    apiFetch.mockResolvedValue({ ok: true });
    render(<ContactForm initial={{ profil: "agence", besoin: "plan-media" }} />);
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: /Envoyer ma demande/ }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    const [path, options] = apiFetch.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(path).toBe("/api/contact");
    expect(options.body).toMatchObject({ profil: "agence", site_web: "", consentement: true });
    expect(
      await screen.findByText(
        "Merci, votre demande est bien envoyée. L'équipe ZELQANE revient vers vous par e-mail.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the input and shows the brief's error copy when sending fails", async () => {
    apiFetch.mockImplementation(() =>
      Promise.reject(new ApiError(502, "Le service ZELQANE est momentanément indisponible.")),
    );
    render(<ContactForm initial={{ profil: "marque", besoin: "campagne" }} />);
    fillValid();
    fireEvent.click(screen.getByRole("button", { name: /Envoyer ma demande/ }));
    expect(
      await screen.findByText(/L'envoi n'a pas abouti. Réessayez ou écrivez-nous à/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nom et prénom/)).toHaveValue("Nadia K.");
  });
});
