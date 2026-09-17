import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as Endpoints from "@/lib/api/endpoints";
import type { MeResponse } from "@/lib/api/types";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  sessions: vi.fn(),
  loginHistory: vi.fn(),
  twoFactor: vi.fn(),
}));

vi.mock("@/lib/api/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof Endpoints>();
  return { ...actual, meApi: { ...actual.meApi, ...api } };
});

vi.mock("@/components/shell/session-provider", () => ({
  useSession: () => ({
    user: { email: "admin@tpub.local", nom: "Admin", role: "ADMINISTRATEUR", userId: 1, exp: 1 },
    role: "ADMINISTRATEUR",
    loggingOut: false,
    logout: vi.fn(),
  }),
}));

import { AccountView } from "@/components/account/account-view";
import { ToastProvider } from "@/components/ui/toast";
import { clearResourceCache } from "@/lib/resource-cache";

const me: MeResponse = {
  userId: 1,
  email: "admin@tpub.local",
  nom: "Admin TPUB",
  role: "ADMINISTRATEUR",
  telephone: null,
  societe: null,
  adresse: null,
  logoUrl: null,
  lastLoginAt: "2026-09-17T08:00:00Z",
  createdAt: "2026-01-01T08:00:00Z",
  client: null,
  isActive: true,
  twoFactorEnabled: true,
  twoFactorRequired: true,
  mustChangePassword: false,
};

describe("AccountView (/admin/compte)", () => {
  beforeEach(() => {
    clearResourceCache();
    api.get.mockResolvedValue(me);
    api.sessions.mockResolvedValue([]);
    api.loginHistory.mockResolvedValue([]);
    api.twoFactor.mockResolvedValue({
      enabled: true,
      enabledAt: "2026-09-01T08:00:00Z",
      required: true,
      recoveryCodesRemaining: 10,
      pendingSetup: false,
    });
  });

  it("shows the profile summary and every security card", async () => {
    render(
      <ToastProvider>
        <AccountView />
      </ToastProvider>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Mon compte" })).toBeInTheDocument();
    expect(await screen.findByText("Admin TPUB")).toBeInTheDocument();
    expect(screen.getByText("Active · obligatoire pour ce rôle")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mot de passe" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Double authentification" })).toBeInTheDocument();
    expect(await screen.findByText("Aucune session active.")).toBeInTheDocument();
    expect(await screen.findByText("Aucune connexion enregistrée.")).toBeInTheDocument();
    expect(await screen.findByText("10 codes de secours restants.")).toBeInTheDocument();
  });
});
