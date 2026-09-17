import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RoleCode } from "@/lib/api/types";
import type {
  AiCalibrationResponse,
  AiProvidersResponse,
  AiQualityResponse,
} from "@/lib/api/types-ia";
import { clearResourceCache } from "@/lib/resource-cache";

const api = vi.hoisted(() => ({
  providers: vi.fn(),
  quality: vi.fn(),
  feedback: vi.fn(),
  calibrations: vi.fn(),
  recalibrate: vi.fn(),
  activate: vi.fn(),
}));

vi.mock("@/lib/api/endpoints-ia", () => ({ aiQualityApi: api }));

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => "/admin/ia-qualite",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const session = vi.hoisted((): { role: RoleCode } => ({ role: "ADMINISTRATEUR" }));
vi.mock("@/components/shell/session-provider", () => ({
  useSession: () => ({
    user: { email: "admin@tpub.local", nom: "Admin", role: session.role, userId: 1, exp: 1 },
    role: session.role,
    isAdmin: session.role === "ADMINISTRATEUR",
    isStaff: true,
    canAct: session.role === "ADMINISTRATEUR",
    loggingOut: false,
    logout: vi.fn(),
  }),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { AiQualityView } from "@/components/admin/ai-quality-view";

function calibration(over: Partial<AiCalibrationResponse> = {}): AiCalibrationResponse {
  return {
    version: 1,
    active: true,
    trigger: "INITIAL",
    changed: false,
    approveThreshold: 31,
    rejectThreshold: 70,
    ruleWeights: [],
    feedbackCount: 0,
    falsePositives: 0,
    falseNegatives: 0,
    createdByName: null,
    createdAt: "2026-09-01T00:00:00Z",
    ...over,
  };
}

function quality(over: Partial<AiQualityResponse> = {}): AiQualityResponse {
  return {
    from: "2026-06-20",
    to: "2026-09-17",
    feedbackCount: 3,
    confirmedApprovals: 1,
    falseNegatives: 0,
    falsePositives: 1,
    confirmedFlags: 1,
    falsePositiveRate: 0.5,
    falseNegativeRate: 0,
    accuracy: 2 / 3,
    overrideRate: 0.5,
    perRule: [
      {
        ruleId: 4,
        ruleName: "casino",
        severity: "HIGH",
        active: true,
        matches: 2,
        confirmed: 1,
        falsePositives: 1,
        precision: 0.5,
        weight: 1,
      },
    ],
    weekly: [
      { weekStart: "2026-09-14", feedback: 3, falsePositives: 1, falseNegatives: 0, overrides: 1 },
    ],
    activeCalibration: calibration(),
    ...over,
  };
}

const providers: AiProvidersResponse = {
  provider: "LOCAL",
  configured: true,
  model: null,
  ocr: { engine: "SIMULE", languages: "fra+eng+ara", tessdataPresent: false, reason: null },
  video: { mp4: true, webm: false },
  learning: { enabled: true, autoApply: true, cron: "0 30 3 * * *" },
};

beforeEach(() => {
  clearResourceCache();
  nav.search = "";
  session.role = "ADMINISTRATEUR";
  Object.values(api).forEach((fn) => fn.mockReset());
  api.providers.mockResolvedValue(providers);
  api.quality.mockResolvedValue(quality());
  api.calibrations.mockResolvedValue([
    calibration({
      version: 2,
      active: false,
      trigger: "MANUEL",
      changed: true,
      approveThreshold: 33,
    }),
    calibration(),
  ]);
  api.feedback.mockResolvedValue({ items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 });
});

describe("AiQualityView", () => {
  it("restricts operators", () => {
    session.role = "OPERATEUR";
    render(<AiQualityView />);
    expect(
      screen.getByText("Qualité de l'IA réservée aux administrateurs et superviseurs"),
    ).toBeInTheDocument();
    expect(api.quality).not.toHaveBeenCalled();
  });

  it("shows KPIs, rule precision, calibration actions and the tessdata hint for an administrator", async () => {
    render(<AiQualityView />);
    expect((await screen.findAllByText("Faux positifs")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Taux de dérogation").length).toBeGreaterThan(0);
    expect(screen.getAllByText("casino").length).toBeGreaterThan(0);
    expect(
      await screen.findByRole("button", { name: "Recalibrer maintenant" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Activer cette version" }).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("Revue à partir d'un risque de 31").length).toBeGreaterThan(0);
    expect(
      await screen.findByText(
        /Exécutez BackEnd\/scripts\/fetch-tessdata\.ps1 puis redémarrez le backend/,
      ),
    ).toBeInTheDocument();
    expect(api.quality).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
      expect.anything(),
    );
  });

  it("is read-only for a supervisor", async () => {
    session.role = "SUPERVISEUR";
    render(<AiQualityView />);
    expect(await screen.findByText(/seuls les administrateurs recalibrent/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recalibrer maintenant" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activer cette version" })).not.toBeInTheDocument();
  });

  it("shows the empty state without administrator decisions", async () => {
    api.quality.mockResolvedValue(quality({ feedbackCount: 0, perRule: [], weekly: [] }));
    render(<AiQualityView />);
    expect(
      await screen.findByText("Aucune décision administrateur sur la période"),
    ).toBeInTheDocument();
  });

  it("shows an error with retry", async () => {
    api.quality.mockRejectedValue(new Error("boom"));
    render(<AiQualityView />);
    const retry = await screen.findAllByRole("button", { name: /Réessayer/ });
    expect(retry.length).toBeGreaterThan(0);
  });

  it("lists feedback on the Retours tab with a link to the review", async () => {
    nav.search = "onglet=retours";
    api.feedback.mockResolvedValue({
      items: [
        {
          id: 1,
          campaignId: 12,
          campaignName: "Promo été",
          checkId: 3,
          decisionLogId: 9,
          aiStatus: "REVIEW_REQUIRED",
          adminDecision: "VALIDATED_OVERRIDE",
          outcome: "FALSE_POSITIVE",
          riskScore: 45,
          qualityScore: 70,
          matchedRuleIds: [4],
          calibrationVersion: 1,
          decidedByName: "Admin",
          createdAt: "2026-09-15T10:00:00Z",
        },
      ],
      page: 0,
      size: 20,
      totalItems: 1,
      totalPages: 1,
    });
    render(<AiQualityView />);
    const links = await screen.findAllByRole("link", { name: "Promo été" });
    expect(links[0]!.getAttribute("href")).toContain("examen=12");
    expect(screen.getAllByText("Faux positif").length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(api.feedback).toHaveBeenCalledWith(
        expect.objectContaining({ page: 0, size: 20 }),
        expect.anything(),
      ),
    );
  });
});
