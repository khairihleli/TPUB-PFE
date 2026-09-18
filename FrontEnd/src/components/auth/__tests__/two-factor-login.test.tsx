import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ApiModule from "@/lib/api";
import type * as Endpoints from "@/lib/api/endpoints";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
const api = vi.hoisted(() => ({
  login: vi.fn(),
  verifyTotp: vi.fn(),
  enrolmentSetup: vi.fn(),
  enrolmentEnable: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return { ...actual, sessionApi: { ...actual.sessionApi, login: api.login } };
});
vi.mock("@/lib/api/endpoints", async (importOriginal) => {
  const actual = await importOriginal<typeof Endpoints>();
  return { ...actual, sessionApi: { ...actual.sessionApi, ...api } };
});

import { readChallengeInfo, storeChallengeInfo } from "@/components/auth/challenge-storage";
import { LoginForm } from "@/components/auth/login-form";
import { TotpEnrolmentFlow } from "@/components/auth/totp-enrolment-flow";
import { TotpVerificationForm } from "@/components/auth/totp-verification-form";
import { ApiError } from "@/lib/api/errors";

const admin = {
  email: "admin@zelqane.local",
  nom: "Admin",
  role: "ADMINISTRATEUR" as const,
  userId: 1,
  exp: 9_999_999_999,
  mustChangePassword: false,
  twoFactorEnabled: true,
};

const inFiveMinutes = () => new Date(Date.now() + 300_000).toISOString();

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  router.replace.mockClear();
  router.refresh.mockClear();
  window.sessionStorage.clear();
});

afterEach(() => vi.clearAllMocks());

describe("LoginForm — second step (§3.7)", () => {
  function submit() {
    fireEvent.change(screen.getByLabelText(/^E-mail/), { target: { value: "admin@zelqane.local" } });
    fireEvent.change(screen.getByLabelText(/^Mot de passe/), { target: { value: "Admin2026x" } });
    fireEvent.click(screen.getByRole("button", { name: /Se connecter/ }));
  }

  it("goes to the verification page with next and remembers the challenge (no token)", async () => {
    const expiresAt = inFiveMinutes();
    api.login.mockResolvedValue({ status: "TOTP_REQUIRED", email: "admin@zelqane.local", expiresAt });
    render(<LoginForm next="/admin/utilisateurs" expired={false} />);
    submit();
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        "/connexion/verification?next=%2Fadmin%2Futilisateurs",
      ),
    );
    expect(readChallengeInfo("TOTP_REQUIRED")).toEqual({
      status: "TOTP_REQUIRED",
      email: "admin@zelqane.local",
      expiresAt,
    });
  });

  it("goes to the mandatory enrolment", async () => {
    api.login.mockResolvedValue({
      status: "TOTP_ENROLMENT_REQUIRED",
      email: "admin@zelqane.local",
      expiresAt: inFiveMinutes(),
    });
    render(<LoginForm next={null} expired={false} />);
    submit();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/connexion/activer-2fa"));
  });

  it("sends an account that must change its password to /mot-de-passe-requis", async () => {
    api.login.mockResolvedValue({
      status: "AUTHENTICATED",
      user: { ...admin, mustChangePassword: true },
    });
    render(<LoginForm next={null} expired={false} />);
    submit();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/mot-de-passe-requis"));
  });
});

describe("TotpVerificationForm", () => {
  beforeEach(() => {
    storeChallengeInfo({
      status: "TOTP_REQUIRED",
      email: "admin@zelqane.local",
      expiresAt: inFiveMinutes(),
    });
  });

  it("verifies a 6-digit code and opens the session", async () => {
    api.verifyTotp
      .mockRejectedValueOnce(
        new ApiError(401, "Code de vérification incorrect.", { code: "TOTP_CODE_INVALID" }),
      )
      .mockResolvedValueOnce({ status: "AUTHENTICATED", user: admin, recoveryCodeUsed: false });
    render(<TotpVerificationForm next="/admin/reseau" />);
    expect(screen.getByText("admin@zelqane.local")).toBeInTheDocument();
    expect(screen.getByText(/Temps restant/)).toBeInTheDocument();

    const input = screen.getByLabelText(/^Code de vérification/);
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveAttribute("inputmode", "numeric");
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Vérifier" }));
    expect(await screen.findByText("Le code comporte exactement 6 chiffres.")).toBeInTheDocument();
    expect(api.verifyTotp).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "111111" } });
    fireEvent.click(screen.getByRole("button", { name: "Vérifier" }));
    expect(await screen.findByText(/Code incorrect/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Code de vérification/), {
      target: { value: "222222" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Vérifier" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin/reseau"));
    expect(api.verifyTotp).toHaveBeenLastCalledWith("222222");
    expect(readChallengeInfo("TOTP_REQUIRED")).toBeNull();
  });

  it("accepts a recovery code and warns before continuing", async () => {
    api.verifyTotp.mockResolvedValue({
      status: "AUTHENTICATED",
      user: admin,
      recoveryCodeUsed: true,
    });
    render(<TotpVerificationForm next={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Utiliser un code de secours" }));
    fireEvent.change(screen.getByLabelText(/^Code de secours/), {
      target: { value: "ABCDE 12345" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Vérifier" }));
    expect(await screen.findByText("Code de secours utilisé")).toBeInTheDocument();
    expect(api.verifyTotp).toHaveBeenCalledWith("abcde-12345");
    fireEvent.click(screen.getByRole("button", { name: /Continuer/ }));
    expect(router.replace).toHaveBeenCalledWith("/admin");
  });

  it("goes back to the login page when the challenge expired", async () => {
    api.verifyTotp.mockRejectedValue(
      new ApiError(401, "La vérification a expiré.", { code: "CHALLENGE_EXPIRED" }),
    );
    render(<TotpVerificationForm next={null} />);
    fireEvent.change(screen.getByLabelText(/^Code de vérification/), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Vérifier" }));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith("/connexion?verification=expiree"),
    );
  });
});

describe("TotpEnrolmentFlow", () => {
  it("scans, confirms the first code, then requires keeping the recovery codes", async () => {
    storeChallengeInfo({
      status: "TOTP_ENROLMENT_REQUIRED",
      email: "admin@zelqane.local",
      expiresAt: inFiveMinutes(),
    });
    api.enrolmentSetup.mockResolvedValue({
      secret: "JBSWY3DPEHPK3PXP",
      otpauthUri: "otpauth://totp/ZELQANE:admin%40zelqane.local?secret=JBSWY3DPEHPK3PXP&issuer=ZELQANE",
      expiresAt: inFiveMinutes(),
    });
    api.enrolmentEnable.mockResolvedValue({
      status: "AUTHENTICATED",
      user: admin,
      recoveryCodes: ["abcde-fghjk", "mnpqr-stvwx"],
    });
    render(<TotpEnrolmentFlow next={null} />);

    expect(await screen.findByRole("img", { name: /QR code/ })).toBeInTheDocument();
    expect(screen.getByText("JBSW Y3DP EHPK 3PXP")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Code à 6 chiffres/), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Activer la double authentification/ }));

    expect(await screen.findByText("abcde-fghjk")).toBeInTheDocument();
    const go = screen.getByRole("button", { name: /Accéder à mon espace/ });
    expect(go).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(go);
    expect(router.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("J'ai conservé mes codes de secours"));
    fireEvent.click(screen.getByRole("button", { name: /Accéder à mon espace/ }));
    expect(router.replace).toHaveBeenCalledWith("/admin");
  });
});
