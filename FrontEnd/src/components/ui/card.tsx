import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

import { cx } from "@/lib/cx";

type CardVariant = "solid" | "glass" | "outline" | "inset";
type CardPadding = "none" | "sm" | "md" | "lg";

export type CardProps<T extends ElementType = "div"> = {
  as?: T;
  /** solid = gradient surface · glass = opaque surface-2 (legacy name) · outline = hairline only · inset = darker well */
  variant?: CardVariant;
  padding?: CardPadding;
  /** Lift + gradient border on hover (use for clickable cards). */
  interactive?: boolean;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

const VARIANT: Record<CardVariant, string> = {
  solid: "border border-line bg-grad-card",
  /** Opaque surface in app areas (no blur, VD-03); the name is kept for compatibility. */
  glass: "border border-line bg-surface-2/95",
  outline: "border border-line bg-transparent",
  inset: "border border-line bg-overlay-inset",
};

const PADDING: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
};

export function Card<T extends ElementType = "div">({
  as,
  variant = "solid",
  padding = "md",
  interactive = false,
  className,
  children,
  ...rest
}: CardProps<T>) {
  const Tag: ElementType = as ?? "div";
  return (
    <Tag
      className={cx(
        "relative rounded-card",
        VARIANT[variant],
        PADDING[padding],
        interactive &&
          "border-glow transition-[transform,border-color,box-shadow] duration-500 ease-expo hover:-translate-y-1 hover:border-line-strong hover:shadow-card focus-within:border-line-strong",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned actions (buttons, links). */
  actions?: ReactNode;
  /** Heading element (default h2). */
  as?: "h2" | "h3" | "h4";
  icon?: ReactNode;
  className?: string;
}

export function CardHeader({
  title,
  description,
  actions,
  as = "h2",
  icon,
  className,
}: CardHeaderProps) {
  const Heading = as;
  return (
    <div className={cx("mb-5 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span
            aria-hidden="true"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-control border border-line bg-surface-2 text-brand-orange-text [&_svg]:size-5"
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <Heading className="font-display text-[1.0625rem] font-semibold leading-snug text-ink-strong">
            {title}
          </Heading>
          {description ? (
            <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
