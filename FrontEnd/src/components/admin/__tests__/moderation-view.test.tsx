import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import type { CampaignResponse, ReservationResponse, RoleCode } from "@/lib/api/types";
import { clearResourceCache } from "@/lib/resource-cache";

const api = vi.hoisted(() => ({
  all: vi.fn(),
  report: vi.fn(),
  byCampaign: vi.fn(),
  supports: vi.fn(),
  zones: vi.fn(),
  validate: vi.fn(),
  reject: vi.fn(),
}));

vi.mock("@/lib/api/endpoints", () => ({
  campaignsApi: { all: api.all, get: vi.fn() },
  aiApi: { report: api.report, checkContent: vi.fn() },
  reservationsApi: { byCampaign: api.byCampaign },
  supportsApi: { all: api.supports },
  zonesApi: { all: api.zones },
  adminApi: { validate: api.validate, reject: api.reject },
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

import { ModerationView } from "@/components/admin/moderation-view";

function campaign(over: Partial<CampaignResponse>): CampaignResponse {
  return {
    id: 2,
    clientId: 14,
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
    createdAt: "2026-09-02T07:00:00Z",
    submittedAt: "2026-09-02T08:00:00Z",
    validatedAt: null,
    ...over,
  };
}

function reservation(
  campaignId: number,
  over: Partial<ReservationResponse> = {},
): ReservationResponse {
  return {
    id: campaignId * 10,
    campaignId,
    zoneId: 1,
    supportId: 7,
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    startTime: "08:00:00",
    endTime: "22:00:00",
    availabilityStatus: "RESERVE",
    reservationStatus: "TEMPORAIRE",
    estimatedViews: 1000,
    estimatedCost: 150,
    ...over,
  };
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

beforeEach(() => {
  clearResourceCache();
  for (const fn of Object.values(api)) fn.mockReset();
  nav.router.push.mockClear();
  nav.router.replace.mockClear();
  nav.router.back.mockClear();
  nav.reset("");
  session.role = "ADMINISTRATEUR";
  api.all.mockResolvedValue([review]);
  api.report.mockResolvedValue({
    campaignId: 2,
    aiStatus: "REVIEW_REQUIRED",
    riskScore: 62,
    qualityScore: 74,
    detectedIssues: ["texte ambigu"],
    recommendation: "Vérification manuelle avant diffusion",
  });
  api.byCampaign.mockResolvedValue([]);
  api.supports.mockResolvedValue([]);
  api.zones.mockResolvedValue([]);
});

function params(): URLSearchParams {
  return new URLSearchParams(nav.search);
}

describe("ModerationView — decisions", () => {
  it("validates a REVIEW_REQUIRED campaign only after the inline acknowledgement", async () => {
    api.validate.mockResolvedValue({ ...review, status: "ACTIVE", adminStatus: "VALIDATED" });
    render(<ModerationView />);

    fireEvent.click(
      (await screen.findAllByRole("button", { name: "Examiner la campagne Promo gratuite" }))[0]!,
    );
    const dialog = await screen.findByRole("dialog", { name: "Promo gratuite" });
    expect(within(dialog).getAllByText("Annonceur n° 14").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("CAMP-00002")).toBeInTheDocument();
    expect(await within(dialog).findByText("texte ambigu")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Validée, cette campagne ne sera pas diffusée"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Score de risque")).toBeInTheDocument();
    expect(within(dialog).queryByText(/Score de risque \/100/)).toBeNull();

    const validateButton = within(dialog).getByRole("button", { name: "Valider" });
    expect(validateButton).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(validateButton);
    expect(api.validate).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: /J'ai compris/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Valider" }));
    await waitFor(() => expect(api.validate).toHaveBeenCalledWith(2));
    expect(api.validate).toHaveBeenCalledTimes(1);
  });

  it("refuses with a preset reason inline, then copies the advertiser message", async () => {
    api.reject.mockResolvedValue({ message: "Campaign rejected successfully" });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ModerationView />);
    fireEvent.click((await screen.findAllByRole("button", { name: /Examiner la campagne/ }))[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Promo gratuite" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Refuser" }));

    // No nested confirmation dialog.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const button = within(dialog).getByRole("button", { name: "Refuser la campagne" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Allégation « gratuit » non justifiée" }),
    );
    expect(within(dialog).getByLabelText(/Motif du refus/)).toHaveValue(
      "Allégation « gratuit » non justifiée",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Refuser la campagne" }));
    await waitFor(() =>
      expect(api.reject).toHaveBeenCalledWith(2, "Allégation « gratuit » non justifiée"),
    );

    fireEvent.click(
      await within(dialog).findByRole("button", { name: "Copier le message pour l'annonceur" }),
    );
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const message = String(writeText.mock.calls[0]?.[0]);
    expect(message).toContain("Motif : Allégation « gratuit » non justifiée");
    expect(message).toContain("CAMP-00002");
    expect(message).toContain("Dupliquer et corriger");
  });

  it("is read-only for a superviseur", async () => {
    session.role = "SUPERVISEUR";
    render(<ModerationView />);
    expect(await screen.findByText(/Superviseur · lecture seule/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Valider la sélection/ })).toBeNull();
    fireEvent.click((await screen.findAllByRole("button", { name: /Consulter la campagne/ }))[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Promo gratuite" });
    expect(within(dialog).queryByRole("button", { name: "Valider" })).toBeNull();
    expect(within(dialog).getByText("Décision réservée aux administrateurs.")).toBeInTheDocument();
  });

  it("does not load campaigns for an opérateur", () => {
    session.role = "OPERATEUR";
    render(<ModerationView />);
    expect(
      screen.getByText("File réservée aux administrateurs et superviseurs"),
    ).toBeInTheDocument();
    expect(api.all).not.toHaveBeenCalled();
  });

  it("shows a retryable error state when the service is down", async () => {
    api.all.mockRejectedValue(new ApiError(502, "Le service TPUB est momentanément indisponible."));
    render(<ModerationView />);
    expect(await screen.findByText("Service momentanément indisponible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });
});

describe("ModerationView — URL state", () => {
  it("opens the review from ?examen= and removes the param on close (deep link → replace)", async () => {
    nav.reset("examen=2");
    render(<ModerationView />);
    const dialog = await screen.findByRole("dialog", { name: "Promo gratuite" });
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Fermer" })[0]!);
    await waitFor(() => expect(params().get("examen")).toBeNull());
    expect(nav.router.back).not.toHaveBeenCalled();
    expect(nav.router.replace).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("pushes ?examen= when opening from the table and goes back on close", async () => {
    render(<ModerationView />);
    fireEvent.click((await screen.findAllByRole("button", { name: /Examiner la campagne/ }))[0]!);
    expect(nav.router.push).toHaveBeenCalledWith("/admin/moderation?examen=2", { scroll: false });
    const dialog = await screen.findByRole("dialog", { name: "Promo gratuite" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(nav.router.back).toHaveBeenCalledTimes(1));
    expect(params().get("examen")).toBeNull();
  });

  it("maps the legacy tab, keeps the search in ?q= (replace) and shows the sort caption", async () => {
    nav.reset("onglet=analyse&tri=debut");
    api.all.mockResolvedValue([
      review,
      campaign({ id: 3, name: "Analyse Sousse", status: "PENDING_AI_CHECK" }),
    ]);
    render(<ModerationView />);
    expect(
      await screen.findByRole("tab", { name: /Analyse IA en attente/, selected: true }),
    ).toBeInTheDocument();
    expect(screen.getByText("Trié par : début le plus proche")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Rechercher une campagne"), {
      target: { value: "sousse" },
    });
    await waitFor(() => expect(params().get("q")).toBe("sousse"));
    expect(nav.router.push).not.toHaveBeenCalled();
    expect(params().get("onglet")).toBe("analyse");
  });
});

describe("ModerationView — keyboard triage", () => {
  it("V validates once and advances to the next campaign; R focuses the reason", async () => {
    api.all.mockResolvedValue([approvedA, approvedB]);
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
    await waitFor(() => expect(api.validate).toHaveBeenCalledWith(5));
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
  it("only selects APPROVED_BY_AI campaigns with an active créneau and summarises partial failures", async () => {
    api.all.mockResolvedValue([approvedA, review, approvedB]);
    api.byCampaign.mockImplementation((id: number) => Promise.resolve([reservation(id)]));
    api.validate.mockImplementation((id: number) =>
      id === 5
        ? Promise.resolve({ ...approvedA, status: "ACTIVE", adminStatus: "VALIDATED" })
        : Promise.reject(new ApiError(409, "Conflit de réservation.")),
    );
    render(<ModerationView />);

    const reviewBox = await screen.findByRole("checkbox", {
      name: /Sélectionner « Promo gratuite »/,
    });
    expect(reviewBox).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: /Sélectionner « Soldes Lac »/ })).toBeEnabled(),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: /Sélectionner « Rentrée Marsa »/ }),
      ).toBeEnabled(),
    );
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
    expect(screen.getByText(/#6 — Conflit de réservation/)).toBeInTheDocument();
    expect(api.validate).not.toHaveBeenCalledWith(2);
  });
});
