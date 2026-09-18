import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { INTRO, LOG_ANATOMY } from "@/components/home/content";
import { ImageFrame } from "@/components/marketing/image-frame";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { cx } from "@/lib/cx";

/**
 * « L'audience se mesure, elle ne se déclare pas. » — editorial statement on the left,
 * LED macro on the right with the anatomy of one (simulated) diffusion log line.
 */
export function HomeIntro() {
  return (
    <Section labelledBy="intro-titre" className="overflow-hidden">
      <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[1fr_0.92fr] lg:gap-20 [&>*]:min-w-0">
        <Reveal variant="left" className="flex flex-col gap-6">
          <p className="eyebrow">{INTRO.eyebrow}</p>
          <h2
            id="intro-titre"
            className="font-display text-[clamp(2.1rem,4.6vw,3.6rem)] leading-[1.06] font-bold tracking-[-0.022em] text-ink-strong"
          >
            {INTRO.title} <span className="text-gradient">{INTRO.highlight}</span>
          </h2>
          <p className="max-w-[56ch] text-lead text-ink-soft">{INTRO.body}</p>
          <Link
            href={INTRO.link.href}
            className="group mt-1 inline-flex min-h-touch w-fit items-center gap-2 font-label text-[0.9375rem] font-semibold text-brand-orange-text"
          >
            <span className="underline-slide">{INTRO.link.label}</span>
            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform duration-300 ease-smooth group-hover:translate-x-1"
            />
          </Link>
        </Reveal>

        <Reveal variant="right" delay={120} className="relative pb-2">
          <div
            aria-hidden="true"
            className="absolute -top-10 -right-16 -z-10 size-72 rounded-full bg-blue-soft blur-3xl"
          />
          <ImageFrame
            src="/images/led-closeup.jpg"
            alt="Gros plan sur les diodes d'un écran LED allumées en rouge, orange et bleu"
            ratio="4/3"
            sizes="(min-width: 1040px) 44vw, 100vw"
            scrim="bottom"
            kenBurns
            className="shadow-card"
          />
          <LogAnatomy className="relative z-[3] -mt-20 mx-3 sm:-mt-24 sm:mx-6" />
        </Reveal>
      </div>
    </Section>
  );
}

/** One simulated log line split into what it proves. Labelled « Illustration ». */
export function LogAnatomy({ className }: { className?: string }) {
  return (
    <figure className={cx("glass rounded-card p-4 shadow-lift sm:p-5", className)}>
      <figcaption className="mb-3 flex items-center justify-between gap-3">
        <span className="font-label text-[0.6875rem] font-semibold tracking-[0.14em] text-ink-soft uppercase">
          Une ligne du journal de diffusion
        </span>
        <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 font-label text-[0.625rem] font-semibold tracking-[0.08em] text-warning uppercase">
          Illustration
        </span>
      </figcaption>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 font-mono text-[0.8125rem] sm:grid-cols-3">
        {LOG_ANATOMY.map((seg, i) => (
          <div key={seg.label} className="flex min-w-0 flex-col-reverse gap-1.5">
            <dt className="border-t border-orange-line pt-1.5 font-sans text-[0.6875rem] leading-tight text-muted">
              {seg.label}
            </dt>
            <dd className="truncate text-ink-strong">
              {i === 0 ? (
                <span aria-hidden="true" className="mr-1.5 text-brand-orange-text">
                  ›
                </span>
              ) : null}
              {seg.value}
            </dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}
