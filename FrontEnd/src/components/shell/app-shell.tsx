"use client";

import {
  CalendarRange,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  Gauge,
  LayoutDashboard,
  Lock,
  MapPinned,
  Megaphone,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  Siren,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as RadixDialog } from "radix-ui";
import { type ComponentType, type ReactNode, useEffect, useState } from "react";

import { Logo } from "@/components/brand/logo";
import { AccessNotice } from "@/components/shell/access-notice";
import { BreadcrumbProvider, trailParent, useTrail } from "@/components/shell/breadcrumbs";
import { CommandPaletteProvider, useCommandPalette } from "@/components/shell/command-palette";
import { AccountMenu, HelpMenu } from "@/components/shell/menus";
import { MobileTabBar, tabBarVisible } from "@/components/shell/mobile-tab-bar";
import { badgeAriaLabel, type NavBadges, useNavBadges } from "@/components/shell/nav-badges";
import {
  GuardedLink,
  NavigationGuardProvider,
  useNavigationGuard,
} from "@/components/shell/navigation-guard";
import { SessionExpiredListener } from "@/components/shell/session-expired-listener";
import { SessionExpiryBanner } from "@/components/shell/session-expiry";
import { useSession } from "@/components/shell/session-provider";
import { ShortcutsProvider, useShortcut, useShortcutsHelp } from "@/components/shell/shortcuts";
import { TopbarCtaProvider, useTopbarCtaDemoted } from "@/components/shell/topbar-cta";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ToastProvider } from "@/components/ui/toast";
import {
  ADMIN_NAV,
  type AppNavIcon,
  type AppNavItem,
  ESPACE_NAV,
  groupNav,
  isNavActive,
} from "@/content/nav";
import { ROLE_LABEL } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import { NAV_SEQUENCES } from "@/lib/shortcuts";

const ICONS: Record<AppNavIcon, ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  dashboard: LayoutDashboard,
  campaigns: Megaphone,
  reservations: CalendarRange,
  stats: ChartColumn,
  network: MapPinned,
  profile: UserRound,
  overview: Gauge,
  moderation: ShieldCheck,
  emergency: Siren,
};

export type AppShellVariant = "espace" | "admin";

export interface AppShellProps {
  variant: AppShellVariant;
  children: ReactNode;
}

function navFor(variant: AppShellVariant): readonly AppNavItem[] {
  return variant === "admin" ? ADMIN_NAV : ESPACE_NAV;
}

/** Topbar create CTA (IA-12): "primary" on /espace and /espace/campagnes, "secondary" elsewhere, none in the wizard. */
export function createCtaMode(
  variant: AppShellVariant,
  pathname: string,
): "primary" | "secondary" | null {
  if (variant !== "espace") return null;
  if (
    pathname === "/espace/campagnes/nouvelle" ||
    pathname.startsWith("/espace/campagnes/nouvelle/")
  ) {
    return null;
  }
  return pathname === "/espace" || pathname === "/espace/campagnes" ? "primary" : "secondary";
}

function NavBadge({ item, badges }: { item: AppNavItem; badges: NavBadges }) {
  if (!item.badgeKey) return null;
  const count = badges[item.badgeKey] ?? 0;
  if (count <= 0) return null;
  const tone =
    item.badgeKey === "coherence"
      ? "border-warning/30 bg-warning/12 text-warning"
      : item.badgeKey === "emergencies"
        ? "border-line-strong bg-surface-3 text-ink-soft"
        : "border-orange-line bg-orange-soft text-brand-orange-text";
  return (
    <span
      className={cx(
        "ml-auto inline-flex min-w-6 items-center justify-center rounded-full border px-1.5 text-xs leading-5 font-semibold tabular",
        tone,
      )}
    >
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
      <span className="sr-only">{`, ${badgeAriaLabel(item.badgeKey, count)}`}</span>
    </span>
  );
}

function SidebarNav({
  variant,
  pathname,
  badges,
  onNavigate,
}: {
  variant: AppShellVariant;
  pathname: string;
  badges: NavBadges;
  onNavigate?: () => void;
}) {
  return (
    <nav
      aria-label={
        variant === "admin" ? "Navigation du back-office" : "Navigation de l'espace annonceur"
      }
      className="flex flex-col gap-5"
    >
      {groupNav(navFor(variant)).map((group) => (
        <div key={group.group}>
          {group.group ? (
            <p className="mb-1.5 px-3.5 text-xs font-medium text-muted">{group.group}</p>
          ) : null}
          <ul className="flex flex-col gap-1">
            {group.items.map((item) => {
              const active = isNavActive(pathname, item);
              const Icon = ICONS[item.icon];
              return (
                <li key={item.href}>
                  <GuardedLink
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "group/nav flex min-h-11 items-center gap-3 rounded-control border px-3.5 font-label text-[0.875rem] font-medium transition-[background-color,border-color,color] duration-200",
                      active
                        ? variant === "admin"
                          ? "border-blue-line bg-blue-soft text-brand-blue-text"
                          : "border-orange-line bg-orange-soft text-brand-orange-text"
                        : "border-transparent text-muted hover:bg-overlay-hover hover:text-ink-strong",
                    )}
                  >
                    <Icon
                      aria-hidden
                      className={cx(
                        "size-[18px] shrink-0 transition-colors",
                        active
                          ? variant === "admin"
                            ? "text-brand-blue-text"
                            : "text-brand-orange-text"
                          : "text-muted-2 group-hover/nav:text-ink-soft",
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                    <NavBadge item={item} badges={badges} />
                  </GuardedLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SectionBadge({ variant }: { variant: AppShellVariant }) {
  return (
    <span
      className={cx(
        "rounded-full border px-2 py-0.5 font-label text-xs font-semibold",
        variant === "admin"
          ? "border-blue-line bg-blue-soft text-brand-blue-text"
          : "border-orange-line bg-orange-soft text-brand-orange-text",
      )}
    >
      {variant === "admin" ? "Back-office" : "Annonceur"}
    </span>
  );
}

function SidebarContent({
  variant,
  pathname,
  badges,
  onNavigate,
  closeButton,
}: {
  variant: AppShellVariant;
  pathname: string;
  badges: NavBadges;
  onNavigate?: () => void;
  closeButton?: ReactNode;
}) {
  const { role } = useSession();
  return (
    <div className="flex h-full flex-col gap-5 px-4 pt-4 pb-4">
      <div className="flex min-h-11 items-center gap-2 px-1">
        <Logo href={variant === "admin" ? routes.admin.home() : routes.espace.home()} size="sm" />
        <SectionBadge variant={variant} />
        {closeButton ? <span className="ml-auto">{closeButton}</span> : null}
      </div>
      {variant === "admin" ? (
        <p className="-mt-2 px-1 text-xs text-muted">{ROLE_LABEL[role]}</p>
      ) : null}

      <div aria-hidden="true" className="hairline" />

      <div className="flex-1 overflow-y-auto">
        <SidebarNav variant={variant} pathname={pathname} badges={badges} onNavigate={onNavigate} />
      </div>

      <AccountMenu variant={variant} onNavigate={onNavigate} />
    </div>
  );
}

function Trail() {
  const trail = useTrail();
  if (trail.length === 0) return null;
  return (
    <nav aria-label="Fil d'Ariane" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 font-label text-[0.875rem]">
        {trail.map((item, i) => {
          const last = i === trail.length - 1;
          return (
            <li
              key={`${item.label}-${i}`}
              className={cx("flex min-w-0 items-center gap-1.5", !last && "shrink-0")}
            >
              {!last && item.href ? (
                <GuardedLink
                  href={item.href}
                  className="max-w-[16rem] truncate rounded-sm text-muted transition-colors hover:text-ink"
                >
                  {item.label}
                </GuardedLink>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  title={item.label}
                  className={cx("truncate", last ? "font-semibold text-ink-strong" : "text-muted")}
                >
                  {item.label}
                </span>
              )}
              {!last ? (
                <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-2" />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function BackOrLogo({ variant }: { variant: AppShellVariant }) {
  const trail = useTrail();
  const parent = trailParent(trail);
  if (parent?.href) {
    return (
      <GuardedLink
        href={parent.href}
        className="-ml-1 inline-flex min-h-11 max-w-[45vw] items-center gap-1 rounded-control px-2 font-label text-[0.875rem] font-medium text-ink-soft transition-colors hover:bg-overlay-hover hover:text-ink lg:hidden"
      >
        <ChevronLeft aria-hidden="true" className="size-5 shrink-0" />
        <span className="truncate">
          <span className="sr-only">Retour à </span>
          {parent.label}
        </span>
      </GuardedLink>
    );
  }
  return (
    <div className="lg:hidden">
      <Logo
        variant="mark"
        size="sm"
        href={variant === "admin" ? routes.admin.home() : routes.espace.home()}
      />
    </div>
  );
}

function SearchTrigger() {
  const { open } = useCommandPalette();
  return (
    <>
      <button
        type="button"
        onClick={() => open()}
        className="hidden min-h-10 min-w-[13rem] items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-[0.8125rem] text-muted transition-colors hover:border-muted-2 hover:text-ink sm:inline-flex"
      >
        <Search aria-hidden="true" className="size-4" />
        <span className="flex-1 text-left">Rechercher…</span>
        <Kbd keys="mod+k" />
      </button>
      <button
        type="button"
        onClick={() => open()}
        aria-label="Rechercher"
        className="inline-flex size-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-overlay-hover sm:hidden"
      >
        <Search aria-hidden="true" className="size-5" />
      </button>
    </>
  );
}

function GlobalShortcuts({ variant, pathname }: { variant: AppShellVariant; pathname: string }) {
  const guard = useNavigationGuard();
  const { openHelp } = useShortcutsHelp();
  const sequences = NAV_SEQUENCES[variant];
  const inWizard = pathname.startsWith("/espace/campagnes/nouvelle");

  useShortcut("shift+?", () => openHelp(), {
    description: "Afficher les raccourcis clavier",
    section: "Partout",
  });
  useShortcut("n", () => void guard.confirmNavigation(routes.espace.wizard(null)), {
    description: "Nouvelle campagne",
    section: "Partout",
    enabled: variant === "espace" && !inWizard,
  });
  return (
    <>
      {sequences.map((s) => (
        <SequenceShortcut key={s.keys} keys={s.keys} label={s.label} href={s.href} />
      ))}
    </>
  );
}

function SequenceShortcut({ keys, label, href }: { keys: string; label: string; href: string }) {
  const guard = useNavigationGuard();
  useShortcut(keys, () => void guard.confirmNavigation(href), {
    description: label,
    section: "Aller à",
  });
  return null;
}

function ShellFrame({
  variant,
  badges,
  children,
}: {
  variant: AppShellVariant;
  badges: NavBadges;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const { role } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const readOnly = variant === "admin" && role !== "ADMINISTRATEUR";
  const ctaDemoted = useTopbarCtaDemoted();
  const baseCta = createCtaMode(variant, pathname);
  const cta = baseCta === "primary" && ctaDemoted ? "secondary" : baseCta;
  const withTabBar = tabBarVisible(pathname);

  return (
    <div className="app-ground min-h-dvh">
      <SessionExpiredListener />
      <AccessNotice variant={variant} />
      <GlobalShortcuts variant={variant} pathname={pathname} />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-(--z-sticky) hidden w-(--sidebar-w) border-r border-line bg-[color-mix(in_srgb,var(--color-surface)_78%,var(--color-bg))] lg:block">
        <SidebarContent variant={variant} pathname={pathname} badges={badges} />
      </aside>

      <div className="flex min-h-dvh flex-col lg:pl-(--sidebar-w)">
        <header
          className={cx(
            "sticky top-0 z-(--z-sticky) border-b border-line bg-bg",
            variant === "admin" && "border-t-2 border-t-brand-blue",
          )}
        >
          <div className="mx-auto flex h-[67px] w-full max-w-[1280px] items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-10">
            <RadixDialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
              <RadixDialog.Trigger
                aria-label="Ouvrir la navigation"
                className="-ml-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-overlay-hover lg:hidden"
              >
                <Menu aria-hidden="true" className="size-5" />
              </RadixDialog.Trigger>
              <RadixDialog.Portal>
                <RadixDialog.Overlay className="fixed inset-0 z-(--z-modal) animate-fade-in bg-scrim lg:hidden" />
                <RadixDialog.Content
                  aria-describedby={undefined}
                  className="fixed inset-y-0 left-0 z-(--z-modal) w-[min(86vw,300px)] animate-drawer-in border-r border-line-strong bg-surface shadow-card focus:outline-none lg:hidden"
                >
                  <RadixDialog.Title className="sr-only">Navigation</RadixDialog.Title>
                  <SidebarContent
                    variant={variant}
                    pathname={pathname}
                    badges={badges}
                    onNavigate={() => setDrawerOpen(false)}
                    closeButton={
                      <RadixDialog.Close
                        aria-label="Fermer la navigation"
                        className="inline-flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-overlay-hover hover:text-ink"
                      >
                        <X aria-hidden="true" className="size-5" />
                      </RadixDialog.Close>
                    }
                  />
                </RadixDialog.Content>
              </RadixDialog.Portal>
            </RadixDialog.Root>

            <BackOrLogo variant={variant} />

            <div className="hidden min-w-0 flex-1 sm:block">
              <Trail />
            </div>
            <div className="flex-1 sm:hidden" />

            <SearchTrigger />

            {readOnly ? (
              <>
                <span className="hidden rounded-full border border-line-strong px-2.5 py-1 font-label text-xs font-semibold whitespace-nowrap text-muted sm:inline-flex">
                  {ROLE_LABEL[role]} · lecture seule
                </span>
                <span
                  role="img"
                  aria-label="Accès en lecture seule"
                  title={`${ROLE_LABEL[role]} · lecture seule`}
                  className="inline-flex size-9 items-center justify-center rounded-full border border-line-strong text-muted sm:hidden"
                >
                  <Lock aria-hidden="true" className="size-4" />
                </span>
              </>
            ) : null}

            <HelpMenu />

            {cta ? (
              <span className={cta === "primary" ? "hidden sm:contents" : "hidden md:contents"}>
                <Button asChild variant={cta} size="sm">
                  <Link href={routes.espace.wizard(null)}>
                    <Plus aria-hidden="true" />
                    {cta === "primary" ? "Nouvelle campagne" : "Créer"}
                    {cta === "secondary" ? <span className="sr-only"> une campagne</span> : null}
                  </Link>
                </Button>
              </span>
            ) : null}
          </div>
          <SessionExpiryBanner />
        </header>

        <main
          id="contenu"
          tabIndex={-1}
          className={cx(
            "mx-auto w-full max-w-[1280px] flex-1 px-4 pt-6 focus:outline-none sm:px-6 lg:px-10 lg:pt-8 lg:pb-24",
            withTabBar ? "pb-[calc(56px+env(safe-area-inset-bottom)+1.5rem)]" : "pb-24",
          )}
        >
          {children}
        </main>
      </div>

      <MobileTabBar
        items={navFor(variant)}
        pathname={pathname}
        badges={badges}
        onMore={() => setDrawerOpen(true)}
        moreExpanded={drawerOpen}
        variant={variant}
      />
    </div>
  );
}

/**
 * Authenticated shell for /espace (variant "espace") and /admin (variant "admin"): sidebar ≥ lg,
 * drawer + bottom tab bar below, sticky opaque topbar (trail, search ⌘K, help, CTA), toasts,
 * navigation guard, command palette, shortcuts, session expiry. Must be rendered inside
 * <SessionProvider>. Pages render their own <PageHeader> (h1).
 */
export function AppShell({ variant, children }: AppShellProps) {
  const pathname = usePathname() ?? "";
  const { role } = useSession();
  const badges = useNavBadges(variant, role);

  return (
    <ToastProvider>
      <NavigationGuardProvider>
        <ShortcutsProvider variant={variant}>
          <BreadcrumbProvider pathname={pathname} section={variant}>
            <CommandPaletteProvider moderationCount={badges.moderation}>
              <TopbarCtaProvider>
                <ShellFrame variant={variant} badges={badges}>
                  {children}
                </ShellFrame>
              </TopbarCtaProvider>
            </CommandPaletteProvider>
          </BreadcrumbProvider>
        </ShortcutsProvider>
      </NavigationGuardProvider>
    </ToastProvider>
  );
}
