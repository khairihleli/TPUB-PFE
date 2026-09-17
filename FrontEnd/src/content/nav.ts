/** Navigation definitions (marketing header/footer, app shells). Icons are lucide names. */
import { GROUP } from "@/content/site";
import type { RoleCode } from "@/lib/api/types";

export interface NavLink {
  label: string;
  href: string;
  external?: boolean;
}

/** Header nav (brief §8.0). */
export const MAIN_NAV: readonly NavLink[] = [
  { label: "Annonceurs", href: "/annonceurs" },
  { label: "Réseau & zones", href: "/reseau" },
  { label: "Fonctionnement", href: "/fonctionnement" },
  { label: "Tarifs", href: "/tarifs" },
  { label: "À propos", href: "/a-propos" },
];

export const HEADER_ACTIONS = {
  login: { label: "Connexion", href: "/connexion" },
  register: { label: "Créer un compte", href: "/inscription" },
  contact: { label: "Contact", href: "/contact" },
} as const;

export interface FooterColumn {
  title: string;
  links: readonly NavLink[];
}

/** Footer link columns. The Contact column (email, phone, city, socials) is rendered by SiteFooter from CONTACT/SOCIAL. */
export const FOOTER_COLUMNS: readonly FooterColumn[] = [
  {
    title: "Plateforme",
    links: [
      { label: "Annonceurs", href: "/annonceurs" },
      { label: "Réseau & zones", href: "/reseau" },
      { label: "Fonctionnement", href: "/fonctionnement" },
      { label: "Tarifs", href: "/tarifs" },
    ],
  },
  {
    title: "Société",
    links: [
      { label: "À propos", href: "/a-propos" },
      { label: "Contact", href: "/contact" },
      { label: "FAQ", href: "/faq" },
      { label: "Espace annonceur", href: "/connexion" },
    ],
  },
  {
    title: "Groupe Tukhnanutha",
    links: [
      { label: "Le groupe", href: GROUP.url, external: true },
      { label: "TPUB dans le groupe", href: GROUP.tpubPage, external: true },
      { label: "Le Porteur", href: GROUP.porteurPage, external: true },
    ],
  },
];

export const LEGAL_NAV: readonly NavLink[] = [
  { label: "Mentions légales", href: "/mentions-legales" },
  { label: "CGU", href: "/cgu" },
  { label: "Confidentialité", href: "/confidentialite" },
  { label: "Cookies", href: "/cookies" },
];

/** Marketing routes (sitemap). */
export const MARKETING_ROUTES: readonly string[] = [
  "/",
  "/annonceurs",
  "/reseau",
  "/fonctionnement",
  "/tarifs",
  "/faq",
  "/a-propos",
  "/contact",
  "/mentions-legales",
  "/confidentialite",
  "/cgu",
  "/cookies",
];

export type AppNavIcon =
  | "dashboard"
  | "campaigns"
  | "reservations"
  | "stats"
  | "network"
  | "profile"
  | "overview"
  | "moderation"
  | "emergency"
  | "users"
  | "journal"
  | "rules";

/** Shell badge sources (computed by useNavBadges from the shared cache). */
export type NavBadgeKey = "drafts" | "moderation" | "coherence" | "emergencies" | "conflicts";

export interface AppNavItem {
  label: string;
  href: string;
  icon: AppNavIcon;
  /** Match only the exact path (for section roots like /espace). */
  exact?: boolean;
  /** Sidebar group heading (« Piloter », « Explorer », « Opérer », « Réseau »). */
  group?: string;
  badgeKey?: NavBadgeKey;
  /** Mobile bottom tab bar slot (items without `tab` live under « Plus »). */
  tab?: { label: string; order: number };
  /** Roles that see the entry (contract §5 F3 role visibility). Absent = every role of the shell. */
  roles?: readonly RoleCode[];
}

const ADMIN_AND_SUPERVISOR: readonly RoleCode[] = ["ADMINISTRATEUR", "SUPERVISEUR"];

export const ESPACE_NAV: readonly AppNavItem[] = [
  {
    label: "Tableau de bord",
    href: "/espace",
    icon: "dashboard",
    exact: true,
    group: "Piloter",
    tab: { label: "Accueil", order: 1 },
  },
  {
    label: "Campagnes",
    href: "/espace/campagnes",
    icon: "campaigns",
    group: "Piloter",
    badgeKey: "drafts",
    tab: { label: "Campagnes", order: 2 },
  },
  {
    label: "Réservations",
    href: "/espace/reservations",
    icon: "reservations",
    group: "Piloter",
    tab: { label: "Réservations", order: 3 },
  },
  { label: "Statistiques", href: "/espace/statistiques", icon: "stats", group: "Piloter" },
  {
    label: "Réseau & Studio 3D",
    href: "/espace/reseau",
    icon: "network",
    group: "Explorer",
    tab: { label: "Réseau", order: 4 },
  },
];

/** Account menu entries (Profil left the main nav, IA-20). */
export const ACCOUNT_NAV: readonly AppNavItem[] = [
  { label: "Profil", href: "/espace/profil", icon: "profile" },
];

export const ADMIN_NAV: readonly AppNavItem[] = [
  {
    label: "Vue d'ensemble",
    href: "/admin",
    icon: "overview",
    exact: true,
    group: "Opérer",
    tab: { label: "Accueil", order: 1 },
  },
  {
    label: "Modération",
    href: "/admin/moderation",
    icon: "moderation",
    group: "Opérer",
    badgeKey: "moderation",
    tab: { label: "Modération", order: 2 },
    roles: ADMIN_AND_SUPERVISOR,
  },
  {
    label: "Réservations",
    href: "/admin/reservations",
    icon: "reservations",
    group: "Opérer",
    badgeKey: "conflicts",
    roles: ADMIN_AND_SUPERVISOR,
  },
  {
    label: "Réseau",
    href: "/admin/reseau",
    icon: "network",
    group: "Réseau",
    badgeKey: "coherence",
    tab: { label: "Réseau", order: 3 },
  },
  {
    label: "Messages prioritaires",
    href: "/admin/urgences",
    icon: "emergency",
    group: "Réseau",
    badgeKey: "emergencies",
    tab: { label: "Urgences", order: 4 },
  },
  { label: "Statistiques", href: "/admin/statistiques", icon: "stats", group: "Analyser" },
  { label: "Journal", href: "/admin/journal", icon: "journal", group: "Analyser" },
  {
    label: "Utilisateurs",
    href: "/admin/utilisateurs",
    icon: "users",
    group: "Administrer",
    roles: ADMIN_AND_SUPERVISOR,
  },
  {
    label: "Règles IA",
    href: "/admin/regles-ia",
    icon: "rules",
    group: "Administrer",
    roles: ADMIN_AND_SUPERVISOR,
  },
];

/** Entries visible to a role (items without `roles` are visible to every role of the shell). */
export function navForRole(items: readonly AppNavItem[], role: RoleCode): AppNavItem[] {
  return items.filter((i) => !i.roles || i.roles.includes(role));
}

/** True when `role` may open `href` (the most specific matching nav entry decides). */
export function roleCanOpen(items: readonly AppNavItem[], role: RoleCode, href: string): boolean {
  const path = href.split("?")[0] ?? href;
  const match = items
    .filter((i) => isNavActive(path, i))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return !match?.roles || match.roles.includes(role);
}

export function isNavActive(pathname: string, item: Pick<AppNavItem, "href" | "exact">): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Groups in declaration order: [{ group: "Piloter", items: [...] }, …]. */
export function groupNav(items: readonly AppNavItem[]): { group: string; items: AppNavItem[] }[] {
  const out: { group: string; items: AppNavItem[] }[] = [];
  for (const item of items) {
    const name = item.group ?? "";
    let bucket = out.find((g) => g.group === name);
    if (!bucket) {
      bucket = { group: name, items: [] };
      out.push(bucket);
    }
    bucket.items.push(item);
  }
  return out;
}

/** Tab bar items sorted by `tab.order` (max 4; « Plus » is added by the shell). */
export function tabItems(items: readonly AppNavItem[]): AppNavItem[] {
  return items
    .filter((i) => i.tab)
    .sort((a, b) => (a.tab?.order ?? 0) - (b.tab?.order ?? 0))
    .slice(0, 4);
}

/** Routes where the mobile tab bar is hidden (they own a bottom bar). */
export const TAB_BAR_HIDDEN_ROUTES: readonly string[] = [
  "/espace/reseau",
  "/espace/campagnes/nouvelle",
];

export function isTabBarHidden(pathname: string): boolean {
  return TAB_BAR_HIDDEN_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}
