import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: { value: "/espace" },
  push: vi.fn(),
  replace: vi.fn(),
  mine: vi.fn(),
  all: vi.fn(),
  supportsAll: vi.fn(),
  zonesAll: vi.fn(),
  zonesActive: vi.fn(),
  byCampaign: vi.fn(),
  emergencyAll: vi.fn(),
  sessionGet: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname.value,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api/endpoints", () => ({
  campaignsApi: { mine: mocks.mine, all: mocks.all },
  supportsApi: { all: mocks.supportsAll },
  zonesApi: { all: mocks.zonesAll, active: mocks.zonesActive },
  reservationsApi: { byCampaign: mocks.byCampaign },
  emergencyApi: { all: mocks.emergencyAll },
  sessionApi: { get: mocks.sessionGet, logout: mocks.logout },
}));

import { AppShell, createCtaMode } from "@/components/shell/app-shell";
import { defaultTrail, trailParent } from "@/components/shell/breadcrumbs";
import {
  buildCommands,
  CommandPalette,
  groupCommands,
  pushRecent,
  readRecents,
} from "@/components/shell/command-palette";
import {
  countActiveEmergencies,
  countConflicts,
  countDraftsToFinalise,
  countModerationQueue,
} from "@/components/shell/nav-badges";
import { isMoreActive } from "@/components/shell/mobile-tab-bar";
import { NavigationGuardProvider } from "@/components/shell/navigation-guard";
import { SessionExpiredDialog, SessionExpiryBanner } from "@/components/shell/session-expiry";
import { SessionExpiredListener } from "@/components/shell/session-expired-listener";
import { SessionProvider } from "@/components/shell/session-provider";
import { ShortcutsProvider, useShortcut } from "@/components/shell/shortcuts";
import { ADMIN_NAV, ESPACE_NAV, navForRole, roleCanOpen } from "@/content/nav";
import { SESSION_EXPIRED_EVENT } from "@/lib/api/client";
import type {
  CampaignResponse,
  RoleCode,
  SessionUser,
  SupportResponse,
  ZoneResponse,
} from "@/lib/api/types";
import { useFormDraft } from "@/lib/forms/form-draft";
import { resetUnsavedGuards, useUnsavedChangesGuard } from "@/lib/forms/unsaved-guard";
import { clearResourceCache } from "@/lib/resource-cache";
import { setSingleKeyShortcutsEnabled } from "@/lib/shortcuts";

function user(role: RoleCode = "ANNONCEUR", expMinutes = 600): SessionUser {
  return {
    email: role === "ANNONCEUR" ? "demo@annonceur.tn" : "admin@zelqane.local",
    nom: role === "ANNONCEUR" ? "Démo Annonceur" : "Admin ZELQANE",
    role,
    userId: 42,
    exp: Math.floor((Date.now() + expMinutes * 60_000) / 1000),
  };
}

function campaign(partial: Partial<CampaignResponse>): CampaignResponse {
  return {
    id: 1,
    clientId: 1,
    name: "Campagne",
    objective: null,
    budget: 1000,
    consumedBudget: 0,
    status: "BROUILLON",
    aiStatus: null,
    adminStatus: null,
    startDate: "2027-02-10",
    endDate: "2027-02-20",
    startTime: "08:00:00",
    endTime: "20:00:00",
    estimatedViews: 1000,
    priorityScore: 0,
    createdAt: "2026-09-01T10:00:00Z",
    submittedAt: null,
    validatedAt: null,
    ...partial,
  };
}

const SUPPORTS: SupportResponse[] = [
  {
    id: 12,
    zoneId: 3,
    zoneName: "La Marsa",
    name: "Porteur Corniche",
    supportType: "ECRAN",
    latitude: 36.88,
    longitude: 10.33,
    technicalStatus: "ACTIF",
    diffusionCapacity: 6,
  },
];
const ZONES: ZoneResponse[] = [
  { id: 3, name: "La Marsa", latitude: 36.88, longitude: 10.33, radiusKm: 2, isActive: true },
];

beforeEach(() => {
  clearResourceCache();
  resetUnsavedGuards();
  window.localStorage.clear();
  mocks.pathname.value = "/espace";
  vi.clearAllMocks();
  mocks.mine.mockResolvedValue([
    campaign({ id: 7, name: "Ouverture boutique La Marsa", status: "BROUILLON" }),
    campaign({ id: 8, name: "Soldes d'été", status: "APPROVED_BY_AI" }),
  ]);
  mocks.all.mockResolvedValue([
    campaign({ id: 3, name: "Promo", status: "REVIEW_REQUIRED" }),
    campaign({ id: 4, name: "Rentrée", status: "APPROVED_BY_AI" }),
    campaign({ id: 5, name: "Ancienne", status: "ACTIVE" }),
  ]);
  mocks.supportsAll.mockResolvedValue(SUPPORTS);
  mocks.zonesAll.mockResolvedValue(ZONES);
  mocks.zonesActive.mockResolvedValue(ZONES);
  mocks.byCampaign.mockResolvedValue([]);
  mocks.emergencyAll.mockResolvedValue([]);
  mocks.sessionGet.mockResolvedValue({ user: user() });
});

afterEach(() => {
  vi.useRealTimers();
  setSingleKeyShortcutsEnabled(true);
});

function withSession(ui: ReactNode, role: RoleCode = "ANNONCEUR", expMinutes = 600) {
  return (
    <SessionProvider user={user(role, expMinutes)}>
      <NavigationGuardProvider>
        <ShortcutsProvider variant={role === "ANNONCEUR" ? "espace" : "admin"}>
          {ui}
        </ShortcutsProvider>
      </NavigationGuardProvider>
    </SessionProvider>
  );
}

describe("command palette logic", () => {
  const actions = { openShortcuts: vi.fn(), logout: vi.fn() };

  it("scopes commands per role", () => {
    const data = {
      campaigns: [campaign({ id: 7, name: "Ouverture boutique La Marsa" })],
      supports: SUPPORTS,
      zones: ZONES,
    };
    const espace = buildCommands({ role: "ANNONCEUR", data, actions });
    expect(espace.find((c) => c.label === "Profil")?.href).toBe("/espace/profil");
    expect(espace.find((c) => c.id === "campaign:7")?.href).toBe("/espace/campagnes/7");
    expect(espace.find((c) => c.id === "campaign:7:finaliser")?.href).toBe(
      "/espace/campagnes/nouvelle?id=7&etape=3",
    );
    expect(espace.find((c) => c.id === "porteur:12")?.href).toBe("/espace/reseau?porteur=12");
    expect(espace.some((c) => c.label === "Nouveau message prioritaire")).toBe(false);

    const admin = buildCommands({ role: "ADMINISTRATEUR", data, actions, moderationCount: 2 });
    expect(admin.find((c) => c.id === "campaign:7")?.href).toBe("/admin/moderation?examen=7");
    expect(admin.find((c) => c.id === "campaign:7")?.label).toBe("#7 Ouverture boutique La Marsa");
    expect(admin.find((c) => c.id === "porteur:12")?.href).toBe(
      "/admin/reseau?onglet=ecrans&porteur=12",
    );
    expect(admin.some((c) => c.label === "Traiter la file (2)")).toBe(true);
    expect(admin.some((c) => c.label === "Profil")).toBe(false);

    const operateur = buildCommands({ role: "OPERATEUR", data, actions });
    expect(operateur.some((c) => c.label === "Nouveau message prioritaire")).toBe(false);
    expect(operateur.some((c) => c.label.startsWith("Traiter la file"))).toBe(false);
  });

  it("groups: empty query shows récents/navigation/actions, a query ranks data groups", () => {
    const data = {
      campaigns: [campaign({ id: 7, name: "Ouverture boutique La Marsa" })],
      supports: SUPPORTS,
      zones: ZONES,
    };
    const commands = buildCommands({ role: "ANNONCEUR", data, actions });
    const empty = groupCommands(commands, "", [
      { label: "Soldes", href: "/espace/campagnes/8", kind: "campagne" },
    ]);
    expect(empty.map((g) => g.group)).toEqual(["Récents", "Navigation", "Actions"]);
    const marsa = groupCommands(commands, "marsa");
    expect(marsa.map((g) => g.group)).toEqual(["Campagnes", "Porteurs", "Zones"]);
    expect(marsa[0]?.items[0]?.label).toBe("Ouverture boutique La Marsa");
  });

  it("stores 5 recents per user and survives broken storage", () => {
    for (let i = 1; i <= 7; i++)
      pushRecent(42, { label: `C${i}`, href: `/espace/campagnes/${i}`, kind: "campagne" });
    expect(readRecents(42).map((r) => r.label)).toEqual(["C7", "C6", "C5", "C4", "C3"]);
    expect(readRecents(43)).toEqual([]);
    window.localStorage.setItem("zelqane:recents:42", "{oops");
    expect(readRecents(42)).toEqual([]);
  });
});

describe("role-aware back-office navigation (contract §5 F3)", () => {
  it("shows every page to administrators and hides dossier pages from opérateurs", () => {
    const hrefs = (role: Parameters<typeof navForRole>[1]) =>
      navForRole(ADMIN_NAV, role).map((i) => i.href);
    expect(hrefs("ADMINISTRATEUR")).toEqual([
      "/admin",
      "/admin/supervision",
      "/admin/moderation",
      "/admin/approbations",
      "/admin/reservations",
      "/admin/reseau",
      "/admin/urgences",
      "/admin/statistiques",
      "/admin/carte-chaleur",
      "/admin/journal",
      "/admin/ia-qualite",
      "/admin/utilisateurs",
      "/admin/regles-ia",
    ]);
    expect(hrefs("SUPERVISEUR")).toEqual(hrefs("ADMINISTRATEUR"));
    expect(hrefs("OPERATEUR")).toEqual([
      "/admin",
      "/admin/supervision",
      "/admin/reseau",
      "/admin/urgences",
      "/admin/statistiques",
      "/admin/carte-chaleur",
      "/admin/journal",
    ]);
    expect(roleCanOpen(ADMIN_NAV, "OPERATEUR", "/admin/utilisateurs?onglet=equipe")).toBe(false);
    expect(roleCanOpen(ADMIN_NAV, "OPERATEUR", "/admin/journal?onglet=diffusions")).toBe(true);
    expect(roleCanOpen(ADMIN_NAV, "SUPERVISEUR", "/admin/regles-ia")).toBe(true);
  });

  it("registers the new pages and actions in the palette per role", () => {
    const data = { campaigns: [], supports: SUPPORTS, zones: ZONES };
    const actions = { openShortcuts: vi.fn(), logout: vi.fn() };
    const admin = buildCommands({ role: "ADMINISTRATEUR", data, actions });
    for (const href of [
      "/admin/utilisateurs",
      "/admin/journal",
      "/admin/regles-ia",
      "/admin/reservations",
      "/admin/statistiques",
    ]) {
      expect(admin.some((c) => c.href === href)).toBe(true);
    }
    expect(admin.find((c) => c.id === "action:new-staff")?.href).toBe(
      "/admin/utilisateurs?onglet=equipe",
    );
    expect(admin.find((c) => c.id === "action:conflicts")?.href).toBe(
      "/admin/reservations?onglet=conflits",
    );
    const operateur = buildCommands({ role: "OPERATEUR", data, actions });
    expect(operateur.some((c) => c.href === "/admin/utilisateurs")).toBe(false);
    expect(operateur.some((c) => c.id === "action:new-staff")).toBe(false);
    expect(operateur.some((c) => c.id === "action:conflicts")).toBe(false);
    expect(operateur.find((c) => c.id === "action:journal-diffusions")?.href).toBe(
      "/admin/journal?onglet=diffusions",
    );
  });

  it("counts only CONFLIT groups for the reservations badge", () => {
    expect(
      countConflicts([{ severity: "CONFLIT" }, { severity: "SATURE" }, { severity: "CONFLIT" }]),
    ).toBe(2);
    expect(
      countActiveEmergencies([
        { isActive: true, state: "TERMINE" },
        { isActive: false, state: "PROGRAMME" },
      ]),
    ).toBe(1);
  });
});

describe("CommandPalette (RTL)", () => {
  it("filters « marsa », moves with arrows and navigates with Enter", async () => {
    const u = userEvent.setup();
    render(withSession(<CommandPalette open onOpenChange={vi.fn()} onOpenShortcuts={vi.fn()} />));
    const input = screen.getByRole("combobox", { name: /Rechercher une page/ });
    expect(input).toHaveFocus();
    await u.type(input, "marsa");
    const [option] = await screen.findAllByRole("option", { name: /^Ouverture boutique La Marsa/ });
    if (!option) throw new Error("option manquante");
    expect(option).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", option.id);
    await u.keyboard("{ArrowDown}");
    const porteur = screen
      .getAllByRole("option")
      .find((o) => o.getAttribute("aria-selected") === "true");
    expect(porteur).not.toBe(option);
    await u.keyboard("{ArrowUp}{Enter}");
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/espace/campagnes/7"));
    expect(readRecents(42)[0]).toMatchObject({ href: "/espace/campagnes/7", kind: "campagne" });
  });

  it("shows « Recherche indisponible · Réessayer » when data fails", async () => {
    mocks.mine.mockRejectedValue(new Error("boom"));
    const u = userEvent.setup();
    render(withSession(<CommandPalette open onOpenChange={vi.fn()} onOpenShortcuts={vi.fn()} />));
    expect(await screen.findByText(/Recherche indisponible/)).toBeInTheDocument();
    mocks.mine.mockResolvedValue([campaign({ id: 9, name: "Retour" })]);
    await u.click(screen.getByRole("button", { name: "Réessayer" }));
    await u.type(screen.getByRole("combobox"), "retour");
    expect((await screen.findAllByRole("option", { name: /Retour/ })).length).toBeGreaterThan(0);
  });
});

describe("shortcuts", () => {
  function Probe({ onD, onN }: { onD: () => void; onN: () => void }) {
    useShortcut("g d", onD, { description: "Tableau de bord", section: "Aller à" });
    useShortcut("n", onN, { description: "Nouvelle campagne", section: "Partout" });
    return <input aria-label="Nom" />;
  }

  it("runs G sequences within 1.2 s, ignores single keys in inputs, honours the off switch", () => {
    vi.useFakeTimers();
    const onD = vi.fn();
    const onN = vi.fn();
    render(
      <ShortcutsProvider variant="espace">
        <Probe onD={onD} onN={onN} />
      </ShortcutsProvider>,
    );
    fireEvent.keyDown(document.body, { key: "g" });
    fireEvent.keyDown(document.body, { key: "d" });
    expect(onD).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document.body, { key: "g" });
    act(() => {
      vi.advanceTimersByTime(1300);
    });
    fireEvent.keyDown(document.body, { key: "d" });
    expect(onD).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByLabelText("Nom"), { key: "n" });
    expect(onN).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "n" });
    expect(onN).toHaveBeenCalledTimes(1);

    setSingleKeyShortcutsEnabled(false);
    fireEvent.keyDown(document.body, { key: "n" });
    expect(onN).toHaveBeenCalledTimes(1);
  });
});

describe("navigation guard", () => {
  function DirtyForm({ dirty }: { dirty: boolean }) {
    useUnsavedChangesGuard({ dirty });
    return <Link href="/espace/campagnes">Campagnes</Link>;
  }

  it("intercepts an internal link when dirty and not when clean", async () => {
    const u = userEvent.setup();
    const { rerender } = render(withSession(<DirtyForm dirty />));
    await u.click(screen.getByRole("link", { name: "Campagnes" }));
    const dialog = await screen.findByRole("dialog", { name: /^Quitter sans enregistrer\s\?$/ });
    await u.click(within(dialog).getByRole("button", { name: "Rester" }));
    expect(mocks.push).not.toHaveBeenCalled();

    await u.click(screen.getByRole("link", { name: "Campagnes" }));
    await u.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Quitter" }),
    );
    expect(mocks.push).toHaveBeenCalledWith("/espace/campagnes");

    mocks.push.mockClear();
    rerender(withSession(<DirtyForm dirty={false} />));
    const link = screen.getByRole("link", { name: "Campagnes" });
    const clicked = fireEvent.click(link);
    expect(screen.queryByRole("dialog", { name: /^Quitter sans enregistrer\s\?$/ })).toBeNull();
    expect(clicked).toBe(true);
  });
});

describe("session expiry", () => {
  it("shows the banner at T−10 min with the time, then role=alert at T−2 min", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-09-12T11:00:00Z"));
    render(withSession(<SessionExpiryBanner />, "ANNONCEUR", 11));
    expect(screen.queryByRole("status")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(/Votre session expire à 12:11\. Enregistrez votre travail\./);
    fireEvent.click(within(banner).getByRole("button", { name: "Masquer" }));
    expect(screen.queryByRole("status")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8 * 60_000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/Votre session expire/);
    expect(
      within(screen.getByRole("alert")).getByRole("link", { name: /Se reconnecter/ }),
    ).toHaveAttribute("target", "_blank");
  });

  it("opens the non-dismissible dialog on 401 instead of navigating, wording by drafts", async () => {
    function Draft() {
      useFormDraft({ key: "campaign:new", value: { name: "x" }, dirty: true });
      return null;
    }
    const u = userEvent.setup();
    render(
      withSession(
        <>
          <Draft />
          <SessionExpiredListener />
        </>,
      ),
    );
    act(() => {
      window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    });
    const dialog = await screen.findByRole("alertdialog", { name: "Session expirée" });
    expect(dialog).toHaveTextContent("Vos saisies de cette page sont conservées sur cet appareil.");
    expect(within(dialog).getByRole("link", { name: "Se reconnecter" })).toHaveAttribute(
      "href",
      expect.stringContaining("expire=1"),
    );
    await u.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("says only « Reconnectez-vous » without drafts", () => {
    render(<SessionExpiredDialog open hasDrafts={false} />);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Reconnectez-vous pour continuer.");
    expect(screen.getByRole("alertdialog")).not.toHaveTextContent("conservées");
  });
});

describe("trail and badges", () => {
  it("derives default trails and the back parent", () => {
    expect(defaultTrail("/espace", "espace")).toEqual([{ label: "Tableau de bord" }]);
    expect(defaultTrail("/espace/campagnes/nouvelle", "espace")).toEqual([
      { label: "Campagnes", href: "/espace/campagnes" },
      { label: "Nouvelle campagne" },
    ]);
    expect(defaultTrail("/espace/campagnes/7/modifier", "espace").map((b) => b.label)).toEqual([
      "Campagnes",
      "Campagne",
      "Modifier",
    ]);
    expect(defaultTrail("/espace/profil", "espace")).toEqual([{ label: "Profil" }]);
    expect(trailParent(defaultTrail("/espace/campagnes/7", "espace"))).toEqual({
      label: "Campagnes",
      href: "/espace/campagnes",
    });
    expect(trailParent([{ label: "Tableau de bord" }])).toBeNull();
  });

  it("counts badges from real data only", () => {
    const campaigns = [
      campaign({ id: 1, status: "BROUILLON" }),
      campaign({ id: 2, status: "BROUILLON" }),
      campaign({ id: 3, status: "REJECTED_BY_AI" }),
      campaign({ id: 4, status: "BROUILLON" }),
    ];
    const reservations = new Map([
      [1, [{ reservationStatus: "TEMPORAIRE" as const }]],
      [2, [{ reservationStatus: "ANNULEE" as const }]],
    ]);
    // id 4: reservations unknown → not counted
    expect(countDraftsToFinalise(campaigns, reservations)).toBe(2);
    expect(
      countModerationQueue([
        { status: "APPROVED_BY_AI" },
        { status: "REVIEW_REQUIRED" },
        { status: "ACTIVE" },
      ]),
    ).toBe(2);
    expect(countActiveEmergencies([{ isActive: true }, { isActive: false }])).toBe(1);
  });

  it("applies the topbar CTA rule", () => {
    expect(createCtaMode("espace", "/espace")).toBe("primary");
    expect(createCtaMode("espace", "/espace/campagnes")).toBe("primary");
    expect(createCtaMode("espace", "/espace/reservations")).toBe("secondary");
    expect(createCtaMode("espace", "/espace/campagnes/nouvelle")).toBeNull();
    expect(createCtaMode("admin", "/admin")).toBeNull();
  });

  it("marks « Plus » current only for the routes it holds", () => {
    expect(isMoreActive(ESPACE_NAV, "/espace/statistiques")).toBe(true);
    expect(isMoreActive(ESPACE_NAV, "/espace/profil")).toBe(true);
    expect(isMoreActive(ESPACE_NAV, "/espace/campagnes/1")).toBe(false);
    // Unknown URL (in-shell 404): no tab is current.
    expect(isMoreActive(ESPACE_NAV, "/espace/nimporte")).toBe(false);
    expect(isMoreActive(ADMIN_NAV, "/admin/xyz")).toBe(false);
  });
});

describe("AppShell", () => {
  it("renders groups, badges, account menu without Profil in the nav, and the tab bar", async () => {
    mocks.byCampaign.mockResolvedValue([]);
    const u = userEvent.setup();
    render(
      <SessionProvider user={user()}>
        <AppShell variant="espace">
          <h1>Tableau de bord</h1>
        </AppShell>
      </SessionProvider>,
    );
    const nav = screen.getByRole("navigation", { name: "Navigation de l'espace annonceur" });
    expect(within(nav).getByText("Piloter")).toBeInTheDocument();
    expect(within(nav).getByText("Explorer")).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: /Réseau & Studio 3D/ })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: /Profil/ })).toBeNull();
    expect(await within(nav).findByText(", 1 à finaliser")).toBeInTheDocument();

    const tabs = screen.getByRole("navigation", { name: "Navigation principale" });
    expect(within(tabs).getAllByRole("listitem")).toHaveLength(5);
    expect(within(tabs).getByRole("link", { name: /Accueil/ })).toHaveAttribute(
      "aria-current",
      "page",
    );

    expect(screen.getAllByRole("link", { name: /Nouvelle campagne/ }).length).toBeGreaterThan(0);

    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
    expect(
      await screen.findByRole("combobox", { name: /Rechercher une page/ }),
    ).toBeInTheDocument();
    await u.keyboard("{Escape}");

    fireEvent.keyDown(document.body, { key: "?", shiftKey: true });
    expect(await screen.findByRole("dialog", { name: "Raccourcis clavier" })).toBeInTheDocument();
  });

  it("hides the tab bar on the network page and uses the admin accent", () => {
    mocks.pathname.value = "/admin/moderation";
    render(
      <SessionProvider user={user("SUPERVISEUR")}>
        <AppShell variant="admin">
          <p>contenu</p>
        </AppShell>
      </SessionProvider>,
    );
    const active = within(
      screen.getByRole("navigation", { name: "Navigation du back-office" }),
    ).getByRole("link", {
      name: /Modération/,
    });
    expect(active.className).toContain("bg-blue-soft");
    expect(screen.getByRole("img", { name: "Accès en lecture seule" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Nouvelle campagne/ })).toBeNull();

    mocks.pathname.value = "/espace/reseau";
  });

  it("hides the tab bar on /espace/reseau", () => {
    mocks.pathname.value = "/espace/reseau";
    render(
      <SessionProvider user={user()}>
        <AppShell variant="espace">
          <p>carte</p>
        </AppShell>
      </SessionProvider>,
    );
    expect(screen.queryByRole("navigation", { name: "Navigation principale" })).toBeNull();
    fireEvent.keyDown(document.body, { key: "?", shiftKey: true });
    const sheet = screen.getByRole("dialog", { name: "Raccourcis clavier" });
    expect(within(sheet).getByRole("heading", { name: "Partout" })).toBeInTheDocument();
    expect(within(sheet).getByRole("heading", { name: "Carte du réseau" })).toBeInTheDocument();
    expect(within(sheet).getByRole("heading", { name: "Studio 3D" })).toBeInTheDocument();
    expect(
      within(sheet).getByRole("switch", { name: "Désactiver les raccourcis à une touche" }),
    ).toBeInTheDocument();
  });
});

describe("hooks in isolation", () => {
  it("useShortcut works without the provider", () => {
    const fn = vi.fn();
    renderHook(() =>
      useShortcut("mod+k", fn, { description: "x", section: "y", allowInEditable: true }),
    );
    fireEvent.keyDown(document.body, { key: "k", metaKey: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
