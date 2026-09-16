import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

import { cx } from "@/lib/cx";

export type GlassCardProps<T extends ElementType = "div"> = {
  as?: T;
  /** Lift + gradient border on hover/focus-within. */
  interactive?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  /** 3px top accent bar. */
  accent?: "none" | "red" | "orange" | "blue" | "brand";
  radius?: "card" | "panel";
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

const PADDING = { none: "", sm: "p-5", md: "p-6 sm:p-7", lg: "p-7 sm:p-10" } as const;
const ACCENT = {
  none: "",
  red: "bg-brand-red",
  orange: "bg-brand-orange",
  blue: "bg-brand-blue",
  brand: "bg-grad-brand",
} as const;

/** Frosted surface (surface 58% + blur 14 + hairline), the signature marketing card. */
export function GlassCard<T extends ElementType = "div">({
  as,
  interactive = false,
  padding = "md",
  accent = "none",
  radius = "card",
  className,
  children,
  ...rest
}: GlassCardProps<T>) {
  const Tag: ElementType = as ?? "div";
  return (
    <Tag
      data-interactive={interactive ? "true" : undefined}
      className={cx(
        "glass-card overflow-hidden",
        radius === "panel" && "rounded-panel",
        PADDING[padding],
        className,
      )}
      {...rest}
    >
      {accent !== "none" ? (
        <span
          aria-hidden="true"
          className={cx("absolute inset-x-0 top-0 h-[3px]", ACCENT[accent])}
        />
      ) : null}
      {children}
    </Tag>
  );
}
