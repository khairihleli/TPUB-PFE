import { ArrowRight, Columns2, Footprints, RotateCw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { NETWORK } from "@/components/home/content";
import { ImageFrame } from "@/components/marketing/image-frame";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { Button } from "@/components/ui/button";

const TYPOLOGY_ICON: Record<(typeof NETWORK.typologies)[number]["key"], ReactNode> = {
  panoramique: <RotateCw />,
  "double-face": <Columns2 />,
  "hauteur-yeux": <Footprints />,
};

/**
 * Network teaser: aerial zones map (illustration) with an inset street totem, and the
 * three screen typologies of the Porteur. No inventory figures.
 */
export function HomeNetwork() {
  return (
    <Section tone="glow" divider="hairline" labelledBy="reseau-titre" className="overflow-hidden">
      <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[1fr_1fr] lg:gap-20 [&>*]:min-w-0">
        <Reveal variant="left" className="relative pr-6 pb-10 sm:pr-14 sm:pb-14">
          <ImageFrame
            src="/images/zones-map.jpg"
            alt="Vue aérienne nocturne d'une ville côtière traversée de tracés lumineux orange et bleus figurant des zones de diffusion"
            ratio="1/1"
            sizes="(min-width: 1040px) 44vw, 100vw"
            scrim="none"
            label="Illustration"
            className="shadow-card"
          >
            {/* Zone rings (decorative) */}
            <div aria-hidden="true" className="absolute inset-0">
              <span className="absolute top-[38%] left-[58%] size-[34%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-orange-line bg-orange-soft/40" />
              <span className="absolute top-[64%] left-[52%] size-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-blue-line bg-blue-soft/40" />
              <span className="absolute top-[38%] left-[58%] size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-orange-text shadow-[0_0_14px_var(--color-brand-orange)]" />
              <span className="absolute top-[64%] left-[52%] size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-blue-text shadow-[0_0_14px_var(--color-brand-blue-text)]" />
            </div>
          </ImageFrame>
          <div className="absolute right-0 bottom-0 w-[42%] max-w-[240px] rounded-panel border border-line-strong bg-bg p-1.5 shadow-lift">
            <ImageFrame
              src="/images/screen-street.jpg"
              alt="Totem d'affichage numérique à hauteur des yeux dans une rue piétonne"
              ratio="4/5"
              sizes="(min-width: 1040px) 240px, 40vw"
              scrim="soft"
              radius="card"
              pixelGrid={false}
              objectPosition="center 40%"
            />
          </div>
        </Reveal>

        <Reveal variant="right" delay={120} className="flex flex-col gap-5">
          <p className="eyebrow">{NETWORK.eyebrow}</p>
          <h2 id="reseau-titre" className="font-display text-h2 text-ink-strong">
            {NETWORK.title} <span className="text-gradient">{NETWORK.highlight}</span>
          </h2>
          <p className="max-w-[58ch] text-lead text-muted">{NETWORK.body}</p>

          <ul className="mt-3 flex flex-col border-t border-line">
            {NETWORK.typologies.map((t) => (
              <li
                key={t.key}
                className="group/typo flex items-center gap-4 border-b border-line py-4 transition-transform duration-300 ease-smooth hover:translate-x-1.5"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-control border border-line bg-surface-2 text-brand-orange-text transition-transform duration-300 ease-smooth group-hover/typo:-rotate-6 [&_svg]:size-5"
                >
                  {TYPOLOGY_ICON[t.key]}
                </span>
                <span className="flex flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                  <span className="font-display text-[1.0625rem] font-semibold text-ink-strong">
                    {t.format}
                  </span>
                  <span className="text-[0.9375rem] text-muted">{t.place}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4">
            <Button asChild variant="outline" shape="pill">
              <Link href={NETWORK.cta.href}>
                {NETWORK.cta.label}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
