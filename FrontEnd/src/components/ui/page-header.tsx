"use client";

import { ChevronLeft, ChevronRight, Ellipsis } from "lucide-react";
import Link from "next/link";
import { Children, Fragment, isValidElement, type ReactNode } from "react";

import {
  type Breadcrumb,
  useBreadcrumbs,
  useInShellBreadcrumbs,
} from "@/components/shell/breadcrumbs";
import { Button } from "@/components/ui/button";
import { DropdownMenu, type MenuAction } from "@/components/ui/dropdown-menu";
import { cx } from "@/lib/cx";

export type { Breadcrumb } from "@/components/shell/breadcrumbs";

export interface PageHeaderProps {
  /** The page's single h1. */
  title: ReactNode;
  /** Status pill or meta rendered immediately after the h1, same row (VD-20). */
  meta?: ReactNode;
  /** One sentence, max 72ch. */
  description?: ReactNode;
  /** Only when it adds meaning (« CAMP-00007 », « Assistant »), never the area name. */
  eyebrow?: string;
  /** At most one filled primary button. */
  primaryAction?: ReactNode;
  /**
   * ≤ 2 secondary actions. Pass MenuAction[] to let them collapse into the « … » menu below sm;
   * ReactNode stays visible at every width.
   */
  secondaryActions?: ReactNode | readonly MenuAction[];
  /** « … » menu; destructive items (`tone: "danger"`) are rendered last. Client consumers only. */
  overflowActions?: readonly MenuAction[];
  /** Accessible name of the « … » trigger (default « Plus d'actions »). */
  overflowLabel?: string;
  /** @deprecated use primaryAction/secondaryActions; still rendered after them. */
  actions?: ReactNode;
  /** Registers into the topbar trail inside AppShell; rendered inline only outside AppShell. */
  breadcrumbs?: readonly Breadcrumb[];
  /** Outside AppShell: « ‹ Retour » link. Inside AppShell it becomes the trail parent. */
  back?: { href: string; label?: string };
  className?: string;
}

function isMenuActions(value: unknown): value is readonly MenuAction[] {
  return (
    Array.isArray(value) &&
    value.every(
      (v: unknown) => v !== null && typeof v === "object" && !isValidElement(v) && "label" in v,
    )
  );
}

function countNodes(node: ReactNode): number {
  return Children.toArray(node).reduce<number>((n, child) => {
    if (isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment) {
      return n + countNodes(child.props.children);
    }
    return n + 1;
  }, 0);
}

function InlineTrail({ items }: { items: readonly Breadcrumb[] }) {
  return (
    <nav aria-label="Fil d'Ariane">
      <ol className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] text-muted">
        {items.map((b, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${b.label}-${i}`} className="flex items-center gap-1.5">
              {b.href && !last ? (
                <Link href={b.href} className="rounded-sm transition-colors hover:text-ink">
                  {b.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={last ? "text-ink-soft" : undefined}
                >
                  {b.label}
                </span>
              )}
              {!last ? <ChevronRight aria-hidden="true" className="size-3.5 opacity-60" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Header for /espace and /admin pages (UX-PLAN §4.2): h1 + meta on one row, description,
 * actions ordered primary → secondary → overflow (DOM and tab order). More than two actions
 * move to their own row under the title below xl.
 */
export function PageHeader({
  title,
  meta,
  description,
  eyebrow,
  primaryAction,
  secondaryActions,
  overflowActions,
  overflowLabel = "Plus d'actions",
  actions,
  breadcrumbs,
  back,
  className,
}: PageHeaderProps) {
  const inShell = useInShellBreadcrumbs();
  const derivedTrail =
    breadcrumbs ??
    (back && typeof title === "string"
      ? [{ label: back.label ?? "Retour", href: back.href }, { label: title }]
      : null);
  useBreadcrumbs(inShell ? derivedTrail : null);

  const secondaryMenu = isMenuActions(secondaryActions) ? secondaryActions : null;
  const secondaryNode = secondaryMenu ? null : (secondaryActions as ReactNode);
  const overflow = overflowActions ?? [];
  const mobileOverflow = [...(secondaryMenu ?? []), ...overflow];

  const actionCount =
    (primaryAction ? 1 : 0) +
    (secondaryMenu ? secondaryMenu.length : countNodes(secondaryNode)) +
    (overflow.length > 0 ? 1 : 0) +
    countNodes(actions);
  const hasActions = actionCount > 0 || mobileOverflow.length > 0;

  const trigger = (extra?: string) => (
    <Button variant="secondary" aria-label={overflowLabel} className={cx("px-3", extra)}>
      <Ellipsis aria-hidden="true" />
    </Button>
  );

  return (
    <header className={cx("mb-6 flex flex-col gap-4 sm:mb-8", className)}>
      {!inShell && breadcrumbs && breadcrumbs.length > 0 ? (
        <InlineTrail items={breadcrumbs} />
      ) : !inShell && back ? (
        <Link
          href={back.href}
          className="inline-flex min-h-9 w-fit items-center gap-1 rounded-sm text-[0.8125rem] font-medium text-muted transition-colors hover:text-ink"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {back.label ?? "Retour"}
        </Link>
      ) : null}

      {/* Title block and actions share a row while the title keeps at least 22rem; below that the
          actions wrap under it (no fixed breakpoint, so long titles never squeeze to one word). */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-[1_1_22rem]">
          {eyebrow ? <p className="eyebrow mb-2.5">{eyebrow}</p> : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="font-display text-h1 font-semibold text-ink-strong">{title}</h1>
            {meta}
          </div>
          {description ? (
            <p className="mt-2 max-w-[72ch] text-body text-muted">{description}</p>
          ) : null}
        </div>
        {hasActions ? (
          <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2.5">
            {primaryAction}
            {secondaryMenu ? (
              <span className="hidden sm:contents">
                {secondaryMenu.map((a) =>
                  a.href ? (
                    <Button key={a.label} asChild variant="secondary">
                      {a.external ? (
                        <a href={a.href} target="_blank" rel="noopener noreferrer">
                          {a.icon}
                          {a.label}
                        </a>
                      ) : (
                        <Link href={a.href}>
                          {a.icon}
                          {a.label}
                        </Link>
                      )}
                    </Button>
                  ) : (
                    <Button
                      key={a.label}
                      variant={a.tone === "danger" ? "danger" : "secondary"}
                      disabled={a.disabled}
                      onClick={a.onSelect}
                      iconLeft={a.icon}
                    >
                      {a.label}
                    </Button>
                  ),
                )}
              </span>
            ) : (
              secondaryNode
            )}
            {actions}
            {/* ≥ sm: overflow only; < sm: secondary (menu form) + overflow */}
            {overflow.length > 0 ? (
              <span className={secondaryMenu ? "hidden sm:contents" : "contents"}>
                <DropdownMenu trigger={trigger()} items={overflow} />
              </span>
            ) : null}
            {secondaryMenu && mobileOverflow.length > 0 ? (
              <span className="contents sm:hidden">
                <DropdownMenu trigger={trigger()} items={mobileOverflow} />
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
