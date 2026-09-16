"use client";

import {
  CalendarRange,
  Ellipsis,
  Gauge,
  LayoutDashboard,
  MapPinned,
  Megaphone,
  ShieldCheck,
  Siren,
} from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { badgeAriaLabel, type NavBadges } from "@/components/shell/nav-badges";
import { useNavigationGuard } from "@/components/shell/navigation-guard";
import {
  ACCOUNT_NAV,
  type AppNavIcon,
  type AppNavItem,
  isNavActive,
  isTabBarHidden,
  tabItems,
} from "@/content/nav";
import { cx } from "@/lib/cx";

const ICONS: Partial<Record<AppNavIcon, typeof LayoutDashboard>> = {
  dashboard: LayoutDashboard,
  campaigns: Megaphone,
  reservations: CalendarRange,
  network: MapPinned,
  overview: Gauge,
  moderation: ShieldCheck,
  emergency: Siren,
};

/** Tab bar height without the safe area (the CSS variable adds it). */
export const TAB_BAR_HEIGHT = 56;
export const BOTTOM_BAR_VAR = "--bottom-bar-h";

export interface MobileTabBarProps {
  items: readonly AppNavItem[];
  pathname: string;
  badges?: NavBadges;
  /** « Plus » opens the navigation drawer. */
  onMore: () => void;
  moreExpanded?: boolean;
  /** Admin keeps the blue context accent (IA-24); the espace uses orange. */
  variant?: "espace" | "admin";
}

/**
 * « Plus » is current only on routes it actually holds: nav items without a tab slot
 * (Statistiques) and the account pages (Profil). An unknown URL (404) highlights nothing.
 */
export function isMoreActive(items: readonly AppNavItem[], pathname: string): boolean {
  const tabs = tabItems(items);
  if (tabs.some((t) => isNavActive(pathname, t))) return false;
  const held = [...items.filter((i) => !i.tab), ...ACCOUNT_NAV].filter((i) =>
    i.href.startsWith(tabs[0]?.href ?? "/"),
  );
  return held.some((i) => isNavActive(pathname, i));
}

/** True when the bar renders for this pathname (hidden on /espace/reseau and the wizard). */
export function tabBarVisible(pathname: string): boolean {
  return !isTabBarHidden(pathname);
}

/**
 * Mobile bottom tab bar below lg (UX-PLAN §3.2, IA-11): 4 items + « Plus », 44px targets,
 * safe-area padding, aria-current, badge dots. Publishes `--bottom-bar-h` on <html>.
 */
export function MobileTabBar({
  items,
  pathname,
  badges = {},
  onMore,
  moreExpanded,
  variant = "espace",
}: MobileTabBarProps) {
  const guard = useNavigationGuard();
  const visible = tabBarVisible(pathname);
  const tabs = tabItems(items);
  const moreActive = isMoreActive(items, pathname);
  const activeText = variant === "admin" ? "text-brand-blue-text" : "text-brand-orange-text";

  useEffect(() => {
    const root = document.documentElement;
    const mq =
      typeof window.matchMedia === "function" ? window.matchMedia("(min-width: 65rem)") : null;
    const apply = () => {
      const shown = visible && !(mq?.matches ?? false);
      root.style.setProperty(
        BOTTOM_BAR_VAR,
        shown ? `calc(${TAB_BAR_HEIGHT}px + env(safe-area-inset-bottom))` : "0px",
      );
    };
    apply();
    mq?.addEventListener?.("change", apply);
    return () => {
      mq?.removeEventListener?.("change", apply);
      root.style.setProperty(BOTTOM_BAR_VAR, "0px");
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-(--z-sticky) border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid h-14 max-w-xl grid-cols-5">
        {tabs.map((item) => {
          const Icon = ICONS[item.icon] ?? LayoutDashboard;
          const active = isNavActive(pathname, item);
          const count = item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0;
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  void guard.confirmNavigation(item.href);
                }}
                className={cx(
                  "relative flex min-h-11 w-full flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors",
                  active ? activeText : "text-muted hover:text-ink",
                )}
              >
                <span className="relative">
                  <Icon aria-hidden="true" className="size-5" />
                  {count > 0 && item.badgeKey ? (
                    <span className="absolute -top-1 -right-2 inline-flex min-w-4 items-center justify-center rounded-full bg-brand-orange px-1 text-xs leading-4 font-bold text-on-orange tabular">
                      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
                      <span className="sr-only">{`, ${badgeAriaLabel(item.badgeKey, count)}`}</span>
                    </span>
                  ) : null}
                </span>
                <span>{item.tab?.label ?? item.label}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex">
          <button
            type="button"
            onClick={onMore}
            aria-expanded={moreExpanded}
            aria-haspopup="dialog"
            aria-current={moreActive ? "page" : undefined}
            className={cx(
              "flex min-h-11 w-full flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors",
              moreActive ? activeText : "text-muted hover:text-ink",
            )}
          >
            <Ellipsis aria-hidden="true" className="size-5" />
            <span>Plus</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
