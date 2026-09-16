import type { ReactNode } from "react";

import { Reveal } from "@/components/marketing/reveal";
import { cx } from "@/lib/cx";

export interface SectionHeaderProps {
  /** 2–3 words, uppercase tracked with the red→orange dash. */
  eyebrow?: string;
  /** First part of the headline. */
  title: ReactNode;
  /** Second part rendered with the animated gradient (never the whole headline). */
  highlight?: ReactNode;
  /** Put the highlight on its own line. */
  breakBeforeHighlight?: boolean;
  /** One-sentence lede. */
  lede?: ReactNode;
  /**
   * left = editorial left · center = centred (no dash) ·
   * split = title left, lede + actions right with an orange hairline (desktop)
   */
  align?: "left" | "center" | "split";
  /** Heading level (h2 by default; h1 only for page heroes). */
  as?: "h1" | "h2" | "h3";
  /** display (hero) · lg (default h2) · md (sub-sections) */
  size?: "display" | "lg" | "md";
  /** Heading id (use with <Section labelledBy>). */
  id?: string;
  actions?: ReactNode;
  /** Wrap in a Reveal (blur) — default true. */
  reveal?: boolean;
  className?: string;
}

const SIZE = {
  display: "text-display",
  lg: "text-h2",
  md: "text-h3",
} as const;

export function SectionHeader({
  eyebrow,
  title,
  highlight,
  breakBeforeHighlight = false,
  lede,
  align = "left",
  as = "h2",
  size,
  id,
  actions,
  reveal = true,
  className,
}: SectionHeaderProps) {
  const Heading = as;
  const headingSize = size ?? (as === "h1" ? "display" : as === "h3" ? "md" : "lg");
  const centered = align === "center";

  const heading = (
    <Heading id={id} className={cx("font-display text-ink-strong", SIZE[headingSize])}>
      {title}
      {highlight ? (
        <>
          {breakBeforeHighlight ? <br /> : " "}
          <span className="text-gradient">{highlight}</span>
        </>
      ) : null}
    </Heading>
  );

  const eyebrowEl = eyebrow ? (
    <p className={cx("eyebrow", centered && "eyebrow-plain justify-center")}>{eyebrow}</p>
  ) : null;

  const ledeEl = lede ? (
    <p className={cx("text-lead text-muted", centered && "mx-auto", "max-w-[62ch]")}>{lede}</p>
  ) : null;

  const body =
    align === "split" ? (
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:gap-16">
        <div className="flex flex-col gap-4">
          {eyebrowEl}
          {heading}
        </div>
        {ledeEl || actions ? (
          <div className="flex flex-col gap-5 lg:border-l lg:border-orange-line lg:pl-8">
            {ledeEl}
            {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
          </div>
        ) : null}
      </div>
    ) : (
      <div
        className={cx(
          "flex flex-col gap-4",
          centered ? "mx-auto max-w-[780px] items-center text-center" : "max-w-[780px]",
        )}
      >
        {eyebrowEl}
        {heading}
        {ledeEl}
        {actions ? (
          <div className={cx("mt-2 flex flex-wrap gap-3", centered && "justify-center")}>
            {actions}
          </div>
        ) : null}
      </div>
    );

  const wrapperClass = cx("mb-12 sm:mb-14", className);
  return reveal ? (
    <Reveal variant="blur" className={wrapperClass}>
      {body}
    </Reveal>
  ) : (
    <div className={wrapperClass}>{body}</div>
  );
}
