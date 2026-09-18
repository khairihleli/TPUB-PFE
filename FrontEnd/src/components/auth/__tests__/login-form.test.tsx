import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
const login = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, sessionApi: { ...actual.sessionApi, login } };
});

import { LoginForm } from "@/components/auth/login-form";
import { ApiError } from "@/lib/api";

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText(/^E-mail/), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^Mot de passe/), { target: { value: password } });
}

describe("LoginForm", () => {
  beforeEach(() => {
    router.replace.mockClear();
    router.refresh.mockClear();
    login.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it("shows the session-expired notice", () => {
    render(<LoginForm next={null} expired />);
    expect(
      screen.getByText("Votre session a expiré. Reconnectez-vous pour continuer."),
    ).toBeInTheDocument();
  });

  it("validates before calling the API", async () => {
    render(<LoginForm next={null} expired={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Se connecter/ }));
    expect(await screen.findAllByText("Ce champ est requis.")).toHaveLength(2);
    expect(login).not.toHaveBeenCalled();
  });

  it("redirects to a permitted next path after login", async () => {
    login.mockResolvedValue({
      user: { email: "a@b.tn", nom: "A", role: "ANNONCEUR", userId: 1, exp: 9999999999 },
    });
    render(<LoginForm next="/espace/campagnes" expired={false} />);
    fill("a@b.tn", "Demo@1234");
    fireEvent.click(screen.getByRole("button", { name: /Se connecter/ }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/espace/campagnes"));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("sends staff to /admin when next is an annonceur page", async () => {
    login.mockResolvedValue({
      user: { email: "admin@zelqane.local", nom: "Admin", role: "ADMINISTRATEUR", userId: 2, exp: 1 },
    });
    render(<LoginForm next="/espace" expired={false} />);
    fill("admin@zelqane.local", "Admin@123");
    fireEvent.click(screen.getByRole("button", { name: /Se connecter/ }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin"));
  });

  it("shows the brief's credentials error and keeps the input", async () => {
    login.mockRejectedValue(
      new ApiError(401, "E-mail ou mot de passe incorrect.", {
        rawMessage: "Invalid email or password",
      }),
    );
    render(<LoginForm next={null} expired />);
    fill("a@b.tn", "mauvais-mdp");
    fireEvent.click(screen.getByRole("button", { name: /Se connecter/ }));
    expect(await screen.findByText("E-mail ou mot de passe incorrect.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Mot de passe/)).toHaveValue("mauvais-mdp");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("explains a deactivated account from the ACCOUNT_DISABLED code", async () => {
    login.mockRejectedValue(new ApiError(401, "Compte désactivé.", { code: "ACCOUNT_DISABLED" }));
    render(<LoginForm next={null} expired={false} />);
    fill("a@b.tn", "Demo@1234");
    fireEvent.click(screen.getByRole("button", { name: /Se connecter/ }));
    expect(
      await screen.findByText(
        "Ce compte est désactivé. Contactez l'équipe ZELQANE pour le réactiver.",
      ),
    ).toBeInTheDocument();
  });

  it("maps BAD_CREDENTIALS by code, whatever the status", async () => {
    const { loginErrorMessage } = await import("@/components/auth/login-form");
    expect(loginErrorMessage(new ApiError(400, "x", { code: "BAD_CREDENTIALS" }))).toBe(
      "E-mail ou mot de passe incorrect.",
    );
  });
});
