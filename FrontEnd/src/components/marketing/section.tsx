import type { ReactNode } from "react";

import { Container, type ContainerSize } from "@/components/marketing/container";
import { cx } from "@/lib/cx";

export interface SectionProps {
  id?: string;
  children: ReactNode;
  /**
   * default = transparent over the aurora · band = subtle raised band with hairlines ·
   * deep = darker ground (bg-2) · glow = soft orange/blue radial tint
   */
  tone?: "default" | "band" | "deep" | "glow";
  /** Vertical rhythm. */
  spacing?: "default" | "tight" | "none";
  /** Top divider. tricolor = the only place red/orange/blue meet (use sparingly). */
  divider?: "none" | "hairline" | "tricolor";
  /** Container width, or false to render children full-bleed. */
  container?: ContainerSize | false;
  /** Id of the heading labelling this section (landmark name). */
  labelledBy?: string;
  className?: string;
  containerClassName?: string;
}

const TONE = {
  default: "",
  band: "border-y border-line bg-surface/35",
  deep: "bg-bg-2",
  glow: "bg-[radial-gradient(55%_60%_at_15%_0%,var(--color-orange-soft),transparent_65%),radial-gradient(50%_55%_at_92%_100%,var(--color-blue-soft),transparent_62%)]",
} as const;

const SPACING = { default: "section-y", tight: "section-y-tight", none: "" } as const;

export function Section({
  id,
  children,
  tone = "default",
  spacing = "default",
  divider = "none",
  container = "default",
  labelledBy,
  className,
  containerClassName,
}: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cx("relative isolate", TONE[tone], SPACING[spacing], className)}
    >
      {divider === "hairline" ? (
        <div aria-hidden="true" className="hairline absolute inset-x-0 top-0" />
      ) : divider === "tricolor" ? (
        <div aria-hidden="true" className="hairline-tricolor absolute inset-x-0 top-0 opacity-80" />
      ) : null}
      {container === false ? (
        children
      ) : (
        <Container size={container} className={containerClassName}>
          {children}
        </Container>
      )}
    </section>
  );
}
