import type { ReactNode } from "react";

import { ImageFrame, type ImageRatio } from "@/components/marketing/image-frame";
import { Reveal } from "@/components/marketing/reveal";
import { cx } from "@/lib/cx";

export interface FeatureSplitProps {
  eyebrow?: string;
  title: ReactNode;
  highlight?: ReactNode;
  lede?: ReactNode;
  /** Bullets, cards, links… rendered under the lede. */
  children?: ReactNode;
  actions?: ReactNode;
  image: {
    src: string;
    alt: string;
    ratio?: ImageRatio;
    /** Chip on the image, e.g. « Illustration ». */
    label?: string;
    position?: string;
  };
  /** Image on the left instead of the right. */
  reverse?: boolean;
  /** Replace the image with custom media (e.g. <BroadcastScreen/>). */
  media?: ReactNode;
  headingId?: string;
  headingAs?: "h2" | "h3";
  className?: string;
}

/** Image + text split (1.05fr / .95fr), reversible, reveal left/right. */
export function FeatureSplit({
  eyebrow,
  title,
  highlight,
  lede,
  children,
  actions,
  image,
  reverse = false,
  media,
  headingId,
  headingAs = "h2",
  className,
}: FeatureSplitProps) {
  const Heading = headingAs;
  return (
    <div
      className={cx(
        "grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 xl:gap-20 [&>*]:min-w-0",
        reverse && "lg:grid-cols-[0.95fr_1.05fr]",
        className,
      )}
    >
      <Reveal
        variant={reverse ? "right" : "left"}
        className={cx("flex flex-col gap-5", reverse && "lg:order-2")}
      >
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <Heading id={headingId} className="font-display text-h2 text-ink-strong">
          {title}
          {highlight ? (
            <>
              {" "}
              <span className="text-gradient">{highlight}</span>
            </>
          ) : null}
        </Heading>
        {lede ? <p className="max-w-[58ch] text-lead text-muted">{lede}</p> : null}
        {children ? <div className="mt-2">{children}</div> : null}
        {actions ? <div className="mt-3 flex flex-wrap gap-3">{actions}</div> : null}
      </Reveal>
      <Reveal
        variant={reverse ? "left" : "right"}
        delay={120}
        className={cx(reverse && "lg:order-1")}
      >
        {media ?? (
          <ImageFrame
            src={image.src}
            alt={image.alt}
            ratio={image.ratio ?? "4/3"}
            label={image.label}
            objectPosition={image.position}
            sizes="(min-width: 1040px) 48vw, 100vw"
            scrim="soft"
            className="shadow-card"
          />
        )}
      </Reveal>
    </div>
  );
}

/** Check-style bullet list for feature splits. */
export function FeatureList({
  items,
  className,
}: {
  items: readonly ReactNode[];
  className?: string;
}) {
  return (
    <ul className={cx("grid gap-3 sm:grid-cols-2", className)}>
      {items.map((item, i) => (
        <li
          key={i}
          className="flex items-start gap-3 rounded-control border border-line bg-white/[0.02] px-4 py-3 text-[0.9375rem] leading-snug text-ink-soft transition-[transform,border-color] duration-300 ease-smooth hover:translate-x-1 hover:border-orange-line"
        >
          <span
            aria-hidden="true"
            className="mt-[0.4em] size-1.5 shrink-0 rounded-full bg-grad-brand"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
