import { Info } from "lucide-react";

import { ConfidenceLadder } from "@/components/marketing/confidence-ladder";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { SectionHeader } from "@/components/marketing/section-header";
import { MEASURE_SECTION } from "@/components/story/fonctionnement-content";

/** « Ce que la plateforme prouve, ce qu'elle estime » — the confidence ladder. */
export function MeasureSection() {
  return (
    <Section id="mesure" labelledBy="mesure-titre">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 [&>*]:min-w-0">
        <div className="flex flex-col lg:sticky lg:top-28 lg:self-start">
          <SectionHeader
            id="mesure-titre"
            eyebrow={MEASURE_SECTION.eyebrow}
            title={MEASURE_SECTION.title}
            highlight={MEASURE_SECTION.highlight}
            breakBeforeHighlight
            lede={MEASURE_SECTION.lede}
            className="mb-8!"
          />
          <Reveal
            variant="up"
            className="flex items-start gap-3 rounded-card border border-blue-line bg-blue-soft/60 p-4 sm:p-5"
          >
            <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-blue-text" />
            <div className="flex flex-col gap-1.5">
              <h3 className="font-label text-[0.875rem] font-semibold text-ink-strong">
                {MEASURE_SECTION.asideTitle}
              </h3>
              <p className="text-[0.875rem] leading-relaxed text-ink-soft">
                {MEASURE_SECTION.aside}
              </p>
            </div>
          </Reveal>
        </div>
        <ConfidenceLadder className="lg:pt-2" />
      </div>
    </Section>
  );
}
