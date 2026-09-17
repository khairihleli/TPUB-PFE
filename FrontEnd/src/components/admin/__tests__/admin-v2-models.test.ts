import { describe, expect, it } from "vitest";

import {
  filterRules,
  keywordList,
  regexError,
  ruleFormFrom,
  ruleRequestFrom,
  ruleSchema,
  ruleServerErrors,
  rulesSummary,
  testRule,
} from "@/components/admin/ai-rules-model";
import {
  auditQuery,
  decisionFlags,
  decisionsQuery,
  diffusionsQuery,
  type JournalFilterState,
  journalFilterCount,
  journalTabsFor,
  prettyDetails,
} from "@/components/admin/journal-model";
import {
  cancelReasonError,
  conflictsSummary,
  groupConflicts,
  reservationFilterCount,
  reservationSearchQuery,
  windowLabel,
} from "@/components/admin/reservations-admin-model";
import {
  aiSummaryFigures,
  aiVerdictBreakdown,
  formatRate,
  linePoints,
  niceCeil,
  periodRange,
  topRows,
} from "@/components/admin/stats-model";
import {
  blockSchema,
  buildCalendar,
  calendarSummary,
  clampBlockEnd,
  daysInclusive,
  emptyBlockForm,
} from "@/components/admin/support-blocks-model";
import {
  accountServerErrors,
  accountTitle,
  clientValidationBody,
  deactivationBlocker,
  deviceLabel,
  emptyStaffForm,
  passwordChangeBlocker,
  securityBadges,
  staffCreateSchema,
  staffUpdateSchema,
  twoFactorResetBlocker,
  usersQuery,
} from "@/components/admin/users-model";
import { ApiError } from "@/lib/api/errors";
import type {
  AdminUserResponse,
  AiDashboardResponse,
  AiDecisionLogResponse,
  AiRuleResponse,
  ReservationConflict,
  ReservationResponse,
} from "@/lib/api/types";

describe("support blocks (indisponibilités)", () => {
  const today = "2026-09-17";

  it("validates the window, the 92-day limit and past dates", () => {
    const ok = blockSchema(today).safeParse({
      ...emptyBlockForm(today),
      endDate: "2026-09-19",
      reason: " Dalle LED ",
    });
    expect(ok.success && ok.data).toEqual({
      startDate: "2026-09-17",
      endDate: "2026-09-19",
      startTime: "07:00:00",
      endTime: "23:00:00",
      availabilityStatus: "MAINTENANCE",
      reason: "Dalle LED",
    });
    const bad = blockSchema(today).safeParse({
      ...emptyBlockForm(today),
      startDate: "2026-09-16",
      endDate: "2026-12-31",
      startTime: "10:00",
      endTime: "09:00",
    });
    expect(bad.success).toBe(false);
    const paths = bad.error?.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["startDate", "endDate", "endTime"]));
    expect(daysInclusive("2026-09-01", "2026-09-03")).toBe(3);
    expect(clampBlockEnd("2026-09-01", "2027-01-01")).toBe("2026-12-01");
  });

  it("merges blocks and reservation slots day by day", () => {
    const days = buildCalendar(
      "2026-09-17",
      3,
      [
        {
          id: 5,
          supportId: 1,
          date: "2026-09-18",
          startTime: "14:00:00",
          endTime: "18:00:00",
          availabilityStatus: "MAINTENANCE",
          reason: "Nettoyage",
          createdAt: "2026-09-10T08:00:00Z",
        },
      ],
      [
        {
          kind: "RESERVATION",
          startDate: "2026-09-17",
          endDate: "2026-09-18",
          startTime: "08:00:00",
          endTime: "12:00:00",
          reservationStatus: "CONFIRMEE",
        },
        {
          kind: "BLOCAGE",
          startDate: "2026-09-18",
          endDate: "2026-09-18",
          startTime: "14:00:00",
          endTime: "18:00:00",
          reservationStatus: null,
        },
      ],
    );
    expect(days.map((d) => d.date)).toEqual(["2026-09-17", "2026-09-18", "2026-09-19"]);
    expect(days[1]?.entries.map((e) => [e.kind, e.startTime, e.blockId])).toEqual([
      ["RESERVATION", "08:00:00", null],
      ["BLOCAGE", "14:00:00", 5],
    ]);
    expect(days[1]?.entries[0]?.label).toBe("Créneau confirmé");
    expect(days[2]?.entries).toEqual([]);
    expect(calendarSummary(days)).toBe("1 indisponibilité · 2 jours avec réservation");
  });
});

describe("AI rules", () => {
  it("validates keywords and regex, and maps server conflicts", () => {
    const parsed = ruleSchema.safeParse({
      ...ruleFormFrom(null),
      ruleName: " jeux-argent ",
      pattern: "casino, paris sportifs",
      severity: "HIGH",
      description: "",
    });
    expect(parsed.success && parsed.data).toEqual({
      ruleName: "jeux-argent",
      ruleType: "KEYWORD",
      pattern: "casino, paris sportifs",
      severity: "HIGH",
      sector: null,
      isActive: true,
      description: null,
    });
    expect(
      ruleSchema.safeParse({
        ...ruleFormFrom(null),
        ruleName: "x",
        ruleType: "REGEX",
        pattern: "(",
      }).success,
    ).toBe(false);
    expect(
      ruleSchema.safeParse({ ...ruleFormFrom(null), ruleName: "x", pattern: " , , " }).success,
    ).toBe(false);
    expect(regexError("\\b(rib|iban)\\b")).toBeNull();
    expect(ruleServerErrors(new ApiError(409, "x", { code: "AI_RULE_NAME_TAKEN" }))).toHaveProperty(
      "ruleName",
    );
    expect(ruleServerErrors(new ApiError(400, "x", { code: "INVALID_REGEX" }))).toHaveProperty(
      "pattern",
    );
    expect(ruleServerErrors(new Error("x"))).toEqual({});
  });

  it("tests a rule like the backend: normalised text, whole words", () => {
    expect(keywordList("Guérison, 100% garanti ,, ")).toEqual(["guerison", "100% garanti"]);
    const keyword = { ruleType: "KEYWORD" as const, pattern: "gratuit, garanti" };
    expect(testRule(keyword, "Livraison GRATUITE et 100 % garanti !")).toEqual(["garanti"]);
    expect(testRule(keyword, "Café gratuit ce soir")).toEqual(["gratuit"]);
    expect(
      testRule({ ruleType: "REGEX", pattern: "\\b(rib|iban)\\b" }, "Envoyez votre RIB"),
    ).toEqual(["rib"]);
    expect(testRule({ ruleType: "REGEX", pattern: "(" }, "texte")).toEqual([]);
  });

  it("filters, sorts and summarises rules", () => {
    const rule = (over: Partial<AiRuleResponse>): AiRuleResponse => ({
      id: 1,
      ruleName: "r",
      ruleType: "KEYWORD",
      pattern: "a",
      severity: "LOW",
      sector: null,
      isActive: true,
      description: null,
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
      ...over,
    });
    const rules = [
      rule({ id: 1, ruleName: "b-low" }),
      rule({
        id: 2,
        ruleName: "a-critique",
        severity: "CRITICAL",
        description: "Armes et drogues",
      }),
      rule({ id: 3, ruleName: "inactive", isActive: false, severity: "CRITICAL" }),
    ];
    expect(
      filterRules(rules, { q: "", type: "", severity: "", active: "" }).map((r) => r.id),
    ).toEqual([2, 1, 3]);
    expect(
      filterRules(rules, { q: "drogue", type: "", severity: "", active: "" }).map((r) => r.id),
    ).toEqual([2]);
    expect(
      filterRules(rules, { q: "", type: "", severity: "", active: "inactives" }).map((r) => r.id),
    ).toEqual([3]);
    expect(rulesSummary(rules)).toBe("2 règles actives sur 3");
    expect(ruleRequestFrom(rules[2] as AiRuleResponse, { isActive: true })).toMatchObject({
      ruleName: "inactive",
      isActive: true,
      severity: "CRITICAL",
    });
  });
});

describe("back-office reservations", () => {
  const r = (over: Partial<ReservationResponse>): ReservationResponse => ({
    id: 1,
    campaignId: 10,
    zoneId: 2,
    supportId: 9,
    startDate: "2026-10-01",
    endDate: "2026-10-03",
    startTime: "08:00:00",
    endTime: "12:00:00",
    availabilityStatus: "RESERVE",
    reservationStatus: "TEMPORAIRE",
    estimatedViews: 100,
    estimatedCost: 1,
    ...over,
  });

  it("builds the search query and counts filters", () => {
    const state = {
      status: "CONFIRMEE" as const,
      zoneId: 2,
      supportId: null,
      campaignId: null,
      clientId: 5,
      from: "",
      to: "2026-10-31",
      page: 1,
    };
    expect(reservationSearchQuery(state)).toEqual({
      status: ["CONFIRMEE"],
      zoneId: 2,
      supportId: undefined,
      campaignId: undefined,
      clientId: 5,
      from: "2026-10-31",
      to: "2026-10-31",
      sort: "createdAt,desc",
      page: 1,
      size: 20,
    });
    expect(reservationFilterCount(state)).toBe(4);
    expect(cancelReasonError("x".repeat(256))).toBe("255 caractères maximum.");
    expect(cancelReasonError("")).toBeNull();
    expect(windowLabel(r({}))).toBe("1 oct. 2026 → 3 oct. 2026 · 08:00–12:00");
  });

  it("groups conflicts per Porteur, CONFLIT first", () => {
    const conflict = (over: Partial<ReservationConflict>): ReservationConflict => ({
      supportId: 9,
      supportName: "Porteur Lac",
      zoneId: 2,
      zoneName: "Lac",
      capacity: 1,
      severity: "SATURE",
      overlapStartDate: "2026-10-01",
      overlapEndDate: "2026-10-02",
      overlapStartTime: "08:00:00",
      overlapEndTime: "12:00:00",
      reservations: [r({ id: 1 })],
      ...over,
    });
    const groups = groupConflicts([
      conflict({
        supportId: 3,
        supportName: "Aéroport",
        reservations: [r({ id: 7, campaignId: 70 })],
      }),
      conflict({ reservations: [r({ id: 1 }), r({ id: 2, campaignId: 11 })] }),
      conflict({
        severity: "CONFLIT",
        reservations: [r({ id: 2, campaignId: 11 }), r({ id: 3, campaignId: 12 })],
      }),
    ]);
    expect(groups.map((g) => [g.supportName, g.severity])).toEqual([
      ["Porteur Lac", "CONFLIT"],
      ["Aéroport", "SATURE"],
    ]);
    expect(groups[0]?.reservations.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(groups[0]?.campaignIds).toEqual([10, 11, 12]);
    expect(conflictsSummary(groups)).toBe("1 Porteur en conflit · 1 saturé");
  });
});

describe("journal", () => {
  const empty: JournalFilterState = {
    action: null,
    entity: null,
    entityId: "",
    actorId: null,
    decisionType: null,
    decision: null,
    campaignId: null,
    supportId: null,
    zoneId: null,
    contentType: null,
    from: "",
    to: "",
    page: 0,
  };

  it("maps filters to the three journals and limits opérateurs to diffusions", () => {
    const s = {
      ...empty,
      action: "CAMPAIGN_REJECTED" as const,
      entityId: " 12 ",
      from: "2026-09-01",
      page: 3,
    };
    expect(auditQuery(s)).toEqual({
      action: ["CAMPAIGN_REJECTED"],
      entityType: undefined,
      entityId: "12",
      actorId: undefined,
      from: "2026-09-01",
      to: "2026-09-01",
      sort: "createdAt,desc",
      page: 3,
      size: 25,
    });
    expect(decisionsQuery({ ...empty, decisionType: "ADMIN", campaignId: 4 })).toMatchObject({
      decisionType: "ADMIN",
      campaignId: 4,
      sort: "createdAt,desc",
    });
    expect(diffusionsQuery({ ...empty, contentType: "URGENCE", supportId: 2 })).toMatchObject({
      contentType: ["URGENCE"],
      supportId: 2,
      sort: "diffusedAt,desc",
    });
    expect(journalFilterCount("audit", s)).toBe(3);
    expect(journalFilterCount("diffusions", s)).toBe(1);
    expect(journalTabsFor("OPERATEUR")).toEqual(["diffusions"]);
    expect(journalTabsFor("SUPERVISEUR")).toEqual(["audit", "decisions-ia", "diffusions"]);
    expect(prettyDetails({ reason: "x" })).toBe('{\n  "reason": "x"\n}');
    expect(prettyDetails({})).toBeNull();
  });

  it("flags overrides and AI / admin disagreements", () => {
    const row = (over: Partial<AiDecisionLogResponse>): AiDecisionLogResponse => ({
      id: 1,
      campaignId: 1,
      campaignName: "C",
      checkId: 1,
      decisionType: "AI",
      decision: "APPROVED",
      reason: null,
      decidedByUserId: null,
      decidedByName: null,
      riskScore: 10,
      qualityScore: 80,
      preview: false,
      createdAt: "2026-09-01T10:00:00Z",
      ...over,
    });
    const flags = decisionFlags([
      row({
        id: 4,
        decisionType: "ADMIN",
        decision: "REJECTED",
        createdAt: "2026-09-01T12:00:00Z",
      }),
      row({ id: 3, createdAt: "2026-09-01T11:00:00Z" }),
      row({ id: 5, campaignId: 2, decision: "REVIEW_REQUIRED" }),
      row({
        id: 6,
        campaignId: 2,
        decisionType: "ADMIN",
        decision: "VALIDATED_OVERRIDE",
        createdAt: "2026-09-02T10:00:00Z",
      }),
      row({ id: 7, campaignId: 3, decisionType: "ADMIN", decision: "VALIDATED" }),
      row({ id: 8, campaignId: 4, decision: "REJECTED", preview: true }),
      row({
        id: 9,
        campaignId: 4,
        decisionType: "ADMIN",
        decision: "VALIDATED",
        createdAt: "2026-09-03T10:00:00Z",
      }),
    ]);
    expect(flags.get(4)).toEqual(["disagreement"]);
    expect(flags.get(6)).toEqual(["override", "disagreement"]);
    expect(flags.get(7)).toEqual([]);
    // A preview check is not the AI verdict.
    expect(flags.get(9)).toEqual([]);
  });
});

describe("accounts administration", () => {
  const account = (over: Partial<AdminUserResponse>): AdminUserResponse => ({
    userId: 3,
    email: "a@b.tn",
    nom: "Salma Ben Ali",
    role: "ANNONCEUR",
    societe: null,
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
    ...over,
  });

  it("builds list queries per tab", () => {
    expect(
      usersQuery({
        tab: "annonceurs",
        q: " cafe ",
        active: "inactifs",
        validation: "PENDING",
        page: 0,
      }),
    ).toEqual({
      q: "cafe",
      role: ["ANNONCEUR"],
      active: false,
      validationStatus: ["PENDING"],
      sort: "createdAt,desc",
      page: 0,
      size: 20,
    });
    expect(
      usersQuery({ tab: "equipe", q: "", active: "", validation: "PENDING", page: 1 }),
    ).toMatchObject({
      role: ["ADMINISTRATEUR", "OPERATEUR", "SUPERVISEUR"],
      active: undefined,
      validationStatus: undefined,
    });
  });

  it("validates staff accounts and maps backend codes", () => {
    const ok = staffCreateSchema.safeParse({
      ...emptyStaffForm(),
      email: " Ops@TPUB.tn ",
      password: "motdepasse1",
      nom: "Opérateur Sud",
      role: "OPERATEUR",
      telephone: "+216 71 000 000",
    });
    expect(ok.success && ok.data).toEqual({
      email: "ops@tpub.tn",
      password: "motdepasse1",
      nom: "Opérateur Sud",
      role: "OPERATEUR",
      societe: null,
      telephone: "+216 71 000 000",
    });
    const bad = staffCreateSchema.safeParse({
      ...emptyStaffForm(),
      email: "x",
      password: "courtmdp",
      nom: "",
    });
    expect(bad.error?.issues.map((i) => i.path[0])).toEqual(
      expect.arrayContaining(["email", "password", "nom"]),
    );
    const selfUpdate = staffUpdateSchema(false).safeParse({
      nom: "A",
      societe: "",
      telephone: "",
      adresse: "",
      role: "ADMINISTRATEUR",
    });
    expect(selfUpdate.success && selfUpdate.data).toEqual({
      nom: "A",
      societe: null,
      telephone: null,
      adresse: null,
    });
    expect(
      staffUpdateSchema(true).safeParse({
        nom: "A",
        societe: "",
        telephone: "",
        adresse: "",
        role: "SUPERVISEUR",
      }).data,
    ).toMatchObject({ role: "SUPERVISEUR" });
    expect(
      accountServerErrors(new ApiError(409, "x", { code: "EMAIL_ALREADY_REGISTERED" })),
    ).toHaveProperty("email");
  });

  it("builds the advertiser validation body and small labels", () => {
    expect(
      clientValidationBody({ validationStatus: "SUSPENDED", trustLevel: 20, notes: "  " }),
    ).toEqual({
      validationStatus: "SUSPENDED",
      trustLevel: 20,
      notes: null,
    });
    expect(
      clientValidationBody({ validationStatus: "VALIDATED", trustLevel: 120, notes: "" }),
    ).toEqual({
      error: "Niveau de confiance entier de 0 à 100.",
    });
    expect(accountTitle(account({}))).toBe("Café Démo");
    expect(accountTitle(account({ client: null, societe: null }))).toBe("Salma Ben Ali");
    expect(deactivationBlocker(account({ userId: 1 }), 1)).toBe(
      "Vous ne pouvez pas désactiver votre propre compte.",
    );
    expect(deactivationBlocker(account({ userId: 1, isActive: false }), 1)).toBeNull();
    expect(
      deviceLabel(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Safari/537.36",
      ),
    ).toBe("Chrome · Windows");
    expect(deviceLabel(null)).toBe("Appareil inconnu");
  });
});

describe("statistics model", () => {
  it("computes periods, scales and rates", () => {
    expect(periodRange("7", "2026-09-17")).toEqual({ from: "2026-09-11", to: "2026-09-17" });
    expect(periodRange("custom", "2026-09-17", { from: "2026-09-20", to: "2026-09-01" })).toEqual({
      from: "2026-08-19",
      to: "2026-09-17",
    });
    expect(niceCeil(87)).toBe(100);
    expect(niceCeil(0)).toBe(1);
    expect(formatRate(3, 120)).toBe("2,5 %");
    expect(formatRate(1, 0)).toBe("—");
    expect(linePoints([0, 50, 100], 100, 200, 100)).toBe("0,100 100,50 200,0");
    expect(
      topRows(
        [
          { key: "1", label: "a", views: 1, clicks: 0, interactions: 0, cost: 0 },
          { key: "2", label: "b", views: 9, clicks: 0, interactions: 0, cost: 0 },
        ],
        1,
      ).map((r) => r.key),
    ).toEqual(["2"]);
  });

  it("presents the AI dashboard without inventing rates", () => {
    const d: AiDashboardResponse = {
      totalChecks: 12,
      avgRiskScore: 23.46,
      avgQualityScore: 71,
      approvedCount: 7,
      reviewRequiredCount: 3,
      rejectedCount: 2,
      adminValidatedCount: 0,
      adminRejectedCount: 0,
      validationRate: 0,
      rejectionRate: 0,
      overrideCount: 0,
      disagreementCount: 0,
      bySector: [],
      topIssues: [],
    };
    const figures = aiSummaryFigures(d);
    expect(figures.find((f) => f.key === "risk")?.value).toBe("23,5 / 100");
    expect(figures.find((f) => f.key === "validation")?.value).toBe("—");
    expect(
      aiSummaryFigures({
        ...d,
        adminValidatedCount: 3,
        adminRejectedCount: 1,
        validationRate: 0.75,
      }).find((f) => f.key === "validation")?.value,
    ).toBe("75 %");
    expect(aiVerdictBreakdown(d)).toBe("7 favorables · 3 revues manuelles · 2 à corriger");
  });
});

describe("users model — round 2 account security", () => {
  it("shows the 2FA and forced password change badges", () => {
    expect(securityBadges({ twoFactorEnabled: false, mustChangePassword: false })).toEqual([]);
    expect(securityBadges({}).length).toBe(0);
    expect(
      securityBadges({ twoFactorEnabled: true, mustChangePassword: true }).map((b) => b.label),
    ).toEqual(["2FA active", "Changement de mot de passe requis"]);
  });

  it("never allows the security actions on one's own account", () => {
    expect(twoFactorResetBlocker({ userId: 1, twoFactorEnabled: true }, 1)).toMatch(/Mon compte/);
    expect(twoFactorResetBlocker({ userId: 2, twoFactorEnabled: false }, 1)).toBe(
      "La double authentification n'est pas active.",
    );
    expect(twoFactorResetBlocker({ userId: 2, twoFactorEnabled: true }, 1)).toBeNull();
    expect(passwordChangeBlocker({ userId: 1, mustChangePassword: false }, 1)).toMatch(
      /Mon compte/,
    );
    expect(passwordChangeBlocker({ userId: 2, mustChangePassword: true }, 1)).toBe(
      "Un nouveau mot de passe est déjà exigé.",
    );
    expect(passwordChangeBlocker({ userId: 2, mustChangePassword: false }, 1)).toBeNull();
  });
});
