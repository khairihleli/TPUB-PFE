import { Eye, Footprints, ShieldCheck, Store } from "lucide-react";
import type { ReactNode } from "react";

import { ImageFrame } from "@/components/marketing/image-frame";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { SectionHeader } from "@/components/marketing/section-header";
import {
  PRINCIPLES,
  PRINCIPLES_SECTION,
  type PrincipleKey,
} from "@/components/story/a-propos-content";

const PRINCIPLE_ICON: Record<PrincipleKey, ReactNode> = {
  physique: <Footprints />,
  tracable: <Eye />,
  "espace-public": <ShieldCheck />,
  ouvert: <Store />,
};

/** Four principles as editorial numbered rows next to a tall storefront image. */
export function PrinciplesList() {
  return (
    <Section tone="band" labelledBy="principes-titre">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 [&>*]:min-w-0">
        <Reveal variant="left" className="order-2 lg:order-1 lg:sticky lg:top-28 lg:self-start">
          <ImageFrame
            src="/images/storefront-screen.jpg"
            alt={PRINCIPLES_SECTION.imageAlt}
            ratio="4/5"
            sizes="(min-width: 1040px) 38vw, 100vw"
            scrim="bottom"
            label="Illustration"
            className="mx-auto max-w-[460px] shadow-card lg:max-w-none"
            caption={
              <span className="font-display text-[1.0625rem] font-semibold text-ink-strong">
                {PRINCIPLES_SECTION.imageCaption}
              </span>
            }
          />
        </Reveal>

        <div className="order-1 lg:order-2">
          <SectionHeader
            id="principes-titre"
            eyebrow={PRINCIPLES_SECTION.eyebrow}
            title={PRINCIPLES_SECTION.title}
            highlight={PRINCIPLES_SECTION.highlight}
            breakBeforeHighlight
          />
          <Reveal as="ol" stagger className="flex flex-col border-t border-line">
            {PRINCIPLES.map((p, i) => (
              <li
                key={p.key}
                className="group/principle grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 border-b border-line py-6 transition-transform duration-300 ease-smooth hover:translate-x-2 sm:grid-cols-[72px_1fr_auto] sm:items-center sm:gap-x-8 sm:py-7"
              >
                <span
                  aria-hidden="true"
                  className="font-display text-[2.25rem] leading-none font-bold text-transparent [-webkit-text-stroke:1px_color-mix(in_srgb,var(--color-brand-orange-text)_60%,transparent)] transition-colors duration-500 group-hover/principle:text-brand-orange-text sm:text-[2.75rem]"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <h3 className="font-display text-[1.1875rem] font-semibold text-ink-strong sm:text-[1.375rem]">
                    {p.title}
                  </h3>
                  <p className="max-w-[52ch] text-[0.9375rem] leading-relaxed text-muted">
                    {p.text}
                  </p>
                </div>
                <span
                  aria-hidden="true"
                  className="hidden size-11 items-center justify-center rounded-control border border-line bg-surface-2 text-ink-soft transition-[transform,color,border-color] duration-300 ease-smooth group-hover/principle:-rotate-6 group-hover/principle:border-orange-line group-hover/principle:text-brand-orange-text sm:inline-flex [&_svg]:size-5"
                >
                  {PRINCIPLE_ICON[p.key]}
                </span>
              </li>
            ))}
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
