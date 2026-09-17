import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as Endpoints from "@/lib/api/endpoints";
import type { MeResponse, SessionUser, UserSessionResponse } from "@/lib/api/types";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  changePassword: vi.fn(),
  uploadLogo: vi.fn(),
  removeLogo: vi.fn(),
  sessions: vi.fn(),
  revokeSession: vi.fn(),
  revokeOtherSessions: vi.fn(),
  loginHistory: vi.fn(),
  twoFactor: vi.fn(),
  twoFactorSetup: vi.fn(),
  twoFactorEnable: vi.fn(),
  twoFactorDisable: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
}));

vi.mock("@/lib/api/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof Endpoints>();
  return { ...actual, meApi: api };
});

const user: SessionUser = {
  email: "sami@exemple.tn",
  nom: "Sami Ben Salah",
  role: "ANNONCEUR",
  userId: 7,
  exp: 1_900_000_000,
};

vi.mock("@/components/shell/session-provider", () => ({
  useSession: () => ({ user, role: user.role, loggingOut: false, logout: vi.fn() }),
}));

import {
  checkLogoFile,
  describeUserAgent,
  loginOutcomeLabel,
  passwordChangeSchema,
  profileSchema,
  sortSessions,
  toMeUpdateRequest,
} from "@/components/espace/profile-model";
import { PASSWORD_CHANGED_NOTICE, ProfileView } from "@/components/espace/profile-view";
import { ToastProvider } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { clearResourceCache } from "@/lib/resource-cache";

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function me(partial: Partial<MeResponse> = {}): MeResponse {
  return {
    userId: 7,
    email: "sami@exemple.tn",
    nom: "Sami Ben Salah",
    role: "ANNONCEUR",
    societe: "Café Démo",
    telephone: "+216 71 000 000",
    adresse: null,
    logoUrl: null,
    isActive: true,
    lastLoginAt: "2026-09-16T08:00:00Z",
    createdAt: "2026-01-10T08:00:00Z",
    client: {
      clientId: 3,
      companyName: "Café Démo",
      validationStatus: "VALIDATED",
      trustLevel: 60,
    },
    ...partial,
  };
}

function session(partial: Partial<UserSessionResponse> & { id: string }): UserSessionResponse {
  return {
    createdAt: "2026-09-16T08:00:00Z",
    lastSeenAt: "2026-09-16T09:00:00Z",
    expiresAt: "2026-09-17T08:00:00Z",
    ipAddress: "41.0.0.1",
    userAgent: CHROME_WINDOWS,
    current: false,
    ...partial,
  };
}

function renderProfile() {
  return render(
    <ToastProvider>
      <ProfileView />
    </ToastProvider>,
  );
}

beforeEach(() => {
  clearResourceCache();
  for (const fn of Object.values(api)) fn.mockReset();
  api.get.mockResolvedValue(me());
  api.twoFactor.mockResolvedValue({
    enabled: false,
    enabledAt: null,
    required: false,
    recoveryCodesRemaining: 0,
    pendingSetup: false,
  });
  api.sessions.mockResolvedValue([
    session({
      id: "b",
      current: false,
      userAgent: SAFARI_IPHONE,
      lastSeenAt: "2026-09-15T09:00:00Z",
    }),
    session({ id: "a", current: true }),
  ]);
  api.loginHistory.mockResolvedValue([
    {
      id: 2,
      email: "sami@exemple.tn",
      success: false,
      failureReason: "BAD_CREDENTIALS",
      ipAddress: "41.0.0.9",
      userAgent: SAFARI_IPHONE,
      createdAt: "2026-09-15T07:00:00Z",
    },
    {
      id: 1,
      email: "sami@exemple.tn",
      success: true,
      failureReason: null,
      ipAddress: "41.0.0.1",
      userAgent: CHROME_WINDOWS,
      createdAt: "2026-09-16T08:00:00Z",
    },
  ]);
});

describe("profile model", () => {
  it("mirrors the PUT /me constraints and sends blanks as null", () => {
    expect(
      profileSchema.safeParse({ nom: " ", societe: "", telephone: "", adresse: "" }).success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({ nom: "Sami", societe: "", telephone: "abc", adresse: "" }).success,
    ).toBe(false);
    const parsed = profileSchema.parse({
      nom: " Sami ",
      societe: "",
      telephone: "+216 (71) 000-000",
      adresse: "",
    });
    expect(toMeUpdateRequest(parsed)).toEqual({
      nom: "Sami",
      societe: null,
      telephone: "+216 (71) 000-000",
      adresse: null,
    });
  });

  it("requires 8 characters with a letter and a digit, a matching confirmation and a new value", () => {
    const check = (currentPassword: string, newPassword: string, confirmPassword: string) =>
      passwordChangeSchema.safeParse({ currentPassword, newPassword, confirmPassword });
    expect(check("old", "short1", "short1").success).toBe(false);
    expect(check("old", "abcdefgh", "abcdefgh").success).toBe(false);
    expect(check("old", "abcdefg1", "abcdefg2").success).toBe(false);
    expect(check("abcdefg1", "abcdefg1", "abcdefg1").success).toBe(false);
    expect(check("old", "abcdefg1", "abcdefg1").success).toBe(true);
  });

  it("pre-checks the logo type and size", () => {
    expect(checkLogoFile({ type: "image/png", size: 1000 })).toBeNull();
    expect(checkLogoFile({ type: "image/gif", size: 1000 })).toMatch(/PNG, JPEG ou WebP/);
    expect(checkLogoFile({ type: "image/webp", size: 3 * 1024 * 1024 })).toMatch(/trop lourd/);
  });

  it("describes devices and login outcomes", () => {
    expect(describeUserAgent(CHROME_WINDOWS)).toBe("Chrome · Windows");
    expect(describeUserAgent(SAFARI_IPHONE)).toBe("Safari · iOS");
    expect(describeUserAgent("curl/8.0")).toBe("Client API");
    expect(describeUserAgent(null)).toBe("Appareil inconnu");
    expect(loginOutcomeLabel({ success: true, failureReason: null })).toBe("Connexion réussie");
    expect(loginOutcomeLabel({ success: false, failureReason: "ACCOUNT_DISABLED" })).toBe(
      "Échec : Compte désactivé",
    );
    expect(
      sortSessions([
        session({ id: "x", lastSeenAt: "2026-09-10T00:00:00Z" }),
        session({ id: "y", lastSeenAt: "2026-09-12T00:00:00Z" }),
        session({ id: "z", current: true, lastSeenAt: "2026-09-01T00:00:00Z" }),
      ]).map((s) => s.id),
    ).toEqual(["z", "y", "x"]);
  });
});

describe("ProfileView", () => {
  it("edits the profile with PUT /me", async () => {
    const u = userEvent.setup();
    api.update.mockImplementation((body: { nom: string; adresse: string | null }) =>
      Promise.resolve(me({ nom: body.nom, adresse: body.adresse })),
    );
    renderProfile();

    const address = await screen.findByLabelText(/^Adresse/);
    const save = screen.getByRole("button", { name: "Enregistrer" });
    expect(save).toHaveAttribute("aria-disabled", "true");
    await u.type(address, "12 rue de Marseille, Tunis");
    await u.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith({
        nom: "Sami Ben Salah",
        societe: "Café Démo",
        telephone: "+216 71 000 000",
        adresse: "12 rue de Marseille, Tunis",
      }),
    );
    expect(await screen.findByText("Profil enregistré")).toBeInTheDocument();
  });

  it("shows a phone validation error without calling the API", async () => {
    const u = userEvent.setup();
    renderProfile();
    const phone = await screen.findByLabelText(/^Téléphone/);
    await u.clear(phone);
    await u.type(phone, "abc");
    await u.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByText(/Numéro invalide/)).toBeInTheDocument();
    expect(api.update).not.toHaveBeenCalled();
  });

  it("changes the password and maps INVALID_CURRENT_PASSWORD to its field", async () => {
    const u = userEvent.setup();
    api.changePassword
      .mockRejectedValueOnce(new ApiError(400, "x", { code: "INVALID_CURRENT_PASSWORD" }))
      .mockResolvedValueOnce(undefined);
    renderProfile();

    const form = (await screen.findByRole("heading", { name: "Mot de passe" })).closest("section")!;
    await u.type(within(form).getByLabelText(/^Mot de passe actuel/), "mauvais1");
    await u.type(within(form).getByLabelText(/^Nouveau mot de passe/), "Nouveau2026");
    await u.type(within(form).getByLabelText(/^Confirmation/), "Nouveau2026");
    await u.click(within(form).getByRole("button", { name: "Modifier le mot de passe" }));
    expect(await within(form).findByText("Mot de passe actuel incorrect.")).toBeInTheDocument();

    await u.clear(within(form).getByLabelText(/^Mot de passe actuel/));
    await u.type(within(form).getByLabelText(/^Mot de passe actuel/), "Ancien2025");
    await u.click(within(form).getByRole("button", { name: "Modifier le mot de passe" }));
    await waitFor(() =>
      expect(api.changePassword).toHaveBeenLastCalledWith({
        currentPassword: "Ancien2025",
        newPassword: "Nouveau2026",
      }),
    );
    expect(await within(form).findByText(PASSWORD_CHANGED_NOTICE)).toBeInTheDocument();
  });

  it("lists active sessions, revokes one and logs out the other devices", async () => {
    const u = userEvent.setup();
    api.revokeSession.mockResolvedValue(undefined);
    api.revokeOtherSessions.mockResolvedValue({ revoked: 1 });
    renderProfile();

    const card = (await screen.findByRole("heading", { name: "Sessions actives" })).closest(
      "section",
    )!;
    const items = await within(card).findAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Chrome · Windows");
    expect(items[0]).toHaveTextContent("Cet appareil");
    expect(within(items[0]!).queryByRole("button", { name: /Déconnecter/ })).toBeNull();
    expect(items[1]).toHaveTextContent("Safari · iOS");

    await u.click(within(items[1]!).getByRole("button", { name: /Déconnecter/ }));
    const dialog = await screen.findByRole("dialog", { name: /Déconnecter cet appareil/ });
    await u.click(within(dialog).getByRole("button", { name: "Déconnecter" }));
    await waitFor(() => expect(api.revokeSession).toHaveBeenCalledWith("b"));
    await waitFor(() => expect(within(card).getAllByRole("listitem")).toHaveLength(1));

    // Only this device is left: the « other devices » action disappears.
    expect(
      within(card).queryByRole("button", { name: "Déconnecter les autres appareils" }),
    ).toBeNull();
  });

  it("logs out every other device at once", async () => {
    const u = userEvent.setup();
    api.revokeOtherSessions.mockResolvedValue({ revoked: 1 });
    renderProfile();
    await u.click(await screen.findByRole("button", { name: "Déconnecter les autres appareils" }));
    const dialog = await screen.findByRole("dialog", { name: /Déconnecter les autres appareils/ });
    await u.click(within(dialog).getByRole("button", { name: "Déconnecter les autres" }));
    await waitFor(() => expect(api.revokeOtherSessions).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("1 appareil déconnecté")).toBeInTheDocument();
  });

  it("shows the login history with failures", async () => {
    renderProfile();
    const table = await screen.findByRole("table", { name: "Historique des connexions" });
    expect(within(table).getByText("Échec : Mot de passe incorrect")).toBeInTheDocument();
    expect(within(table).getByText("Connexion réussie")).toBeInTheDocument();
    expect(api.loginHistory).toHaveBeenCalledWith(20, expect.anything());
  });

  it("uploads a logo and explains a suspended account", async () => {
    const u = userEvent.setup();
    api.get.mockResolvedValue(
      me({
        client: {
          clientId: 3,
          companyName: "Café Démo",
          validationStatus: "SUSPENDED",
          trustLevel: 10,
        },
      }),
    );
    api.uploadLogo.mockResolvedValue(me({ logoUrl: "/uploads/logos/7/logo.png" }));
    const { container } = renderProfile();

    expect(await screen.findByText("Compte suspendu")).toBeInTheDocument();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([new Uint8Array(100)], "logo.png", { type: "image/png" });
    await u.upload(input, file);
    await waitFor(() =>
      expect(api.uploadLogo).toHaveBeenCalledWith(
        file,
        expect.objectContaining({ onProgress: expect.any(Function) }),
      ),
    );
    expect(await screen.findByRole("img", { name: /Logo de Café Démo/ })).toHaveAttribute(
      "src",
      "/uploads/logos/7/logo.png",
    );
    expect(screen.getByRole("button", { name: "Retirer le logo" })).toBeInTheDocument();
  });
});

describe("two-factor authentication card (round 2 §3.7)", () => {
  const CODES = Array.from({ length: 10 }, (_, i) => `abcd${i}-efgh${i}`);

  it("lives in the #securite section and enables TOTP with recovery codes", async () => {
    const u = userEvent.setup();
    api.twoFactorSetup.mockResolvedValue({
      secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
      otpauthUri: "otpauth://totp/TPUB:sami%40exemple.tn?secret=JBSWY3DPEHPK3PXP&issuer=TPUB",
      expiresAt: "2099-01-01T00:00:00Z",
    });
    api.twoFactorEnable
      .mockRejectedValueOnce(new ApiError(400, "x", { code: "TOTP_CODE_INVALID" }))
      .mockResolvedValueOnce({ recoveryCodes: CODES });
    const { container } = renderProfile();

    const card = (await screen.findByRole("heading", { name: "Double authentification" })).closest(
      "section",
    )!;
    expect(container.querySelector("#securite")?.contains(card)).toBe(true);
    expect(await within(card).findByText("Inactive")).toBeInTheDocument();

    await u.click(within(card).getByRole("button", { name: "Activer la double authentification" }));
    expect(await within(card).findByRole("img", { name: /QR code/ })).toBeInTheDocument();
    expect(within(card).getByText("JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP")).toBeInTheDocument();

    const input = within(card).getByLabelText(/^Code à 6 chiffres/);
    await u.type(input, "12a3456");
    expect(input).toHaveValue("123456");
    await u.click(within(card).getByRole("button", { name: "Confirmer et activer" }));
    expect(await within(card).findByText(/Code incorrect/)).toBeInTheDocument();

    await u.type(within(card).getByLabelText(/^Code à 6 chiffres/), "654321");
    await u.click(within(card).getByRole("button", { name: "Confirmer et activer" }));
    await waitFor(() => expect(api.twoFactorEnable).toHaveBeenLastCalledWith("654321"));

    const dialog = await screen.findByRole("dialog", { name: "Double authentification activée" });
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(10);
    const finish = within(dialog).getByRole("button", { name: "Terminer" });
    expect(finish).toHaveAttribute("aria-disabled", "true");
    await u.click(within(dialog).getByLabelText("J'ai conservé mes codes de secours"));
    await u.click(finish);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("refuses deactivation when the role requires 2FA and warns about few codes", async () => {
    api.twoFactor.mockResolvedValue({
      enabled: true,
      enabledAt: "2026-09-01T08:00:00Z",
      required: true,
      recoveryCodesRemaining: 1,
      pendingSetup: false,
    });
    renderProfile();
    expect(await screen.findByText("Obligatoire pour votre rôle")).toBeInTheDocument();
    expect(screen.getByText(/1 code de secours restant/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Désactiver" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("disables 2FA with the password and a recovery code", async () => {
    const u = userEvent.setup();
    api.twoFactor.mockResolvedValue({
      enabled: true,
      enabledAt: "2026-09-01T08:00:00Z",
      required: false,
      recoveryCodesRemaining: 8,
      pendingSetup: false,
    });
    api.twoFactorDisable
      .mockRejectedValueOnce(new ApiError(400, "x", { code: "INVALID_CURRENT_PASSWORD" }))
      .mockResolvedValueOnce(undefined);
    renderProfile();

    await u.click(await screen.findByRole("button", { name: "Désactiver" }));
    const dialog = await screen.findByRole("dialog", { name: /Désactiver la double/ });
    await u.type(within(dialog).getByLabelText(/^Mot de passe actuel/), "Faux2026");
    await u.click(within(dialog).getByRole("button", { name: "Utiliser un code de secours" }));
    await u.type(within(dialog).getByLabelText(/^Code de secours/), "ABCDE12345");
    await u.click(within(dialog).getByRole("button", { name: "Désactiver" }));
    expect(await within(dialog).findByText("Mot de passe actuel incorrect.")).toBeInTheDocument();

    await u.clear(within(dialog).getByLabelText(/^Mot de passe actuel/));
    await u.type(within(dialog).getByLabelText(/^Mot de passe actuel/), "Ancien2025");
    await u.click(within(dialog).getByRole("button", { name: "Désactiver" }));
    await waitFor(() =>
      expect(api.twoFactorDisable).toHaveBeenLastCalledWith({
        password: "Ancien2025",
        code: "abcde-12345",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
