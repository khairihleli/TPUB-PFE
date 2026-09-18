"use client";

/**
 * Command palette ⌘K / Ctrl+K (UX-PLAN §5.1, IA-09). Radix Dialog + ARIA combobox/listbox,
 * client-side ranking over data already loaded through the shared cache. No backend search.
 */
import {
  Activity,
  Bell,
  CalendarRange,
  ChartColumn,
  CheckCheck,
  CornerDownLeft,
  Flame,
  FileClock,
  Gauge,
  ListChecks,
  Keyboard,
  LayoutDashboard,
  LogOut,
  MapPin,
  MapPinned,
  Megaphone,
  Plus,
  Search,
  ShieldCheck,
  Siren,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Dialog as RadixDialog } from "radix-ui";
import {
  createContext,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { useNavigationGuard } from "@/components/shell/navigation-guard";
import { useSession } from "@/components/shell/session-provider";
import { useShortcut, useShortcutsHelp } from "@/components/shell/shortcuts";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ACCOUNT_NAV,
  ADMIN_ACCOUNT_NAV,
  ADMIN_NAV,
  type AppNavIcon,
  ESPACE_NAV,
  navForRole,
} from "@/content/nav";
import { campaignsApi, supportsApi, zonesApi } from "@/lib/api/endpoints";
import type { CampaignResponse, RoleCode, SupportResponse, ZoneResponse } from "@/lib/api/types";
import { campaignStatusFor, getCampaignDisplayStatus } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { fetchCached, resourceKeys } from "@/lib/resource-cache";
import { routes } from "@/lib/routes";
import { rankItems } from "@/lib/search";
import { focusPageSearch } from "@/lib/shortcuts";

export interface Command {
  id: string;
  label: string;
  /** Group heading: « Cette page », « Navigation », « Actions », « Campagnes »… */
  group: string;
  keywords?: readonly string[];
  /** Shortcut string displayed with <Kbd> ("g c", "mod+k"). */
  shortcut?: string | readonly string[];
  icon?: ReactNode;
  /** Secondary line (« Tunis Centre », « Brouillon »). */
  description?: string;
  /** Navigation target (goes through the navigation guard; ⌘/Ctrl+Enter opens a new tab). */
  href?: string;
  run?: () => void;
}

// ---------------------------------------------------------------------------
// Recents (localStorage per user)
// ---------------------------------------------------------------------------

export interface RecentItem {
  label: string;
  href: string;
  kind: "campagne" | "porteur" | "zone" | "page";
}

const MAX_RECENTS = 5;

export function recentsStorageKey(userId: number | string): string {
  return `zelqane:recents:${userId}`;
}

export function readRecents(userId: number | string): RecentItem[] {
  try {
    const raw = window.localStorage.getItem(recentsStorageKey(userId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (r): r is RecentItem =>
              !!r &&
              typeof r === "object" &&
              typeof (r as RecentItem).href === "string" &&
              typeof (r as RecentItem).label === "string",
          )
          .slice(0, MAX_RECENTS)
      : [];
  } catch {
    return [];
  }
}

export function pushRecent(userId: number | string, item: RecentItem): RecentItem[] {
  const next = [item, ...readRecents(userId).filter((r) => r.href !== item.href)].slice(
    0,
    MAX_RECENTS,
  );
  try {
    window.localStorage.setItem(recentsStorageKey(userId), JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
}

/** Object pages call it once the name is known: `useRecordRecent(c && { label: c.name, href, kind: "campagne" })`. */
export function useRecordRecent(item: RecentItem | null | undefined | false): void {
  const session = useSession();
  const key = item ? `${item.href}|${item.label}|${item.kind}` : "";
  const userId = session.user.userId;
  useEffect(() => {
    if (!key) return;
    const [href = "", label = "", kind = "page"] = key.split("|");
    pushRecent(userId, { href, label, kind: kind as RecentItem["kind"] });
  }, [key, userId]);
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface PaletteContextValue {
  open: (query?: string) => void;
  close: () => void;
  register: (id: string, commands: readonly Command[]) => void;
  unregister: (id: string) => void;
}

const PaletteContext = createContext<PaletteContextValue | null>(null);

/** `const { open } = useCommandPalette(); open("marsa")`. No-op outside AppShell. */
export function useCommandPalette(): { open: (query?: string) => void } {
  const ctx = useContext(PaletteContext);
  return { open: ctx?.open ?? (() => undefined) };
}

/**
 * Page commands shown first (« Cette page »):
 * `useRegisterCommands([{ id: "valider-3", label: "Valider #3", group: "Cette page", run }], [id])`.
 */
export function useRegisterCommands(commands: readonly Command[], deps: readonly unknown[]): void {
  const ctx = useContext(PaletteContext);
  const id = useId();
  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  useEffect(() => {
    if (!ctx) return;
    ctx.register(id, commandsRef.current);
    return () => ctx.unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, id, ...deps]);
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface PaletteData {
  campaigns: CampaignResponse[];
  supports: SupportResponse[];
  zones: ZoneResponse[];
}

type LoadState = { status: "idle" | "loading" | "error" } | { status: "ready"; data: PaletteData };

function canListAllCampaigns(role: RoleCode): boolean {
  return role === "ADMINISTRATEUR" || role === "SUPERVISEUR";
}

export async function loadPaletteData(role: RoleCode, signal?: AbortSignal): Promise<PaletteData> {
  const staff = role !== "ANNONCEUR";
  const [campaigns, supports, zones] = await Promise.all([
    staff
      ? canListAllCampaigns(role)
        ? fetchCached(resourceKeys.campaignsAll, (s) => campaignsApi.all({ signal: s }), { signal })
        : Promise.resolve([] as CampaignResponse[])
      : fetchCached(resourceKeys.campaignsMine, (s) => campaignsApi.mine({ signal: s }), {
          signal,
        }),
    fetchCached(resourceKeys.supportsAll, (s) => supportsApi.all({ signal: s }), { signal }),
    staff
      ? fetchCached(resourceKeys.zonesAll, (s) => zonesApi.all({ signal: s }), { signal })
      : fetchCached(resourceKeys.zonesActive, (s) => zonesApi.active({ signal: s }), { signal }),
  ]);
  return { campaigns, supports, zones };
}

const NAV_ICONS: Record<AppNavIcon, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  campaigns: Megaphone,
  reservations: CalendarRange,
  stats: ChartColumn,
  network: MapPinned,
  profile: UserRound,
  overview: Gauge,
  moderation: ShieldCheck,
  emergency: Siren,
  users: UsersRound,
  journal: FileClock,
  rules: ListChecks,
  supervision: Activity,
  approvals: CheckCheck,
  heatmap: Flame,
  aiQuality: Gauge,
  notifications: Bell,
  account: UserRound,
};

const SEQUENCE_OF: Record<string, string> = {
  "/espace": "g d",
  "/espace/campagnes": "g c",
  "/espace/reseau": "g r",
  "/espace/reservations": "g v",
  "/espace/statistiques": "g s",
  "/admin": "g a",
  "/admin/moderation": "g m",
  "/admin/reseau": "g r",
  "/admin/urgences": "g u",
  "/admin/reservations": "g v",
  "/admin/statistiques": "g s",
  "/admin/supervision": "g o",
  "/admin/approbations": "g b",
  "/admin/carte-chaleur": "g c",
  "/admin/ia-qualite": "g q",
  "/admin/notifications": "g n",
  "/admin/journal": "g j",
  "/admin/utilisateurs": "g e",
  "/admin/regles-ia": "g i",
};

export interface BuildCommandsInput {
  role: RoleCode;
  data: PaletteData | null;
  actions: {
    openShortcuts: () => void;
    logout: () => void;
  };
  moderationCount?: number;
  today?: string;
}

/** Pure: every static + data command for a role (role scoping tested). */
export function buildCommands({
  role,
  data,
  actions,
  moderationCount,
}: BuildCommandsInput): Command[] {
  const staff = role !== "ANNONCEUR";
  const nav = staff
    ? [...navForRole(ADMIN_NAV, role), ...ADMIN_ACCOUNT_NAV]
    : [...ESPACE_NAV, ...ACCOUNT_NAV];
  const out: Command[] = nav.map((item) => {
    const Icon = NAV_ICONS[item.icon];
    return {
      id: `nav:${item.href}`,
      label: item.label,
      group: "Navigation",
      href: item.href,
      icon: <Icon aria-hidden="true" />,
      shortcut: SEQUENCE_OF[item.href],
    };
  });

  if (!staff) {
    out.push(
      {
        id: "action:new-campaign",
        label: "Nouvelle campagne",
        group: "Actions",
        href: routes.espace.wizard(null),
        icon: <Plus aria-hidden="true" />,
        keywords: ["créer", "brouillon"],
        shortcut: "n",
      },
      {
        id: "action:map",
        label: "Ouvrir la carte du réseau",
        group: "Actions",
        href: routes.espace.network(),
        icon: <MapPinned aria-hidden="true" />,
        keywords: ["porteurs", "studio", "3d"],
      },
    );
  } else {
    if (canListAllCampaigns(role)) {
      out.push({
        id: "action:queue",
        label:
          typeof moderationCount === "number"
            ? `Traiter la file (${moderationCount})`
            : "Traiter la file",
        group: "Actions",
        href: routes.admin.moderation({ onglet: "a-traiter" }),
        icon: <ShieldCheck aria-hidden="true" />,
        keywords: ["modération", "valider"],
      });
    }
    // Existing permission model: only ADMINISTRATEUR can act (useSession().canAct).
    if (role === "ADMINISTRATEUR") {
      out.push({
        id: "action:emergency",
        label: "Nouveau message prioritaire",
        group: "Actions",
        href: routes.admin.emergencies(),
        icon: <Siren aria-hidden="true" />,
        keywords: ["urgence", "alerte"],
      });
      out.push(
        {
          id: "action:new-staff",
          label: "Créer un compte d'équipe",
          group: "Actions",
          href: routes.admin.users({ onglet: "equipe" }),
          icon: <UsersRound aria-hidden="true" />,
          keywords: ["utilisateur", "opérateur", "superviseur"],
        },
        {
          id: "action:ai-rules",
          label: "Gérer les règles IA",
          group: "Actions",
          href: routes.admin.aiRules(),
          icon: <ListChecks aria-hidden="true" />,
          keywords: ["mots interdits", "modération"],
        },
      );
    }
    if (canListAllCampaigns(role)) {
      out.push({
        id: "action:conflicts",
        label: "Voir les réservations en conflit",
        group: "Actions",
        href: routes.admin.reservations({ onglet: "conflits" }),
        icon: <CalendarRange aria-hidden="true" />,
        keywords: ["saturé", "capacité", "créneau"],
      });
    }
    out.push({
      id: "action:journal-diffusions",
      label: "Journal des diffusions",
      group: "Actions",
      href: routes.admin.journal({ onglet: "diffusions" }),
      icon: <FileClock aria-hidden="true" />,
      keywords: ["logs", "historique", "diffusion"],
    });
  }
  out.push(
    {
      id: "action:shortcuts",
      label: "Raccourcis clavier",
      group: "Actions",
      run: actions.openShortcuts,
      icon: <Keyboard aria-hidden="true" />,
      shortcut: "shift+?",
    },
    {
      id: "action:logout",
      label: "Se déconnecter",
      group: "Actions",
      run: actions.logout,
      icon: <LogOut aria-hidden="true" />,
      keywords: ["déconnexion", "quitter"],
    },
  );

  if (data) {
    for (const c of data.campaigns) {
      const status = campaignStatusFor(getCampaignDisplayStatus(c), staff ? "staff" : "annonceur");
      out.push({
        id: `campaign:${c.id}`,
        label: staff ? `#${c.id} ${c.name}` : c.name,
        description: status.label,
        group: "Campagnes",
        keywords: [String(c.id), c.objective ?? ""],
        icon: <Megaphone aria-hidden="true" />,
        href: staff ? routes.admin.moderation({ examen: c.id }) : routes.espace.campaign(c.id),
      });
      if (!staff && c.status === "BROUILLON") {
        out.push({
          id: `campaign:${c.id}:finaliser`,
          label: `Finaliser : ${c.name}`,
          description: "Brouillon",
          group: "Campagnes",
          icon: <FileClock aria-hidden="true" />,
          href: routes.espace.wizard(c.id, "porteurs"),
        });
      }
    }
    const zoneName = new Map(data.zones.map((z) => [z.id, z.name]));
    for (const s of data.supports) {
      if (!staff && s.technicalStatus !== "ACTIF") continue;
      const zone = s.zoneName || zoneName.get(s.zoneId) || "";
      out.push({
        id: `porteur:${s.id}`,
        label: staff ? s.name : `Ouvrir le Studio : ${s.name}`,
        description: zone,
        group: "Porteurs",
        keywords: [s.name, zone, s.address ?? ""],
        icon: <MapPin aria-hidden="true" />,
        href: staff
          ? routes.admin.network({ onglet: "ecrans", porteur: s.id })
          : routes.espace.network({ porteur: s.id }),
      });
    }
    for (const z of data.zones) {
      if (!staff && !z.isActive) continue;
      out.push({
        id: `zone:${z.id}`,
        label: z.name,
        group: "Zones",
        icon: <MapPinned aria-hidden="true" />,
        href: staff
          ? routes.admin.network({ onglet: "zones" })
          : routes.espace.network({ zone: z.id }),
      });
    }
  }
  return out;
}

export const GROUP_ORDER = [
  "Cette page",
  "Récents",
  "Navigation",
  "Actions",
  "Campagnes",
  "Porteurs",
  "Zones",
];

/** Pure: filters, ranks and groups (max 8 per group). Empty query → page, récents, navigation, actions. */
export function groupCommands(
  commands: readonly Command[],
  query: string,
  recents: readonly RecentItem[] = [],
  limit = 8,
): { group: string; items: Command[] }[] {
  const q = query.trim();
  const recentCommands: Command[] = q
    ? []
    : recents.map((r) => {
        // Same icon column as the other groups, so every label starts on one vertical line.
        const Icon =
          r.kind === "campagne"
            ? Megaphone
            : r.kind === "porteur"
              ? MapPin
              : r.kind === "zone"
                ? MapPinned
                : FileClock;
        return {
          id: `recent:${r.href}`,
          label: r.label,
          group: "Récents",
          href: r.href,
          icon: <Icon aria-hidden="true" />,
        };
      });
  const all = [...recentCommands, ...commands];
  const groups = new Map<string, Command[]>();
  for (const cmd of all) {
    if (!q && !["Cette page", "Récents", "Navigation", "Actions"].includes(cmd.group)) continue;
    const list = groups.get(cmd.group) ?? [];
    list.push(cmd);
    groups.set(cmd.group, list);
  }
  const ordered = [...groups.keys()].sort((a, b) => {
    const ia = GROUP_ORDER.indexOf(a);
    const ib = GROUP_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return ordered
    .map((group) => ({
      group,
      items: rankItems(
        (groups.get(group) ?? []).map((c) => ({
          ...c,
          keywords: [...(c.keywords ?? []), c.description ?? ""],
        })),
        q,
        limit,
      ),
    }))
    .filter((g) => g.items.length > 0);
}

// ---------------------------------------------------------------------------
// Provider + dialog
// ---------------------------------------------------------------------------

export function CommandPaletteProvider({
  children,
  onOpenShortcuts,
  moderationCount,
}: {
  children: ReactNode;
  onOpenShortcuts?: () => void;
  moderationCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState("");
  const [pageCommands, setPageCommands] = useState<Record<string, readonly Command[]>>({});

  const value = useMemo<PaletteContextValue>(
    () => ({
      open: (query = "") => {
        setInitialQuery(query);
        setOpen(true);
      },
      close: () => setOpen(false),
      register: (id, commands) => setPageCommands((prev) => ({ ...prev, [id]: commands })),
      unregister: (id) =>
        setPageCommands((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        }),
    }),
    [],
  );

  const { openHelp } = useShortcutsHelp();

  useShortcut("mod+k", () => setOpen((o) => !o), {
    description: "Ouvrir la recherche et les commandes",
    section: "Partout",
    allowInEditable: true,
    allowInDialog: true,
  });
  useShortcut(
    "/",
    () => {
      if (!focusPageSearch()) value.open();
    },
    { description: "Rechercher dans la page (ou ouvrir la recherche)", section: "Partout" },
  );

  return (
    <PaletteContext.Provider value={value}>
      {children}
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        initialQuery={initialQuery}
        pageCommands={Object.values(pageCommands).flat()}
        onOpenShortcuts={onOpenShortcuts ?? openHelp}
        moderationCount={moderationCount}
      />
    </PaletteContext.Provider>
  );
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
  pageCommands?: readonly Command[];
  onOpenShortcuts: () => void;
  moderationCount?: number;
}

export function CommandPalette({
  open,
  onOpenChange,
  initialQuery = "",
  pageCommands = [],
  onOpenShortcuts,
  moderationCount,
}: CommandPaletteProps) {
  const session = useSession();
  const guard = useNavigationGuard();
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const [load, setLoad] = useState<LoadState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const baseId = `cp${useId().replace(/:/g, "")}`;
  const listRef = useRef<HTMLDivElement>(null);
  const role = session.role;
  const userId = session.user.userId;

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setActive(0);
    setRecents(readRecents(userId));
  }, [open, initialQuery, userId]);

  // Lazy data load on first open (and on « Réessayer »).
  const loaded = load.status === "ready";
  useEffect(() => {
    if (!open || loaded) return;
    const controller = new AbortController();
    setLoad({ status: "loading" });
    loadPaletteData(role, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setLoad({ status: "ready", data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ status: "error" });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, role, attempt]);

  const commands = useMemo(
    () => [
      ...pageCommands.map((c) => ({ ...c, group: "Cette page" })),
      ...buildCommands({
        role,
        data: load.status === "ready" ? load.data : null,
        moderationCount,
        actions: {
          openShortcuts: onOpenShortcuts,
          logout: () => void session.logout(),
        },
      }),
    ],
    [pageCommands, role, load, moderationCount, onOpenShortcuts, session],
  );

  const groups = useMemo(() => groupCommands(commands, query, recents), [commands, query, recents]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const activeIndex = Math.min(active, Math.max(0, flat.length - 1));
  const activeItem = flat[activeIndex];
  const optionId = (cmd: Command) => `${baseId}-opt-${cmd.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!activeItem) return;
    const el = document.getElementById(optionId(activeItem));
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItem]);

  const execute = (cmd: Command, newTab = false) => {
    onOpenChange(false);
    if (cmd.href) {
      const kind: RecentItem["kind"] | null = cmd.id.startsWith("campaign:")
        ? "campagne"
        : cmd.id.startsWith("porteur:")
          ? "porteur"
          : cmd.id.startsWith("zone:")
            ? "zone"
            : null;
      if (kind)
        pushRecent(userId, {
          label: cmd.label.replace(/^Ouvrir le Studio : /, ""),
          href: cmd.href,
          kind,
        });
      void guard.confirmNavigation(cmd.href, { newTab });
    } else {
      cmd.run?.();
    }
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (flat.length === 0 ? 0 : (i + 1) % flat.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (flat.length === 0 ? 0 : (i - 1 + flat.length) % flat.length));
    } else if (e.key === "Home" && e.ctrlKey) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "Enter") {
      if (!activeItem) return;
      e.preventDefault();
      execute(activeItem, (e.metaKey || e.ctrlKey) && Boolean(activeItem.href));
    }
  };

  const listboxId = `${baseId}-list`;
  const dataGroupsPending = Boolean(query.trim()) && load.status === "loading";

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-(--z-modal) animate-fade-in bg-scrim" />
        <RadixDialog.Content
          data-command-palette=""
          aria-describedby={undefined}
          className="fixed inset-0 z-(--z-modal) flex animate-panel-in flex-col overflow-hidden bg-surface focus:outline-none sm:inset-x-4 sm:top-[12vh] sm:bottom-auto sm:mx-auto sm:max-h-[70vh] sm:max-w-xl sm:rounded-panel sm:border sm:border-line-strong sm:shadow-card"
        >
          <RadixDialog.Title className="sr-only">Recherche et commandes</RadixDialog.Title>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search aria-hidden="true" className="size-5 shrink-0 text-muted" />
            <input
              role="combobox"
              aria-expanded={flat.length > 0}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={activeItem ? optionId(activeItem) : undefined}
              aria-label="Rechercher une page, une campagne, un Porteur ou une zone"
              placeholder="Campagne, Porteur, zone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="off"
              spellCheck={false}
              className="min-h-14 w-full bg-transparent text-base text-ink placeholder:text-muted-2 focus:outline-none"
            />
            <RadixDialog.Close
              aria-label="Fermer la recherche"
              className="inline-flex min-h-11 items-center rounded-control px-2 text-[0.8125rem] text-muted hover:bg-overlay-hover hover:text-ink"
            >
              <span aria-hidden="true" className="sm:hidden">
                Fermer
              </span>
              <span aria-hidden="true" className="hidden sm:inline">
                <Kbd>Échap</Kbd>
              </span>
            </RadixDialog.Close>
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
            <div id={listboxId} role="listbox" aria-label="Résultats">
              {groups.map((g) => {
                const headingId = `${baseId}-g-${g.group.replace(/[^a-zA-Z]/g, "")}`;
                return (
                  <div key={g.group} role="group" aria-labelledby={headingId} className="mb-2">
                    <p
                      id={headingId}
                      className="px-3 pt-2 pb-1 text-xs font-medium text-muted"
                      role="presentation"
                    >
                      {g.group}
                    </p>
                    {g.items.map((cmd) => {
                      const index = flat.indexOf(cmd);
                      const selected = index === activeIndex;
                      const shortcut: string | undefined =
                        typeof cmd.shortcut === "string" ? cmd.shortcut : cmd.shortcut?.[0];
                      return (
                        // Combobox pattern: focus stays in the input (aria-activedescendant); the
                        // input handles the keyboard, the option only needs pointer support.
                        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
                        <div
                          key={cmd.id}
                          id={optionId(cmd)}
                          role="option"
                          aria-selected={selected}
                          onMouseMove={() => setActive(index)}
                          onClick={(e) =>
                            execute(cmd, (e.metaKey || e.ctrlKey) && Boolean(cmd.href))
                          }
                          className={cx(
                            "flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2 text-sm [&_svg]:size-4 [&_svg]:shrink-0",
                            selected ? "bg-overlay-strong text-ink-strong" : "text-ink-soft",
                          )}
                        >
                          <span className="text-muted">{cmd.icon}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{cmd.label}</span>
                            {cmd.description ? (
                              <span className="block truncate text-xs text-muted">
                                {cmd.description}
                              </span>
                            ) : null}
                          </span>
                          {typeof shortcut === "string" ? (
                            <Kbd keys={shortcut} className="hidden sm:inline-flex" />
                          ) : null}
                          {selected ? (
                            <CornerDownLeft
                              aria-hidden="true"
                              className="hidden text-muted sm:block"
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {dataGroupsPending ? (
              <div role="status" className="flex flex-col gap-2 px-3 py-2">
                <span className="sr-only">Chargement des résultats…</span>
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-4/5" />
              </div>
            ) : null}
            {load.status === "error" ? (
              <p role="status" className="px-3 py-2 text-[0.8125rem] text-warning">
                Recherche indisponible ·{" "}
                <button
                  type="button"
                  onClick={() => setAttempt((n) => n + 1)}
                  className="font-semibold text-brand-blue-text underline-offset-4 hover:underline"
                >
                  Réessayer
                </button>
              </p>
            ) : null}
            {flat.length === 0 && !dataGroupsPending ? (
              <p role="status" className="px-3 py-6 text-center text-sm text-muted">
                Aucun résultat pour « {query.trim()} ».
              </p>
            ) : null}
          </div>
          <div className="hidden items-center gap-4 border-t border-line px-4 py-2 text-xs text-muted sm:flex">
            <span className="inline-flex items-center gap-1.5">
              <Kbd keys="arrowup" /> <Kbd keys="arrowdown" /> naviguer
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd keys="enter" /> ouvrir
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd keys="mod+enter" /> nouvel onglet
            </span>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
