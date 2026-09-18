import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import type {
  CampaignResponse,
  CampaignSearchFilters,
  PageResponse,
  RoleCode,
} from "@/lib/api/types";
import { clearResourceCache } from "@/lib/resource-cache";

const api = vi.hoisted(() => ({
  search: vi.fn(),
  get: vi.fn(),
  report: vi.fn(),
  checkContent: vi.fn(),
  decisions: vi.fn(),
  byCampaign: vi.fn(),
  estimate: vi.fn(),
  media: vi.fn(),
  supports: vi.fn(),
  zones: vi.fn(),
  dashboard: vi.fn(),
  validate: vi.fn(),
  reject: vi.fn(),
  setPriority: vi.fn(),
}));

vi.mock("@/lib/api/endpoints", () => ({
  campaignsApi: { search: api.search, get: api.get },
  aiApi: { report: api.report, checkContent: api.checkContent, decisions: api.decisions },
  reservationsApi: { byCampaign: api.byCampaign },
  estimatesApi: { campaign: api.estimate },
  mediaApi: { list: api.media },
  supportsApi: { all: api.supports },
  zonesApi: { all: api.zones },
  statisticsApi: { dashboard: api.dashboard },
  adminApi: { validate: api.validate, reject: api.reject, setPriority: api.setPriority },
}));

vi.mock("@/lib/api/endpoints-supervision", () => ({
  approvalsApi: {
    validateCampaign: async (id: number, body: unknown) => ({
      kind: "validated" as const,
      campaign: await (api.validate(id, body) as Promise<unknown>),
    }),
    campaign: () => Promise.resolve({ campaignId: 0, required: false, reasons: [], riskScore: null,
      riskThreshold: 50, approvalsRequired: 1, approvalsRequiredConfigured: 1, approvals: [],
      cycleKey: null, canApprove: true }),
  },
}));

vi.mock("@/components/map", () => ({
  NetworkMap: ({ ariaLabel }: { ariaLabel?: string }) => <div role="img" aria-label={ariaLabel} />,
}));

/** Reactive in-memory router: push/replace/back update the query string and re-render. */
const nav = vi.hoisted(() => {
  const PATH = "/admin/moderation";
  let search = "";
  const listeners = new Set<() => void>();
  const stack: string[] = [];
  const apply = (href: string) => {
    const i = href.indexOf("?");
    search = i >= 0 ? href.slice(i + 1) : "";
    window.history.replaceState(null, "", `${PATH}${search ? `?${search}` : ""}`);
    listeners.forEach((l) => l());
  };
  return {
    PATH,
    get search() {
      return search;
    },
    reset(initial: string) {
      stack.length = 0;
      stack.push(`${PATH}${initial ? `?${initial}` : ""}`);
      apply(stack[0]!);
    },
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    router: {
      push: vi.fn((href: string) => {
        stack.push(href);
        apply(href);
      }),
      replace: vi.fn((href: string) => {
        stack[stack.length - 1] = href;
        apply(href);
      }),
      back: vi.fn(() => {
        if (stack.length > 1) stack.pop();
        apply(stack[stack.length - 1] ?? PATH);
      }),
    },
  };
});

vi.mock("next/navigation", async () => {
  const React = await import("react");
  return {
    useSearchParams: () => {
      const s = React.useSyncExternalStore(
        nav.subscribe,
        () => nav.search,
        () => nav.search,
      );
      return new URLSearchParams(s);
    },
    usePathname: () => nav.PATH,
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

import { ModerationView } from "@/components/admin/moderation-view";

function campaign(over: Partial<CampaignResponse>): CampaignResponse {
  return {
    id: 2,
    clientId: 14,
    clientCompanyName: "Café Démo",
    clientValidationStatus: "PENDING",
    name: "Promo gratuite",
    objective: "Tout est gratuit",
    budget: 1500,
    consumedBudget: 0,
    status: "REVIEW_REQUIRED",
    aiStatus: "REVIEW_REQUIRED",
    adminStatus: null,
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    startTime: "08:00:00",
    endTime: "22:00:00",
    estimatedViews: 1000,
    priorityScore: 0,
    reservationsCount: 1,
    zones: [],
    createdAt: "2026-09-02T07:00:00Z",
    submittedAt: "2026-09-02T08:00:00Z",
    validatedAt: null,
    ...over,
  };
}

function page<T>(items: T[]): PageResponse<T> {
  return { items, page: 0, size: 20, totalItems: items.length, totalPages: 1 };
}

const review = campaign({});
const approvedA = campaign({
  id: 5,
  name: "Soldes Lac",
  status: "APPROVED_BY_AI",
  aiStatus: "APPROVED",
  submittedAt: "2026-09-01T08:00:00Z",
});
const approvedB = campaign({
  id: 6,
  name: "Rentrée Marsa",
  status: "APPROVED_BY_AI",
  aiStatus: "APPROVED",
  submittedAt: "2026-09-03T08:00:00Z",
});
let catalogue: CampaignResponse[] = [];

beforeEach(() => {
  clearResourceCache();
  for (const fn of Object.values(api)) fn.mockReset();
  nav.router.push.mockClear();
  nav.router.replace.mockClear();
  nav.router.back.mockClear();
  nav.reset("");
  session.role = "ADMINISTRATEUR";
  catalogue = [review];
  api.search.mockImplementation((f: CampaignSearchFilters) =>
    Promise.resolve(
      page(catalogue.filter((c) => !f.status || (f.status as string[]).includes(c.status))),
    ),
  );
  api.report.mockResolvedValue({
    campaignId: 2,
    aiStatus: "REVIEW_REQUIRED",
    riskScore: 62,
    qualityScore: 74,
    detectedIssues: ["texte ambigu"],
    issues: [
      { label: "promesse « gratuit » non justifiée", severity: "MEDIUM", source: "REGLE" },
      { label: "texte dans l'image : GRATUIT", severity: "MEDIUM", source: "OCR" },
    ],
    matchedRules: [{ ruleId: 1, ruleName: "promesse-gratuit-garanti", severity: "MEDIUM" }],
    extractedText: "GRATUIT",
    ocrEngine: "SIMULE",
    recommendations: ["Justifiez l'offre gratuite"],
    recommendation: "Vérification manuelle avant diffusion",
    sector: "COMMERCE",
    mediaAnalyses: [],
  });
  api.decisions.mockResolvedValue(page([]));
  api.byCampaign.mockResolvedValue([]);
  api.estimate.mockResolvedValue(null);
  api.media.mockResolvedValue([
    {
      id: 1,
      campaignId: 2,
      fileName: "gratuit.jpg",
      fileType: "IMAGE",
      mimeType: "image/jpeg",
      fileSizeBytes: 50_000,
      durationSeconds: null,
      widthPx: 1280,
      heightPx: 720,
      url: "/uploads/campaigns/2/a.jpg",
      checksum: "x",
      sortOrder: 0,
      createdAt: "2026-09-01T00:00:00Z",
    },
  ]);
  api.supports.mockResolvedValue([]);
  api.zones.mockResolvedValue([
    { id: 3, name: "Lac", latitude: 36.8, longitude: 10.2, radiusKm: 3, isActive: true },
  ]);
  api.dashboard.mockResolvedValue({
    totalCampaigns: 9,
    activeCampaigns: 1,
    pendingCampaigns: 3,
    aiPendingCampaigns: 0,
    aiRejectedCampaigns: 0,
    availableSupports: 1,
    confirmedReservations: 1,
    totalViews: 0,
    estimatedBudget: 0,
    consumedBudget: 0,
    approvedByAiCampaigns: 2,
    reviewRequiredCampaigns: 1,
  });
});

function params(): URLSearchParams {
  return new URLSearchParams(nav.search);
}

async function openFirstReview(name: RegExp | string = /Examiner la campagne/) {
  fireEvent.click((await screen.findAllByRole("button", { name }))[0]!);
}

describe("ModerationView — AI report and decisions", () => {
  it("shows the full AI report, media and requires the logged override for REVIEW_REQUIRED", async () => {
    api.validate.mockResolvedValue({
      ...review,
      status: "ACTIVE",
      adminStatus: "VALIDATED",
      aiOverride: true,
    });
    render(<ModerationView />);

    await openFirstReview();
    const dialog = await screen.findByRole("dialog", { name: "Promo gratuite" });
    expect(within(dialog).getAllByText("Café Démo").length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/Annonceur : en attente de validation/)).toBeInTheDocument();
    expect(
      await within(dialog).findByText("promesse « gratuit » non justifiée"),
    ).toBeInTheDocument();
    expect(within(dialog).getAllByText("Texte dans l'image").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("OCR simulé")).toBeInTheDocument();
    expect(within(dialog).getByText("promesse-gratuit-garanti")).toBeInTheDocument();
    expect(within(dialog).getByText("Justifiez l'offre gratuite")).toBeInTheDocument();
    expect(within(dialog).getByText("Secteur : Commerce")).toBeInTheDocument();
    expect(await within(dialog).findByRole("img", { name: "Visuel gratuit.jpg" })).toHaveAttribute(
      "src",
      "/uploads/campaigns/2/a.jpg",
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "Valider…" }));
    const confirm = within(dialog).getByRole("button", { name: "Valider par dérogation" });
    expect(within(dialog).getByText("L'IA demande une revue manuelle")).toBeInTheDocument();
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(confirm);
    expect(api.validate).not.toHaveBeenCalled();

    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: /Je valide malgré l'avis de l'IA/ }),
    );
    fireEvent.change(within(dialog).getByLabelText(/Commentaire/), {
      target: { value: "Offre vérifiée" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Priorité \(0–10\)/), {
      target: { value: "8" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Valider par dérogation" }));
    await waitFor(() =>
      expect(api.validate).toHaveBeenCalledWith(2, {
        overrideAi: true,
        comment: "Offre vérifiée",
        priorityScore: 8,
      }),
    );
    expect(api.validate).toHaveBeenCalledTimes(1);
  });

  it("refuses with a reason of at least 3 characters", async () => {
    api.reject.mockResolvedValue({
      ...review,
      status: "BLOCKED",
      adminStatus: "REJECTED",
      rejectionReason: "Offre trompeuse",
    });
    render(<ModerationView />);
    await openFirstReview();
    const dialog = await screen.findByRole("dialog", { name: "Promo gratuite" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Refuser" }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const button = within(dialog).getByRole("button", { name: "Refuser la campagne" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    fireEvent.change(within(dialog).getByLabelText(/Motif du refus/), { target: { value: "ok" } });
    expect(within(dialog).getAllByText("Au moins 3 caractères.").length).toBeGreaterThan(0);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Allégation « gratuit » non justifiée" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Refuser la campagne" }));
    await waitFor(() =>
      expect(api.reject).toHaveBeenCalledWith(2, "ok ; Allégation « gratuit » non justifiée"),
    );
    expect(await within(dialog).findByText("Campagne refusée")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Le motif s'affiche dans l'espace de l'annonceur/),
    ).toBeInTheDocument();
  });

  it("offers « Bloquer la diffusion » and the priority editor on an active campaign", async () => {
    const live = campaign({
      id: 9,
      name: "En diffusion",
      status: "ACTIVE",
      aiStatus: "APPROVED",
      adminStatus: "VALIDATED",
      priorityScore: 4,
    });
    catalogue = [live];
    api.setPriority.mockResolvedValue({ ...live, priorityScore: 9 });
    api.reject.mockResolvedValue({ ...live, status: "BLOCKED" });
    nav.reset("onglet=toutes&examen=9");
    render(<ModerationView />);
    const dialog = await screen.findByRole("dialog", { name: "En diffusion" });
    expect(within(dialog).queryByRole("button", { name: "Valider…" })).toBeNull();

    fireEvent.change(within(dialog).getByLabelText(/Priorité de diffusion/), {
      target: { value: "9" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Enregistrer la priorité" }));
    await waitFor(() => expect(api.setPriority).toHaveBeenCalledWith(9, 9));

    fireEvent.click(within(dialog).getByRole("button", { name: "Bloquer la diffusion" }));
    expect(within(dialog).getByText(/retire immédiatement des écrans/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/Motif du blocage/), {
      target: { value: "Plainte fondée" },
    });
    fireEvent.click(
      within(dialog).getAllByRole("button", { name: "Bloquer la diffusion" }).at(-1)!,
    );
    await waitFor(() => expect(api.reject).toHaveBeenCalledWith(9, "Plainte fondée"));
  });

  it("re-runs the AI analysis as administrator", async () => {
    api.checkContent.mockResolvedValue({
      campaignId: 2,
      aiStatus: "APPROVED",
      riskScore: 10,
      qualityScore: 90,
      detectedIssues: [],
      recommendation: "Contenu conforme pour diffusion",
    });
    api.get.mockResolvedValue({ ...review, status: "APPROVED_BY_AI", aiStatus: "APPROVED" });
    render(<ModerationView />);
    await openFirstReview();
    const dialog = await screen.findByRole("dialog", { name: "Promo gratuite" });
    fireEvent.click(await within(dialog).findByRole("button", { name: "Relancer l'analyse IA" }));
    await waitFor(() => expect(api.checkContent).toHaveBeenCalledWith(2));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(2));
  });

  it("is read-only for a superviseur", async () => {
    session.role = "SUPERVISEUR";
    render(<ModerationView />);
    expect(await screen.findByText(/Superviseur · lecture seule/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Valider la sélection/ })).toBeNull();
    await openFirstReview(/Consulter la campagne/);
    const dialog = await screen.findByRole("dialog", { name: "Promo gratuite" });
    expect(within(dialog).queryByRole("button", { name: "Valider…" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Relancer l'analyse IA" })).toBeNull();
    expect(within(dialog).getByText("Décision réservée aux administrateurs.")).toBeInTheDocument();
  });

  it("does not load campaigns for an opérateur", () => {
    session.role = "OPERATEUR";
    render(<ModerationView />);
    expect(
      screen.getByText("File réservée aux administrateurs et superviseurs"),
    ).toBeInTheDocument();
    expect(api.search).not.toHaveBeenCalled();
  });

  it("shows a retryable error state when the service is down", async () => {
    api.search.mockRejectedValue(
      new ApiError(502, "Le service ZELQANE est momentanément indisponible."),
    );
    render(<ModerationView />);
    expect(await screen.findByText("Service momentanément indisponible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });
});

describe("ModerationView — search, filters and URL state", () => {
  it("sends the tab, search, client, zone, AI status and period to the server", async () => {
    nav.reset("onglet=toutes&statut=BLOCKED&tri=budget");
    render(<ModerationView />);
    expect(await screen.findByRole("tab", { name: /Toutes/, selected: true })).toBeInTheDocument();
    await waitFor(() =>
      expect(api.search).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: ["BLOCKED"], sort: "budget,desc", page: 0, size: 20 }),
      ),
    );
    expect(screen.getByText("Trié par : budget le plus élevé")).toBeInTheDocument();
    // Counters come from the dashboard.
    expect(await screen.findByRole("tab", { name: /À traiter/ })).toHaveTextContent("3");

    fireEvent.change(screen.getAllByLabelText("Rechercher une campagne")[0]!, {
      target: { value: "soldes" },
    });
    await waitFor(() => expect(params().get("q")).toBe("soldes"));
    fireEvent.change(screen.getAllByLabelText("Annonceur")[0]!, { target: { value: "café" } });
    await waitFor(() => expect(params().get("client")).toBe("café"));
    fireEvent.change(screen.getAllByLabelText("Avis IA")[0]!, {
      target: { value: "REVIEW_REQUIRED" },
    });
    fireEvent.change(await screen.findByDisplayValue("Toutes les zones"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getAllByLabelText("Diffusion du")[0]!, {
      target: { value: "2026-10-01" },
    });
    await waitFor(() =>
      expect(api.search).toHaveBeenLastCalledWith(
        expect.objectContaining({
          q: "soldes",
          client: "café",
          aiStatus: ["REVIEW_REQUIRED"],
          zoneId: 3,
          from: "2026-10-01",
          to: "2026-10-01",
          status: ["BLOCKED"],
        }),
      ),
    );
    expect(nav.router.push).not.toHaveBeenCalled();
  });

  it("opens the review from ?examen= outside the page and removes the param on close", async () => {
    api.get.mockResolvedValue(campaign({ id: 44, name: "Hors page", status: "TERMINATED" }));
    nav.reset("examen=44");
    render(<ModerationView />);
    const dialog = await screen.findByRole("dialog", { name: "Hors page" });
    expect(api.get).toHaveBeenCalledWith(44, expect.anything());
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Fermer" })[0]!);
    await waitFor(() => expect(params().get("examen")).toBeNull());
    expect(nav.router.back).not.toHaveBeenCalled();
  });

  it("pushes ?examen= when opening from the table and goes back on close", async () => {
    render(<ModerationView />);
    await openFirstReview();
    expect(nav.router.push).toHaveBeenCalledWith("/admin/moderation?examen=2", { scroll: false });
    const dialog = await screen.findByRole("dialog", { name: "Promo gratuite" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(nav.router.back).toHaveBeenCalledTimes(1));
    expect(params().get("examen")).toBeNull();
  });
});

describe("ModerationView — keyboard triage", () => {
  it("V opens the validation, confirming advances to the next campaign; R focuses the reason", async () => {
    catalogue = [approvedA, approvedB];
    api.report.mockResolvedValue(null);
    api.validate.mockImplementation((id: number) =>
      Promise.resolve({
        ...(id === 5 ? approvedA : approvedB),
        status: "ACTIVE",
        adminStatus: "VALIDATED",
      }),
    );
    nav.reset("examen=5");
    render(<ModerationView />);
    const first = await screen.findByRole("dialog", { name: "Soldes Lac" });
    expect(within(first).getByText(/Campagne 1 sur 2/)).toBeInTheDocument();

    fireEvent.keyDown(first, { key: "v" });
    fireEvent.click(await within(first).findByRole("button", { name: "Confirmer la validation" }));
    await waitFor(() => expect(api.validate).toHaveBeenCalledWith(5, { comment: null }));
    await waitFor(() => expect(params().get("examen")).toBe("6"));
    const second = await screen.findByRole("dialog", { name: "Rentrée Marsa" });
    expect(api.validate).toHaveBeenCalledTimes(1);
    expect(within(second).getByText("« Soldes Lac » validée")).toBeInTheDocument();

    fireEvent.keyDown(second, { key: "r" });
    const reason = await within(second).findByLabelText(/Motif du refus/);
    await waitFor(() => expect(reason).toHaveFocus());
  });
});

describe("ModerationView — bulk validation", () => {
  it("only selects APPROVED_BY_AI campaigns with a reservation and summarises partial failures", async () => {
    catalogue = [
      approvedA,
      review,
      approvedB,
      campaign({
        id: 7,
        name: "Sans créneau",
        status: "APPROVED_BY_AI",
        aiStatus: "APPROVED",
        reservationsCount: 0,
      }),
    ];
    api.validate.mockImplementation((id: number) =>
      id === 5
        ? Promise.resolve({ ...approvedA, status: "ACTIVE", adminStatus: "VALIDATED" })
        : Promise.reject(new ApiError(409, "Aucune réservation à confirmer.")),
    );
    render(<ModerationView />);

    expect(
      await screen.findByRole("checkbox", { name: /Sélectionner « Promo gratuite »/ }),
    ).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Sélectionner « Sans créneau »/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Sélectionner « Soldes Lac »/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Tout sélectionner" }));
    fireEvent.click(screen.getByRole("button", { name: /Valider la sélection \(2\)/ }));

    const confirm = await screen.findByRole("dialog", { name: /^Valider 2 campagnes\s\?$/ });
    const list = within(confirm).getByRole("list", { name: "Campagnes à valider" });
    expect(within(list).getByText("#5")).toBeInTheDocument();
    expect(within(list).getByText("#6")).toBeInTheDocument();
    act(() => {
      fireEvent.click(within(confirm).getByRole("button", { name: "Valider 2 campagnes" }));
    });

    await waitFor(() => expect(screen.getByText("1 validée · 1 échec : #6")).toBeInTheDocument());
    expect(api.validate.mock.calls.map((c: unknown[]) => c[0] as number)).toEqual([5, 6]);
    expect(screen.getByText(/#6 — Aucune réservation à confirmer/)).toBeInTheDocument();
    expect(api.validate).not.toHaveBeenCalledWith(2, expect.anything());
  });
});
