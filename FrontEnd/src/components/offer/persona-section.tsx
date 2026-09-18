import { ArrowRight, CornerDownRight, Info } from "lucide-react";
import Link from "next/link";

import { IconTile } from "@/components/marketing/icon-tile";
import { ImageFrame } from "@/components/marketing/image-frame";
import { Reveal } from "@/components/marketing/reveal";
import { Section, type SectionProps } from "@/components/marketing/section";
import type { Persona } from "@/components/offer/annonceurs-content";
import { frTypo } from "@/components/offer/fr-typo";
import { Button } from "@/components/ui/button";
import { cx } from "@/lib/cx";

export interface PersonaSectionProps {
  persona: Persona;
  index: number;
  total: number;
  /** Image on the right instead of the left. */
  reverse?: boolean;
  tone?: SectionProps["tone"];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** One advertiser profile: photo, promise, need, objections → answers, differentiated CTAs. */
export function PersonaSection({
  persona,
  index,
  total,
  reverse = false,
  tone = "default",
}: PersonaSectionProps) {
  const headingId = `${persona.id}-titre`;
  const Icon = persona.icon;
  const tall = persona.image.ratio === "4/5";

  return (
    <Section id={persona.id} tone={tone} labelledBy={headingId} divider="hairline">
      <div
        className={cx(
          "grid grid-cols-1 items-start gap-10 lg:gap-16 xl:gap-20 [&>*]:min-w-0",
          reverse ? "lg:grid-cols-[1.05fr_0.95fr]" : "lg:grid-cols-[0.95fr_1.05fr]",
        )}
      >
        <Reveal
          variant={reverse ? "right" : "left"}
          className={cx(
            "relative lg:sticky lg:top-[calc(var(--header-h)+32px)]",
            reverse && "lg:order-2",
          )}
        >
          <ImageFrame
            src={persona.image.src}
            alt={persona.image.alt}
            ratio={persona.image.ratio}
            objectPosition={persona.image.position}
            sizes="(min-width: 1240px) 560px, (min-width: 1040px) 46vw, 100vw"
            scrim="bottom"
            label="Illustration"
            className={cx("shadow-card", tall && "mx-auto max-w-[520px] lg:max-w-none")}
            caption={
              <span className="flex items-center gap-3">
                <IconTile icon={<Icon />} tone="orange" size="sm" />
                <span className="flex min-w-0 flex-col">
                  <span
                    aria-hidden="true"
                    className="font-label text-[0.6875rem] font-semibold tracking-[0.18em] text-ink-soft tabular"
                  >
                    {pad(index + 1)} / {pad(total)}
                  </span>
                  <span className="text-[0.8125rem] text-ink-strong">{persona.examples}</span>
                </span>
              </span>
            }
          />
        </Reveal>

        <div className={cx("flex flex-col gap-9", reverse && "lg:order-1")}>
          <Reveal variant="up" className="flex flex-col gap-5">
            <p className="eyebrow">
              {persona.name}
              <span className="sr-only">
                {" "}
                — profil {index + 1} sur {total}
              </span>
            </p>
            <h2 id={headingId} className="font-display text-h2 text-balance text-ink-strong">
              {frTypo(persona.title)}{" "}
              <span className="text-gradient">{frTypo(persona.highlight)}</span>
            </h2>
            <p className="max-w-[58ch] text-lead text-muted">{frTypo(persona.text)}</p>
          </Reveal>

          <Reveal variant="up" className="border-l-2 border-orange-line pl-5">
            <p className="font-label text-[0.75rem] font-semibold tracking-[0.18em] text-brand-orange-text uppercase">
              Votre besoin
            </p>
            <p className="mt-2 max-w-[60ch] text-[1.0625rem] leading-relaxed text-ink-soft">
              {frTypo(persona.need)}
            </p>
          </Reveal>

          <div className="flex flex-col gap-3">
            <p className="font-label text-[0.75rem] font-semibold tracking-[0.18em] text-muted-2 uppercase">
              Ce que l&apos;on entend souvent
            </p>
            <Reveal as="ul" stagger className="flex flex-col gap-3">
              {persona.objections.map((item) => (
                <li
                  key={item.objection}
                  className="border-glow rounded-card border border-line bg-white/[0.02] p-5 sm:p-6"
                >
                  <p className="font-display text-[1.0625rem] leading-snug font-medium text-ink-strong">
                    <span className="sr-only">Objection : </span>
                    {frTypo(`« ${item.objection} »`)}
                  </p>
                  <div aria-hidden="true" className="hairline my-4" />
                  <p className="flex items-start gap-3 text-[0.9375rem] leading-relaxed text-muted">
                    <CornerDownRight
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-brand-orange-text"
                    />
                    <span>
                      <span className="sr-only">Réponse de ZELQANE : </span>
                      {frTypo(item.answer)}
                    </span>
                  </p>
                </li>
              ))}
            </Reveal>
          </div>

          <Reveal variant="up" className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap min-[420px]:items-center">
              <Button asChild variant="brand" size="lg">
                <Link href={persona.primary.href}>
                  {persona.primary.label}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              {persona.secondary ? (
                <Button asChild variant="secondary" size="lg">
                  <Link href={persona.secondary.href}>{persona.secondary.label}</Link>
                </Button>
              ) : null}
            </div>
            {persona.note ? (
              <p className="flex items-start gap-2 text-[0.8125rem] text-muted">
                <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                {frTypo(persona.note)}
              </p>
            ) : null}
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
