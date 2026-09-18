import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as Endpoints from "@/lib/api/endpoints";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
const api = vi.hoisted(() => ({
  changePassword: vi.fn(),
  getSession: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof Endpoints>();
  return {
    ...actual,
    meApi: { ...actual.meApi, changePassword: api.changePassword },
    sessionApi: { ...actual.sessionApi, get: api.getSession, logout: api.logout },
  };
});

import { ForcedPasswordChange } from "@/components/auth/forced-password-change";

async function fillAndSubmit(u: ReturnType<typeof userEvent.setup>) {
  await u.type(screen.getByLabelText(/^Mot de passe actuel/), "Initial2026x");
  await u.type(screen.getByLabelText(/^Nouveau mot de passe/), "Nouveau2026");
  await u.type(screen.getByLabelText(/^Confirmation/), "Nouveau2026");
  await u.click(screen.getByRole("button", { name: "Enregistrer et continuer" }));
}

describe("ForcedPasswordChange (/mot-de-passe-requis)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.changePassword.mockResolvedValue(undefined);
    api.logout.mockResolvedValue({ ok: true });
  });

  it("changes the password, refreshes the session user and goes to the role home", async () => {
    const u = userEvent.setup();
    api.getSession.mockResolvedValue({
      user: {
        email: "admin@zelqane.local",
        nom: "Admin",
        role: "ADMINISTRATEUR",
        userId: 1,
        exp: 1,
        mustChangePassword: false,
      },
    });
    render(<ForcedPasswordChange next="/espace" />);
    await fillAndSubmit(u);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin"));
    expect(api.changePassword).toHaveBeenCalledWith({
      currentPassword: "Initial2026x",
      newPassword: "Nouveau2026",
    });
    expect(api.getSession).toHaveBeenCalledWith({ refresh: true });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("stays on the page while the refreshed session still requires a change", async () => {
    const u = userEvent.setup();
    api.getSession.mockResolvedValue({
      user: {
        email: "a@b.tn",
        nom: "A",
        role: "ANNONCEUR",
        userId: 2,
        exp: 1,
        mustChangePassword: true,
      },
    });
    render(<ForcedPasswordChange next={null} />);
    await fillAndSubmit(u);
    expect(await screen.findByText(/pas encore été pris en compte/)).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("validates the new password rules before calling the API", async () => {
    const u = userEvent.setup();
    render(<ForcedPasswordChange next={null} />);
    await u.type(screen.getByLabelText(/^Mot de passe actuel/), "Initial2026x");
    await u.type(screen.getByLabelText(/^Nouveau mot de passe/), "court");
    await u.type(screen.getByLabelText(/^Confirmation/), "court");
    await u.click(screen.getByRole("button", { name: "Enregistrer et continuer" }));
    expect(await screen.findByText("8 caractères minimum.")).toBeInTheDocument();
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("logs out", async () => {
    const u = userEvent.setup();
    render(<ForcedPasswordChange next={null} />);
    await u.click(screen.getByRole("button", { name: "Se déconnecter" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/connexion"));
    expect(api.logout).toHaveBeenCalled();
  });
});
