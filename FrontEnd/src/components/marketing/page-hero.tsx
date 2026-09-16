import { ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export interface PageHeroProps {
  eyebrow?: string;
  /** First part of the h1. */
  title: ReactNode;
  /** Gradient second half of the h1. */
  highlight?: ReactNode;
  /** Put the highlight on its own line (masked line rise). */
  breakBeforeHighlight?: boolean;
  lede?: ReactNode;
  /** CTA buttons. */
  actions?: ReactNode;
  /** Small reassurance line under the actions. */
  note?: ReactNode;
  /** Background photo. Omit for a quiet, image-less hero (legal pages). */
  image?: { src: string; alt?: string; position?: string };
  /** Right column (e.g. <BroadcastScreen/>); switches to a two-column layout on lg. */
  aside?: ReactNode;
  breadcrumbs?: readonly { label: string; href?: string }[];
  /** full = min 88svh (home) · default = inner page · compact = legal/simple pages */
  size?: "full" | "default" | "compact";
  /** Content pinned at the bottom of the hero (e.g. <StatBand variant="overlay"/>). */
  bottom?: ReactNode;
  className?: string;
}

const PADDING = {
  full: "min-h-[88svh] pt-[calc(var(--header-h)+clamp(48px,9vh,110px))] pb-[clamp(56px,8vh,96px)]",
  default: "pt-[calc(var(--header-h)+clamp(56px,9vw,120px))] pb-[clamp(56px,7vw,96px)]",
  compact: "pt-[calc(var(--header-h)+clamp(40px,6vw,72px))] pb-[clamp(36px,5vw,56px)]",
} as const;

/**
 * Marketing hero with the page's single h1. Reserves the header height (the header overlays it).
 * CSS-only entrance (visible without JS, static under reduced motion).
 */
export function PageHero({
  eyebrow,
  title,
  highlight,
  breakBeforeHighlight = true,
  lede,
  actions,
  note,
  image,
  aside,
  breadcrumbs,
  size = "default",
  bottom,
  className,
}: PageHeroProps) {
  return (
    <section className={cx("relative isolate flex flex-col overflow-hidden", className)}>
      {image ? (
        <div className="absolute inset-0 -z-10" aria-hidden={image.alt ? undefined : true}>
          <Image
            src={image.src}
            alt={image.alt ?? ""}
            fill
            priority
            sizes="100vw"
            className="ken-burns object-cover"
            style={image.position ? { objectPosition: image.position } : undefined}
          />
          <div className="bg-scrim-v absolute inset-0" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-bg)_70%,transparent),transparent_70%)]" />
          <div className="pixel-grid absolute inset-0 opacity-35 mix-blend-overlay" />
        </div>
      ) : (
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(70%_60%_at_85%_0%,var(--color-red-soft),transparent_65%),radial-gradient(60%_60%_at_0%_20%,var(--color-blue-soft),transparent_60%)]" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,var(--color-line-strong),transparent)]" />
        </div>
      )}

      <div className={cx("container-site flex flex-1 flex-col justify-center", PADDING[size])}>
        <div
          className={cx(
            aside
              ? "grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16 [&>*]:min-w-0"
              : "",
          )}
        >
          <div className={cx("flex flex-col gap-6", !aside && "max-w-[860px]")}>
            {breadcrumbs && breadcrumbs.length > 0 ? (
              <nav aria-label="Fil d'Ariane" className="enter">
                <ol className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] text-muted">
                  {breadcrumbs.map((b, i) => (
                    <li key={`${b.label}-${i}`} className="flex items-center gap-1.5">
                      {b.href ? (
                        <Link href={b.href} className="transition-colors hover:text-ink">
                          {b.label}
                        </Link>
                      ) : (
                        <span aria-current="page" className="text-ink-soft">
                          {b.label}
                        </span>
                      )}
                      {i < breadcrumbs.length - 1 ? (
                        <ChevronRight aria-hidden="true" className="size-3 opacity-60" />
                      ) : null}
                    </li>
                  ))}
                </ol>
              </nav>
            ) : null}
            {eyebrow ? (
              <p className="enter enter-1 eyebrow eyebrow-pill w-fit max-w-full">{eyebrow}</p>
            ) : null}
            <h1
              className={cx(
                "font-display text-ink-strong",
                size === "compact"
                  ? "text-h1"
                  : aside
                    ? "text-[clamp(2.4rem,5vw,4.25rem)] leading-[1.04] font-bold tracking-[-0.025em]"
                    : "text-display",
              )}
            >
              <span className="line-mask">
                <span style={{ ["--enter-delay" as string]: "120ms" }}>{title}</span>
              </span>
              {highlight ? (
                breakBeforeHighlight ? (
                  <span className="line-mask">
                    <span style={{ ["--enter-delay" as string]: "240ms" }}>
                      <span className="text-gradient">{highlight}</span>
                    </span>
                  </span>
                ) : (
                  <>
                    {" "}
                    <span className="text-gradient">{highlight}</span>
                  </>
                )
              ) : null}
            </h1>
            {lede ? (
              <p className="enter enter-3 max-w-[60ch] text-lead text-ink-soft">{lede}</p>
            ) : null}
            {actions ? (
              <div className="enter enter-4 mt-2 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap min-[420px]:items-center">
                {actions}
              </div>
            ) : null}
            {note ? <p className="enter enter-4 text-[0.8125rem] text-muted">{note}</p> : null}
          </div>
          {aside ? <div className="enter enter-3">{aside}</div> : null}
        </div>
      </div>

      {bottom ? <div className="relative">{bottom}</div> : null}
    </section>
  );
}
