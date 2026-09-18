import { ArrowRight, Mail } from "lucide-react";
import Link from "next/link";

import { FAQ_ITEMS, FAQ_SECTION } from "@/components/home/content";
import { Faq } from "@/components/marketing/faq";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { SectionHeader } from "@/components/marketing/section-header";

/** FAQ (8 Q&As from brief §8.1): sticky header column + accessible accordion. */
export function HomeFaq() {
  return (
    <Section tone="deep" labelledBy="faq-titre">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 [&>*]:min-w-0">
        <div className="lg:sticky lg:top-[calc(var(--header-h)+32px)] lg:self-start">
          <SectionHeader
            id="faq-titre"
            eyebrow={FAQ_SECTION.eyebrow}
            title={FAQ_SECTION.title}
            highlight={FAQ_SECTION.highlight}
            breakBeforeHighlight
            lede={FAQ_SECTION.lede}
            className="mb-8 sm:mb-8"
          />
          <Reveal variant="fade" className="flex flex-col gap-1 border-t border-line pt-5">
            <Link
              href={FAQ_SECTION.more.href}
              className="group inline-flex min-h-touch w-fit items-center gap-2 font-label text-[0.9375rem] font-semibold text-brand-orange-text"
            >
              <span className="underline-slide">{FAQ_SECTION.more.label}</span>
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-300 ease-smooth group-hover:translate-x-1"
              />
            </Link>
            <Link
              href={FAQ_SECTION.contact.href}
              className="group inline-flex min-h-touch w-fit items-center gap-2 font-label text-[0.9375rem] font-semibold text-ink-soft transition-colors hover:text-ink-strong"
            >
              <Mail aria-hidden="true" className="size-4 text-muted" />
              <span className="underline-slide">{FAQ_SECTION.contact.label}</span>
            </Link>
          </Reveal>
        </div>

        <Reveal variant="up" delay={100}>
          <Faq items={FAQ_ITEMS} defaultOpen={0} />
        </Reveal>
      </div>
    </Section>
  );
}
