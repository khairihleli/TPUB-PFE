"use client";

/**
 * Single breadcrumb trail (UX-PLAN §3.3, IA-03): pages register their trail, the topbar renders
 * it. The default trail is derived from the pathname and the nav.
 */
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";

import { ACCOUNT_NAV, ADMIN_NAV, type AppNavItem, ESPACE_NAV, isNavActive } from "@/content/nav";

export interface Breadcrumb {
  label: string;
  href?: string;
}

interface Registration {
  id: string;
  items: readonly Breadcrumb[];
}

interface BreadcrumbContextValue {
  register: (id: string, items: readonly Breadcrumb[] | null) => void;
  trail: readonly Breadcrumb[];
  section: "espace" | "admin";
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

function navItems(section: "espace" | "admin"): readonly AppNavItem[] {
  return section === "admin" ? ADMIN_NAV : [...ESPACE_NAV, ...ACCOUNT_NAV];
}

/** Nav item owning the pathname (longest match). */
export function navItemFor(pathname: string, section: "espace" | "admin"): AppNavItem | undefined {
  return navItems(section)
    .filter((item) => isNavActive(pathname, item))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** Default trail from the pathname: [nav item] + a sub-page label for known sub-routes. */
export function defaultTrail(pathname: string, section: "espace" | "admin"): Breadcrumb[] {
  const item = navItemFor(pathname, section);
  if (!item) return [];
  if (pathname === item.href) return [{ label: item.label }];
  const rest = pathname.slice(item.href.length).split("/").filter(Boolean);
  const trail: Breadcrumb[] = [{ label: item.label, href: item.href }];
  if (item.href === "/espace/campagnes") {
    if (rest[0] === "nouvelle") return [...trail, { label: "Nouvelle campagne" }];
    if (rest[0] && /^\d+$/.test(rest[0])) {
      if (rest[1] === "modifier") {
        return [
          ...trail,
          { label: "Campagne", href: `${item.href}/${rest[0]}` },
          { label: "Modifier" },
        ];
      }
      return [...trail, { label: "Campagne" }];
    }
  }
  return [...trail, { label: "Page introuvable" }];
}

export function BreadcrumbProvider({
  pathname,
  section,
  children,
}: {
  pathname: string;
  section: "espace" | "admin";
  children: ReactNode;
}) {
  const [registrations, setRegistrations] = useState<Registration[]>([]);

  const register = useCallback((id: string, items: readonly Breadcrumb[] | null) => {
    setRegistrations((list) => {
      const without = list.filter((r) => r.id !== id);
      return items && items.length > 0 ? [...without, { id, items }] : without;
    });
  }, []);

  const trail = useMemo(() => {
    const latest = registrations[registrations.length - 1];
    return latest ? latest.items : defaultTrail(pathname, section);
  }, [registrations, pathname, section]);

  const value = useMemo(() => ({ register, trail, section }), [register, trail, section]);
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

/** True inside AppShell (PageHeader then registers instead of rendering its trail). */
export function useInShellBreadcrumbs(): boolean {
  return useContext(BreadcrumbContext) !== null;
}

/**
 * `useBreadcrumbs([{ label: "Campagnes", href: routes.espace.campaigns() }, { label: name }])`
 * Sets the topbar trail for the current page; cleared on unmount. The last item is the current
 * page (aria-current). No-op outside AppShell.
 */
export function useBreadcrumbs(items: readonly Breadcrumb[] | null | undefined): void {
  const ctx = useContext(BreadcrumbContext);
  const id = useId();
  const key = items ? JSON.stringify(items) : "";
  const register = ctx?.register;

  useEffect(() => {
    if (!register) return;
    register(id, key ? (JSON.parse(key) as Breadcrumb[]) : null);
  }, [register, id, key]);

  useEffect(() => {
    if (!register) return;
    return () => register(id, null);
  }, [register, id]);
}

/** Current trail (topbar). */
export function useTrail(): readonly Breadcrumb[] {
  return useContext(BreadcrumbContext)?.trail ?? [];
}

/** Parent for the « ‹ Parent » back control: the nearest previous item with an href. */
export function trailParent(trail: readonly Breadcrumb[]): Breadcrumb | null {
  for (let i = trail.length - 2; i >= 0; i--) {
    const item = trail[i];
    if (item?.href) return item;
  }
  return null;
}

/**
 * `useDocumentTitle(campaign?.name ?? null)` → « Ouverture boutique La Marsa — Campagnes — TPUB ».
 * Restores the previous title on unmount.
 */
export function useDocumentTitle(label: string | null | undefined, section?: string): void {
  const ctx = useContext(BreadcrumbContext);
  const first = ctx?.trail[0]?.label;
  const middle = section ?? first;
  useEffect(() => {
    if (!label || typeof document === "undefined") return;
    const previous = document.title;
    const parts = [label, middle && middle !== label ? middle : null, "TPUB"].filter(Boolean);
    document.title = parts.join(" — ");
    return () => {
      document.title = previous;
    };
  }, [label, middle]);
}
