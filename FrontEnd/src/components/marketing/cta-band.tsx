import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { Reveal } from "@/components/marketing/reveal";
import { Button } from "@/components/ui/button";
import { cx } from "@/lib/cx";

export interface CtaLink {
  label: string;
  href: string;
}

export interface CtaBandProps {
  title: ReactNode;
  /** Gradient part of the title (second half). */
  highlight?: ReactNode;
  lede?: ReactNode;
  primary: CtaLink;
  secondary?: CtaLink;
  /** Background photo (local). Defaults to the coastal billboard. */
  image?: { src: string; alt?: string; position?: string } | null;
  /** Small reassurance line under the buttons. */
  note?: ReactNode;
  headingId?: string;
  className?: string;
}

/** Full-bleed closing call-to-action over a scrimmed photo, centred 760px content. */
export function CtaBand({
  title,
  highlight,
  lede,
  primary,
  secondary,
  image = { src: "/images/coastal-billboard.jpg", alt: "" },
  note,
  headingId,
  className,
}: CtaBandProps) {
  return (
    <section
      aria-labelledby={headingId}
      className={cx("relative isolate overflow-hidden border-y border-line", className)}
    >
      {image ? (
        <div aria-hidden={image.alt ? undefined : true} className="absolute inset-0 -z-10">
          <Image
            src={image.src}
            alt={image.alt ?? ""}
            fill
            sizes="100vw"
            className="ken-burns object-cover"
            style={image.position ? { objectPosition: image.position } : undefined}
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-bg)_84%,transparent),color-mix(in_srgb,var(--color-bg)_93%,transparent))]" />
          <div className="absolute inset-0 bg-[radial-gradient(60%_70%_at_50%_100%,var(--color-red-soft),transparent_70%)]" />
          <div className="pixel-grid absolute inset-0 opacity-40 mix-blend-overlay" />
        </div>
      ) : (
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-bg-2">
          <div className="absolute inset-0 bg-[radial-gradient(60%_70%_at_50%_0%,var(--color-orange-soft),transparent_70%)]" />
        </div>
      )}
      <div aria-hidden="true" className="hairline-tricolor absolute inset-x-0 top-0 opacity-70" />

      <div className="container-site py-[clamp(88px,11vw,150px)]">
        <Reveal
          variant="blur"
          className="mx-auto flex max-w-[760px] flex-col items-center gap-5 text-center"
        >
          <h2 id={headingId} className="font-display text-h2 text-ink-strong">
            {title}
            {highlight ? (
              <>
                {" "}
                <span className="text-gradient">{highlight}</span>
              </>
            ) : null}
          </h2>
          {lede ? <p className="max-w-[60ch] text-lead text-ink-soft">{lede}</p> : null}
          <div className="mt-3 flex flex-col items-stretch gap-3 min-[420px]:flex-row min-[420px]:items-center">
            <Button asChild variant="brand" size="lg" wrap>
              <Link href={primary.href}>
                {primary.label}
                <ArrowRight
                  aria-hidden="true"
                  className="transition-transform duration-200 group-hover/btn:translate-x-0.5"
                />
              </Link>
            </Button>
            {secondary ? (
              <Button asChild variant="glass" size="lg" wrap>
                <Link href={secondary.href}>{secondary.label}</Link>
              </Button>
            ) : null}
          </div>
          {note ? <p className="text-[0.8125rem] text-muted">{note}</p> : null}
        </Reveal>
      </div>
    </section>
  );
}
