import { Activity, ArrowRight, CalendarPlus, MapPinned, ScanSearch } from "lucide-react";
import Link from "next/link";

import { STEPS, STEPS_SECTION } from "@/components/home/content";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { SectionHeader } from "@/components/marketing/section-header";
import { Button } from "@/components/ui/button";
import { cx } from "@/lib/cx";

const SEGMENT_GRADIENT = [
  "bg-[linear-gradient(90deg,var(--color-brand-red),var(--color-brand-orange))]",
  "bg-[linear-gradient(90deg,var(--color-brand-orange),var(--color-brand-orange-text))]",
  "bg-[linear-gradient(90deg,var(--color-brand-orange-text),var(--color-brand-blue-text))]",
];

const STEP_ICONS = [
  <MapPinned key="zones" />,
  <CalendarPlus key="reserver" />,
  <ScanSearch key="controle" />,
  <Activity key="diffuser" />,
];

/**
 * « De la zone au rapport, en quatre étapes » — numbered 01–04 with connectors:
 * a horizontal track that draws itself on desktop, a vertical chain on mobile.
 */
export function HomeSteps() {
  return (
    <Section id="etapes" tone="band" labelledBy="etapes-titre" className="scroll-mt-(--header-h)">
      <SectionHeader
        id="etapes-titre"
        eyebrow={STEPS_SECTION.eyebrow}
        title={STEPS_SECTION.title}
        highlight={STEPS_SECTION.highlight}
        align="split"
        lede={STEPS_SECTION.lede}
        actions={
          <Button asChild variant="brand">
            <Link href={STEPS_SECTION.cta.href}>
              {STEPS_SECTION.cta.label}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        }
      />

      <StepsTrack />
    </Section>
  );
}

export function StepsTrack() {
  return (
    <Reveal as="ol" stagger className="grid grid-cols-1 lg:grid-cols-4 lg:gap-6">
      {STEPS.map((step, i) => {
        const n = String(i + 1).padStart(2, "0");
        const last = i === STEPS.length - 1;
        return (
          <li
            key={step.title}
            className="group/step relative grid grid-cols-[56px_1fr] gap-x-5 pb-6 last:pb-0 lg:flex lg:flex-col lg:gap-6 lg:pb-0"
          >
            {!last ? (
              <span
                aria-hidden="true"
                className="absolute top-7 left-[72px] -right-2 hidden h-px bg-line lg:block"
              >
                <span className={cx("meter-fill block h-full", SEGMENT_GRADIENT[i])} />
              </span>
            ) : null}
            {!last ? (
              <span
                aria-hidden="true"
                className="absolute top-14 bottom-0 left-[27.5px] w-px bg-[linear-gradient(180deg,var(--color-orange-line),var(--color-line))] lg:hidden"
              />
            ) : null}

            <span
              aria-hidden="true"
              className="relative z-[1] inline-flex size-14 items-center justify-center rounded-full border border-orange-line bg-bg font-display text-lg font-semibold text-brand-orange-text shadow-[0_0_0_6px_var(--color-bg)] transition-[background-color,color] duration-300 ease-smooth group-hover/step:bg-brand-orange group-hover/step:text-on-orange"
            >
              {n}
            </span>

            <div className="glass-card flex h-full flex-col p-5 sm:p-6" data-interactive="true">
              {/* The numbered disc already carries « 01 »: no second « Étape 01 » label here. */}
              <span
                aria-hidden="true"
                className="inline-flex size-10 items-center justify-center rounded-control border border-line bg-surface-2 text-brand-orange-text transition-transform duration-300 ease-smooth group-hover/step:-translate-y-0.5 group-hover/step:-rotate-6 [&_svg]:size-5"
              >
                {STEP_ICONS[i]}
              </span>
              {/* Two-line slot on desktop so the four descriptions start on the same baseline. */}
              <h3 className="mt-5 font-display text-[1.125rem] leading-snug font-semibold text-balance text-ink-strong lg:min-h-[2.75em]">
                <span className="sr-only">Étape {i + 1} :</span> {step.title}
              </h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{step.description}</p>
              <p className="mt-auto pt-5">
                <span className="inline-flex items-center gap-2 rounded-full border border-line bg-black/20 px-3 py-1.5 font-label text-[0.6875rem] font-semibold text-ink-soft">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-brand-orange-text" />
                  {step.marker}
                </span>
              </p>
            </div>
          </li>
        );
      })}
    </Reveal>
  );
}
