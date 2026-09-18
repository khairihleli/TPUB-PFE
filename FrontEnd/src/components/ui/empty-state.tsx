import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export interface EmptyStateProps {
  /** lucide icon element, decorative. */
  icon?: ReactNode;
  /** What is empty. Rendered as a paragraph (no heading: level depends on context). */
  title: ReactNode;
  /** Why, and what to do. */
  description?: ReactNode;
  /** ONE clear action (Button / Link). */
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cx(
        "flex flex-col items-center rounded-card border border-dashed border-line-strong bg-overlay-subtle text-center",
        compact ? "gap-2 px-5 py-8" : "gap-3 px-6 py-12 sm:py-16",
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden="true"
          className={cx(
            "mb-1 inline-flex items-center justify-center rounded-full border border-orange-line bg-orange-soft text-brand-orange-text",
            compact ? "size-10 [&_svg]:size-5" : "size-14 [&_svg]:size-6",
          )}
        >
          {icon}
        </span>
      ) : null}
      <p
        className={cx(
          "font-display font-semibold text-ink-strong",
          compact ? "text-base" : "text-lg",
        )}
      >
        {title}
      </p>
      {description ? (
        <p className="max-w-md text-sm leading-relaxed text-muted text-pretty">{description}</p>
      ) : null}
      {action ? <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
