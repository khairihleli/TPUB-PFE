import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import type {
  AdminUserResponse,
  AiRuleResponse,
  PageResponse,
  ReservationResponse,
  RoleCode,
  StatisticsViewsQuery,
  SupportResponse,
} from "@/lib/api/types";
import { clearResourceCache } from "@/lib/resource-cache";

const api = vi.hoisted(() => ({
  views: vi.fn(),
  history: vi.fn(),
  dashboard: vi.fn(),
  exportCsv: vi.fn(),
  aiDashboard: vi.fn(),
  rulesList: vi.fn(),
  rulesCreate: vi.fn(),
  rulesUpdate: vi.fn(),
  rulesRemove: vi.fn(),
  decisions: vi.fn(),
  resSearch: vi.fn(),
  conflicts: vi.fn(),
  cancel: vi.fn(),
  zones: vi.fn(),
  supports: vi.fn(),
  blocks: vi.fn(),
  availability: vi.fn(),
  createBlock: vi.fn(),
  removeBlock: vi.fn(),
  usersList: vi.fn(),
  usersGet: vi.fn(),
  usersCreate: vi.fn(),
  usersUpdate: vi.fn(),
  activate: vi.fn(),
  deactivate: vi.fn(),
  setClientValidation: vi.fn(),
  sessions: vi.fn(),
  loginHistory: vi.fn(),
  revokeSessions: vi.fn(),
  resetTwoFactor: vi.fn(),
  requirePasswordChange: vi.fn(),
  audit: vi.fn(),
  logs: vi.fn(),
}));

vi.mock("@/lib/api/endpoints", () => ({
  statisticsApi: {
    views: api.views,
    history: api.history,
    dashboard: api.dashboard,
    exportCsv: api.exportCsv,
  },
  aiApi: {
    dashboard: api.aiDashboard,
    decisions: api.decisions,
    rules: {
      list: api.rulesList,
      create: api.rulesCreate,
      update: api.rulesUpdate,
      remove: api.rulesRemove,
    },
  },
  reservationsApi: { search: api.resSearch, conflicts: api.conflicts, cancel: api.cancel },
  zonesApi: { all: api.zones },
  supportsApi: {
    all: api.supports,
    blocks: api.blocks,
    availability: api.availability,
    createBlock: api.createBlock,
    removeBlock: api.removeBlock,
  },
  adminUsersApi: {
    list: api.usersList,
    get: api.usersGet,
    create: api.usersCreate,
    update: api.usersUpdate,
    activate: api.activate,
    deactivate: api.deactivate,
    setClientValidation: api.setClientValidation,
    sessions: api.sessions,
    loginHistory: api.loginHistory,
    revokeSessions: api.revokeSessions,
    resetTwoFactor: api.resetTwoFactor,
    requirePasswordChange: api.requirePasswordChange,
  },
  auditApi: { list: api.audit },
  diffusionApi: { logs: api.logs },
}));

const nav = vi.hoisted(() => {
  let search = "";
  const listeners = new Set<() => void>();
  const apply = (href: string) => {
    const i = href.indexOf("?");
    search = i >= 0 ? href.slice(i + 1) : "";
    window.history.replaceState(null, "", `/admin${search ? `?${search}` : ""}`);
    listeners.forEach((l) => l());
  };
  return {
    get search() {
      return search;
    },
    reset: (q: string) => apply(`/admin?${q}`),
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    router: { push: vi.fn(apply), replace: vi.fn(apply), back: vi.fn() },
  };
});

vi.mock("next/navigation", async () => {
  const React = await import("react");
  return {
    useSearchParams: () =>
      new URLSearchParams(
        React.useSyncExternalStore(
          nav.subscribe,
          () => nav.search,
          () => nav.search,
        ),
      ),
    usePathname: () => "/admin",
    useRouter: () => nav.router,
  };
});

const session = vi.hoisted((): { role: RoleCode } => ({ role: "ADMINISTRATEUR" }));
vi.mock("@/components/shell/session-provider", () => ({
  useSession: () => ({
    user: { email: "admin@zelqane.local", nom: "Admin", role: session.role, userId: 1, exp: 1 },
    role: session.role,
    isAdmin: session.role === "ADMINISTRATEUR",
    isStaff: true,
    canAct: session.role === "ADMINISTRATEUR",
    loggingOut: false,
    logout: vi.fn(),
  }),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { AiRulesView } from "@/components/admin/ai-rules-view";
import { JournalView } from "@/components/admin/journal-view";
import { ReservationsAdminView } from "@/components/admin/reservations-admin-view";
import { StatisticsView } from "@/components/admin/statistics-view";
import { SupportAvailabilityDialog } from "@/components/admin/support-availability-dialog";
import { UsersView } from "@/components/admin/users-view";

function page<T>(items: T[]): PageResponse<T> {
  return { items, page: 0, size: 20, totalItems: items.length, totalPages: 1 };
}

beforeEach(() => {
  clearResourceCache();
  for (const fn of Object.values(api)) fn.mockReset();
  session.role = "ADMINISTRATEUR";
  nav.reset("");
  api.zones.mockResolvedValue([
    { id: 2, name: "Lac", latitude: 36.8, longitude: 10.2, radiusKm: 3, isActive: true },
  ]);
  api.supports.mockResolvedValue([]);
  api.usersList.mockResolvedValue(page([]));
});

describe("StatisticsView", () => {
  beforeEach(() => {
    api.views.mockImplementation((q: StatisticsViewsQuery) =>
      Promise.resolve({
        from: q.from,
        to: q.to,
        groupBy: q.groupBy,
        rows:
          q.groupBy === "zone"
            ? [{ key: "2", label: "Lac", views: 90, clicks: 9, interactions: 1, cost: 0.7 }]
            : [
                {
                  key: "11",
                  label: "Soldes Lac",
                  views: 120,
                  clicks: 3,
                  interactions: 0,
                  cost: 0.96,
                },
              ],
        totals: { views: 120, clicks: 3, interactions: 0, cost: 0.96 },
      }),
    );
    api.history.mockResolvedValue([]);
    api.aiDashboard.mockResolvedValue({
      totalChecks: 4,
      avgRiskScore: 30,
      avgQualityScore: 60,
      approvedCount: 2,
      reviewRequiredCount: 1,
      rejectedCount: 1,
      adminValidatedCount: 1,
      adminRejectedCount: 1,
      validationRate: 0.5,
      rejectionRate: 0.5,
      overrideCount: 1,
      disagreementCount: 1,
      bySector: [{ sector: "SANTE", count: 2 }],
      topIssues: [{ label: "texte trop court", count: 3 }],
    });
  });

  it("groups views, compares zones, shows the AI dashboard and exports the current table", async () => {
    nav.reset("vue=campaign&periode=7");
    render(<StatisticsView />);
    expect(
      await screen.findByRole("tab", { name: "Par campagne", selected: true }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(api.views).toHaveBeenCalledWith(expect.objectContaining({ groupBy: "campaign" })),
    );
    expect(await screen.findByRole("table", { name: /Affichages — campagne/ })).toHaveTextContent(
      "Soldes Lac",
    );
    expect(screen.getAllByText("2,5 %").length).toBeGreaterThan(0);
    expect(await screen.findByRole("list", { name: "Clics par zone" })).toHaveTextContent("Lac");
    expect(await screen.findByRole("list", { name: "Campagnes par secteur" })).toHaveTextContent(
      "Santé",
    );
    expect(screen.getByRole("list", { name: "Problèmes les plus fréquents" })).toHaveTextContent(
      "texte trop court",
    );

    const exportUser = userEvent.setup();
    await exportUser.click(screen.getByRole("button", { name: "Exporter ce tableau" }));
    await exportUser.click(await screen.findByRole("menuitem", { name: "CSV (tableur)" }));
    await waitFor(() =>
      expect(api.exportCsv).toHaveBeenCalledWith(
        expect.objectContaining({ type: "views", groupBy: "campaign" }),
      ),
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Par zone" }));
    await waitFor(() => expect(new URLSearchParams(nav.search).get("vue")).toBe("zone"));
  });

  it("hides the AI dashboard from opérateurs", async () => {
    session.role = "OPERATEUR";
    render(<StatisticsView />);
    expect(await screen.findByRole("heading", { name: "Affichages" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Tableau de bord IA" })).toBeNull();
    expect(api.aiDashboard).not.toHaveBeenCalled();
  });
});

describe("AiRulesView", () => {
  const rule: AiRuleResponse = {
    id: 4,
    ruleName: "jeux-argent",
    ruleType: "KEYWORD",
    pattern: "casino, jackpot",
    severity: "HIGH",
    sector: null,
    isActive: true,
    description: "Jeux d'argent",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  };

  it("creates a rule with inline server errors, toggles and deletes", async () => {
    api.rulesList.mockResolvedValue([rule]);
    api.rulesCreate
      .mockRejectedValueOnce(new ApiError(409, "Nom pris", { code: "AI_RULE_NAME_TAKEN" }))
      .mockResolvedValueOnce({ ...rule, id: 5, ruleName: "alcool", pattern: "biere" });
    api.rulesUpdate.mockResolvedValue({ ...rule, isActive: false });
    api.rulesRemove.mockResolvedValue(undefined);
    render(<AiRulesView />);

    expect((await screen.findAllByText("jeux-argent")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 règle active sur 1").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Nouvelle règle" }));
    const dialog = await screen.findByRole("dialog", { name: "Nouvelle règle de modération" });
    fireEvent.change(within(dialog).getByLabelText(/^Nom/), { target: { value: "alcool" } });
    fireEvent.change(within(dialog).getByLabelText(/Mots ou expressions/), {
      target: { value: "biere" },
    });
    fireEvent.change(within(dialog).getByLabelText("Tester la règle"), {
      target: { value: "Bière fraîche" },
    });
    expect(within(dialog).getByText(/Règle déclenchée : « biere »/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Créer la règle" }));
    expect(await within(dialog).findByText("Une règle porte déjà ce nom.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Créer la règle" }));
    await waitFor(() => expect(api.rulesCreate).toHaveBeenCalledTimes(2));
    expect(api.rulesCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ruleName: "alcool",
        pattern: "biere",
        ruleType: "KEYWORD",
        isActive: true,
      }),
    );

    fireEvent.click(screen.getAllByRole("checkbox", { name: "Règle « jeux-argent » active" })[0]!);
    await waitFor(() =>
      expect(api.rulesUpdate).toHaveBeenCalledWith(4, expect.objectContaining({ isActive: false })),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Supprimer la règle jeux-argent" })[0]!);
    const confirm = await screen.findByRole("dialog", {
      name: /Supprimer la règle «\sjeux-argent\s»/,
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "Supprimer" }));
    await waitFor(() => expect(api.rulesRemove).toHaveBeenCalledWith(4));
  });

  it("is read-only for superviseurs", async () => {
    session.role = "SUPERVISEUR";
    api.rulesList.mockResolvedValue([rule]);
    render(<AiRulesView />);
    expect((await screen.findAllByText("jeux-argent")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Nouvelle règle" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Règle « jeux-argent »/ })).toBeNull();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
  });
});

describe("ReservationsAdminView", () => {
  const reservation = (over: Partial<ReservationResponse>): ReservationResponse => ({
    id: 31,
    campaignId: 11,
    campaignName: "Soldes Lac",
    campaignStatus: "ACTIVE",
    clientCompanyName: "Café Démo",
    zoneId: 2,
    zoneName: "Lac",
    supportId: 7,
    supportName: "Porteur Lac Nord",
    supportType: "ECRAN",
    startDate: "2026-10-01",
    endDate: "2026-10-05",
    startTime: "08:00:00",
    endTime: "12:00:00",
    availabilityStatus: "OCCUPE",
    reservationStatus: "CONFIRMEE",
    estimatedViews: 480,
    estimatedCost: 3.84,
    createdAt: "2026-09-10T08:00:00Z",
    cancellable: true,
    ...over,
  });

  it("lists, filters and cancels reservations with a reason", async () => {
    api.resSearch.mockResolvedValue(page([reservation({})]));
    api.cancel.mockResolvedValue(
      reservation({
        reservationStatus: "ANNULEE",
        cancelReason: "Porteur déplacé",
        cancellable: false,
      }),
    );
    render(<ReservationsAdminView />);
    expect((await screen.findAllByText("Soldes Lac")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Porteur Lac Nord").length).toBeGreaterThan(0);

    fireEvent.change(screen.getAllByLabelText("Statut")[0]!, { target: { value: "CONFIRMEE" } });
    await waitFor(() =>
      expect(api.resSearch).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: ["CONFIRMEE"], sort: "createdAt,desc" }),
      ),
    );

    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Annuler la réservation #31" }))[0]!,
    );
    const confirm = await screen.findByRole("dialog", {
      name: /^Annuler la réservation #31\s\?$/,
    });
    fireEvent.change(within(confirm).getByLabelText(/Motif/), {
      target: { value: "Porteur déplacé" },
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "Annuler la réservation" }));
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith(31, "Porteur déplacé"));
    expect((await screen.findAllByText("Porteur déplacé")).length).toBeGreaterThan(0);
  });

  it("shows conflicts grouped by Porteur", async () => {
    nav.reset("onglet=conflits");
    api.conflicts.mockResolvedValue([
      {
        supportId: 7,
        supportName: "Porteur Lac Nord",
        zoneId: 2,
        zoneName: "Lac",
        capacity: 1,
        severity: "CONFLIT",
        overlapStartDate: "2026-10-02",
        overlapEndDate: "2026-10-03",
        overlapStartTime: "09:00:00",
        overlapEndTime: "11:00:00",
        reservations: [
          reservation({}),
          reservation({ id: 32, campaignId: 12, campaignName: "Rentrée" }),
        ],
      },
    ]);
    render(<ReservationsAdminView />);
    expect((await screen.findAllByText("Porteur Lac Nord")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Conflit").length).toBeGreaterThan(0);
    expect(screen.getByText(/2 oct\. 2026 → 3 oct\. 2026 · 09:00–11:00/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Rentrée" })).toHaveAttribute(
      "href",
      "/admin/moderation?onglet=toutes&examen=12",
    );
    expect(api.resSearch).not.toHaveBeenCalled();
    expect(screen.getAllByText("1 Porteur en conflit · 0 saturé").length).toBeGreaterThan(0);
  });
});

describe("JournalView", () => {
  it("shows the audit trail with details, then AI decisions with disagreement badges", async () => {
    api.audit.mockResolvedValue(
      page([
        {
          id: 1,
          actorUserId: 1,
          actorEmail: "admin@zelqane.local",
          actorName: "Admin",
          actorRole: "ADMINISTRATEUR",
          action: "CAMPAIGN_VALIDATED_OVERRIDE",
          entityType: "CAMPAIGN",
          entityId: "12",
          summary: "Campagne « Promo » validée par dérogation",
          details: { comment: "ok" },
          ipAddress: "10.0.0.1",
          createdAt: "2026-09-10T08:00:00Z",
        },
      ]),
    );
    api.decisions.mockResolvedValue(
      page([
        {
          id: 20,
          campaignId: 12,
          campaignName: "Promo",
          checkId: 1,
          decisionType: "ADMIN",
          decision: "VALIDATED_OVERRIDE",
          reason: "Offre vérifiée",
          decidedByUserId: 1,
          decidedByName: "Admin",
          riskScore: 45,
          qualityScore: 70,
          preview: false,
          createdAt: "2026-09-10T08:00:00Z",
        },
        {
          id: 19,
          campaignId: 12,
          campaignName: "Promo",
          checkId: 1,
          decisionType: "AI",
          decision: "REVIEW_REQUIRED",
          reason: null,
          decidedByUserId: null,
          decidedByName: null,
          riskScore: 45,
          qualityScore: 70,
          preview: false,
          createdAt: "2026-09-09T08:00:00Z",
        },
      ]),
    );
    render(<JournalView />);
    expect(
      (await screen.findAllByText("Campagne validée par dérogation à l'IA")).length,
    ).toBeGreaterThan(0);
    expect(
      (await screen.findAllByText('{\n  "comment": "ok"\n}', { normalizer: (s) => s })).length,
    ).toBeGreaterThan(0);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Décisions IA" }));
    expect((await screen.findAllByText("Désaccord IA / admin")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Dérogation").length).toBeGreaterThan(0);

    fireEvent.change(screen.getAllByLabelText("Origine")[0]!, { target: { value: "ADMIN" } });
    await waitFor(() =>
      expect(api.decisions).toHaveBeenLastCalledWith(
        expect.objectContaining({ decisionType: "ADMIN" }),
      ),
    );
  });

  it("limits opérateurs to the diffusion journal", async () => {
    session.role = "OPERATEUR";
    api.logs.mockResolvedValue(
      page([
        {
          id: 3,
          supportId: 7,
          supportName: "Porteur Lac Nord",
          zoneId: 2,
          zoneName: "Lac",
          campaignId: null,
          campaignName: null,
          emergencyId: 4,
          contentType: "URGENCE",
          title: "Route coupée",
          mediaUrl: null,
          durationSeconds: 15,
          priority: 1,
          cost: 0,
          clicks: 0,
          interactions: 0,
          diffusedAt: "2026-09-10T08:00:00Z",
          createdAt: "2026-09-10T08:00:00Z",
        },
      ]),
    );
    render(<JournalView />);
    expect((await screen.findAllByText("Route coupée")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("tab", { name: "Audit" })).toBeNull();
    expect(api.audit).not.toHaveBeenCalled();
    expect(api.logs).toHaveBeenCalledWith(expect.objectContaining({ sort: "diffusedAt,desc" }));
  });
});

describe("UsersView", () => {
  const advertiser: AdminUserResponse = {
    userId: 3,
    email: "cafe@demo.tn",
    nom: "Salma Ben Ali",
    role: "ANNONCEUR",
    societe: "Café Démo",
    telephone: null,
    adresse: null,
    logoUrl: null,
    isActive: true,
    lastLoginAt: null,
    createdAt: "2026-09-01T00:00:00Z",
    client: { clientId: 8, companyName: "Café Démo", validationStatus: "PENDING", trustLevel: 50 },
    activeSessions: 1,
    campaignsCount: 2,
    clientNotes: null,
  };

  it("validates an advertiser and creates a staff account", async () => {
    api.usersList.mockResolvedValue(page([advertiser]));
    api.setClientValidation.mockResolvedValue({
      ...advertiser,
      client: { ...advertiser.client!, validationStatus: "VALIDATED", trustLevel: 50 },
    });
    api.usersCreate.mockRejectedValueOnce(
      new ApiError(409, "x", { code: "EMAIL_ALREADY_REGISTERED" }),
    );
    render(<UsersView />);

    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Valider ou suspendre Café Démo" }))[0]!,
    );
    expect(api.usersList).toHaveBeenCalledWith(expect.objectContaining({ role: ["ANNONCEUR"] }));
    expect(screen.getAllByText("En attente de validation").length).toBeGreaterThan(1);
    const dialog = await screen.findByRole("dialog", { name: "Validation de Café Démo" });
    fireEvent.click(within(dialog).getByRole("radio", { name: /Validé/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Enregistrer la décision" }));
    await waitFor(() =>
      expect(api.setClientValidation).toHaveBeenCalledWith(8, {
        validationStatus: "VALIDATED",
        trustLevel: 50,
        notes: null,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Créer un compte d'équipe" }));
    const create = await screen.findByRole("dialog", { name: "Créer un compte d'équipe" });
    fireEvent.change(within(create).getByLabelText(/^Nom/), { target: { value: "Opérateur Sud" } });
    fireEvent.change(within(create).getByLabelText(/Adresse e-mail/), {
      target: { value: "ops@zelqane.com" },
    });
    fireEvent.change(within(create).getByLabelText(/Mot de passe initial/), {
      target: { value: "motdepasse1" },
    });
    fireEvent.click(within(create).getByRole("button", { name: "Créer le compte" }));
    await waitFor(() =>
      expect(api.usersCreate).toHaveBeenCalledWith(
        expect.objectContaining({ email: "ops@zelqane.com", role: "OPERATEUR" }),
      ),
    );
    expect(
      await within(create).findByText("Cette adresse e-mail est déjà utilisée."),
    ).toBeInTheDocument();
  });

  it("shows the security badges and resets 2FA / requires a new password from the detail", async () => {
    const operator: AdminUserResponse = {
      ...advertiser,
      userId: 9,
      email: "ops@zelqane.com",
      nom: "Opérateur Sud",
      role: "OPERATEUR",
      societe: null,
      client: null,
      campaignsCount: 0,
      twoFactorEnabled: true,
      twoFactorRequired: true,
      mustChangePassword: false,
    };
    nav.reset("onglet=equipe&utilisateur=9");
    api.usersList.mockResolvedValue(page([operator]));
    api.usersGet.mockResolvedValue(operator);
    api.sessions.mockResolvedValue([]);
    api.loginHistory.mockResolvedValue([]);
    api.resetTwoFactor.mockResolvedValue({ ...operator, twoFactorEnabled: false });
    api.requirePasswordChange.mockResolvedValue({ ...operator, mustChangePassword: true });
    render(<UsersView />);

    const dialog = await screen.findByRole("dialog", { name: "Opérateur Sud" });
    expect(await within(dialog).findByText("Active (obligatoire)")).toBeInTheDocument();
    expect(screen.getAllByText("2FA active").length).toBeGreaterThan(0);

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Réinitialiser la double authentification" }),
    );
    const confirm = await screen.findByRole("dialog", {
      name: /Réinitialiser la double authentification de Opérateur Sud/,
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "Réinitialiser" }));
    await waitFor(() => expect(api.resetTwoFactor).toHaveBeenCalledWith(9));

    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Exiger un nouveau mot de passe" }),
      ).not.toHaveAttribute("aria-disabled"),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Exiger un nouveau mot de passe" }));
    const confirm2 = await screen.findByRole("dialog", {
      name: /Exiger un nouveau mot de passe de Opérateur Sud/,
    });
    fireEvent.click(within(confirm2).getByRole("button", { name: "Exiger le changement" }));
    await waitFor(() => expect(api.requirePasswordChange).toHaveBeenCalledWith(9));
  });

  it("refuses the page to opérateurs", () => {
    session.role = "OPERATEUR";
    render(<UsersView />);
    expect(
      screen.getByText("Comptes réservés aux administrateurs et superviseurs"),
    ).toBeInTheDocument();
    expect(api.usersList).not.toHaveBeenCalled();
  });
});

describe("SupportAvailabilityDialog", () => {
  const support = {
    id: 7,
    zoneId: 2,
    zoneName: "Lac",
    name: "Porteur Lac Nord",
    supportType: "ECRAN",
    latitude: 36.8,
    longitude: 10.2,
    technicalStatus: "ACTIF",
    diffusionCapacity: 2,
    visibilityScore: 80,
  } satisfies SupportResponse;

  it("shows capacity and the calendar, creates and deletes unavailability blocks", async () => {
    api.blocks.mockResolvedValue([]);
    api.availability.mockResolvedValue([]);
    api.createBlock.mockImplementation((_id: number, body: { startDate: string }) =>
      Promise.resolve([
        {
          id: 90,
          supportId: 7,
          date: body.startDate,
          startTime: "07:00:00",
          endTime: "23:00:00",
          availabilityStatus: "HORS_LIGNE",
          reason: "Coupure",
          createdAt: "2026-09-17T08:00:00Z",
        },
      ]),
    );
    api.removeBlock.mockResolvedValue(undefined);
    render(<SupportAvailabilityDialog support={support} open onOpenChange={vi.fn()} canAct />);

    const dialog = await screen.findByRole("dialog", { name: "Disponibilités · Porteur Lac Nord" });
    expect(within(dialog).getByText("2 campagnes simultanées")).toBeInTheDocument();
    expect(within(dialog).getByText("80 / 100")).toBeInTheDocument();
    expect((await within(dialog).findAllByText("Disponible toute la journée")).length).toBe(14);

    fireEvent.click(within(dialog).getByRole("button", { name: "Ajouter une indisponibilité" }));
    const form = within(dialog).getByRole("form", { name: "Nouvelle indisponibilité" });
    fireEvent.change(within(form).getByLabelText(/Motif/), { target: { value: "HORS_LIGNE" } });
    fireEvent.change(within(form).getByLabelText(/Précision/), { target: { value: "Coupure" } });
    fireEvent.click(within(form).getByRole("button", { name: "Enregistrer l'indisponibilité" }));
    await waitFor(() =>
      expect(api.createBlock).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          availabilityStatus: "HORS_LIGNE",
          startTime: "07:00:00",
          reason: "Coupure",
        }),
      ),
    );
    const remove = await within(dialog).findByRole("button", {
      name: /Supprimer l'indisponibilité/,
    });
    fireEvent.click(remove);
    await waitFor(() => expect(api.removeBlock).toHaveBeenCalledWith(7, 90));
  });

  it("is read-only without the administrator role", async () => {
    api.blocks.mockResolvedValue([]);
    api.availability.mockResolvedValue([]);
    render(
      <SupportAvailabilityDialog support={support} open onOpenChange={vi.fn()} canAct={false} />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Disponibilités · Porteur Lac Nord" });
    await within(dialog).findAllByText("Disponible toute la journée");
    expect(
      within(dialog).queryByRole("button", { name: "Ajouter une indisponibilité" }),
    ).toBeNull();
  });
});
