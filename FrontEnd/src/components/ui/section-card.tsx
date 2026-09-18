import type { LucideIcon } from "lucide-react";
import { type ReactNode, useId } from "react";

import { cx } from "@/lib/cx";

export interface SectionCardProps {
  icon?: LucideIcon;
  title: ReactNode;
  /** One line under the title. */
  description?: ReactNode;
  /** Right side of the header (pill, link, small action). */
  aside?: ReactNode;
  footer?: ReactNode;
  id?: string;
  as?: "section" | "div";
  /** Heading level (default h2). */
  headingAs?: "h2" | "h3";
  padding?: "md" | "sm" | "none";
  children?: ReactNode;
  className?: string;
}

/**
 * The single card header recipe (VD-20): 36px icon tile + 17px title + optional description
 * and aside. `as="section"` is labelled by its heading.
 */
export function SectionCard({
  icon: Icon,
  title,
  description,
  aside,
  footer,
  id,
  as = "section",
  headingAs = "h2",
  padding = "md",
  children,
  className,
}: SectionCardProps) {
  const autoId = useId();
  const headingId = `${id ?? `sc${autoId.replace(/:/g, "")}`}-titre`;
  const Tag = as;
  const Heading = headingAs;
  const pad = padding === "none" ? "" : padding === "sm" ? "p-4" : "p-5 sm:p-6";
  return (
    <Tag
      id={id}
      aria-labelledby={as === "section" ? headingId : undefined}
      className={cx("rounded-card border border-line bg-grad-card", pad, className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span
              aria-hidden="true"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-line bg-surface-2 text-ink-soft"
            >
              <Icon className="size-[18px]" />
            </span>
          ) : null}
          {/* min-h matches the icon tile: a title without description sits on its center line. */}
          <div className="flex min-h-9 min-w-0 flex-col justify-center">
            <Heading
              id={headingId}
              className="font-display text-title leading-snug font-semibold text-ink-strong"
            >
              {title}
            </Heading>
            {description ? (
              <p className="mt-0.5 text-sm leading-relaxed text-muted">{description}</p>
            ) : null}
          </div>
        </div>
        {aside ? (
          <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-2">{aside}</div>
        ) : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
      {footer ? (
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5 border-t border-line pt-4">
          {footer}
        </div>
      ) : null}
    </Tag>
  );
}
