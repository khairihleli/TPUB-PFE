import { Activity, ArrowRight, LineChart, MonitorCheck, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { MEASUREMENT, type MeasurementKey } from "@/components/home/content";
import { ImageFrame } from "@/components/marketing/image-frame";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { SectionHeader } from "@/components/marketing/section-header";

const BLOCK_ICON: Record<MeasurementKey, ReactNode> = {
  disponibilite: <MonitorCheck />,
  diffusions: <Activity />,
  suivi: <LineChart />,
};

/**
 * « Ce qui est prouvé, ce qui est estimé » — one panel, two registers: what the platform
 * proves (green, solid) and what can only be estimated (amber, dashed). The full five-level
 * confidence ladder lives on /fonctionnement#mesure; repeating it here doubled the section.
 */
export function HomeMeasurement() {
  return (
    <Section labelledBy="mesure-titre">
      <SectionHeader
        id="mesure-titre"
        eyebrow={MEASUREMENT.eyebrow}
        title={MEASUREMENT.title}
        highlight={MEASUREMENT.highlight}
        breakBeforeHighlight
        lede={MEASUREMENT.lede}
        align="split"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr] lg:gap-10 [&>*]:min-w-0">
        <Reveal
          variant="left"
          className="relative aspect-[3/2] w-full lg:aspect-auto lg:h-full lg:min-h-[440px]"
        >
          <ImageFrame
            src="/images/dashboard-hands.jpg"
            alt="Mains sur un ordinateur portable affichant un tableau de bord de statistiques"
            ratio="fill"
            sizes="(min-width: 1040px) 46vw, 100vw"
            scrim="bottom"
            label="Illustration"
            objectPosition="40% center"
            className="shadow-card"
            caption={
              <span className="font-label text-[0.75rem] font-semibold tracking-[0.12em] text-ink-soft uppercase">
                Ce que la plateforme suit
              </span>
            }
          />
        </Reveal>

        <Reveal variant="right" delay={120} className="flex flex-col gap-4">
          <div className="glass-card p-5 sm:p-7">
            <p className="flex items-center gap-2.5 font-label text-[0.6875rem] font-semibold tracking-[0.14em] text-success uppercase">
              <span aria-hidden="true" className="h-1.5 w-5 rounded-full bg-success" />
              {MEASUREMENT.provenLabel}
            </p>
            <ul className="mt-2">
              {MEASUREMENT.blocks.map((b) => (
                <li
                  key={b.key}
                  className="grid grid-cols-[auto_1fr] items-start gap-4 border-b border-line py-4 last:border-b-0 last:pb-1"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex size-10 items-center justify-center rounded-control border border-success/30 bg-success/10 text-success [&_svg]:size-5"
                  >
                    {BLOCK_ICON[b.key]}
                  </span>
                  <div>
                    <h3 className="font-display text-[1.0625rem] font-semibold text-ink-strong">
                      {b.title}
                    </h3>
                    <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted">{b.body}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-4 rounded-card border border-dashed border-warning/35 bg-warning/[0.06] p-4 sm:p-5">
              <p className="flex items-center gap-2.5 font-label text-[0.6875rem] font-semibold tracking-[0.14em] text-warning uppercase">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-5 rounded-full border border-dashed border-warning"
                />
                {MEASUREMENT.estimated.label}
              </p>
              <div className="mt-3 grid grid-cols-[auto_1fr] items-start gap-4">
                <span
                  aria-hidden="true"
                  className="inline-flex size-10 items-center justify-center rounded-control border border-warning/30 bg-warning/10 text-warning [&_svg]:size-5"
                >
                  <Users />
                </span>
                <div>
                  <h3 className="font-display text-[1.0625rem] font-semibold text-ink-strong">
                    {MEASUREMENT.estimated.title}
                  </h3>
                  <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted">
                    {MEASUREMENT.note}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Link
            href={MEASUREMENT.link.href}
            className="group inline-flex min-h-touch w-fit items-center gap-2 font-label text-[0.9375rem] font-semibold text-brand-orange-text"
          >
            <span className="underline-slide">{MEASUREMENT.link.label}</span>
            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform duration-300 ease-smooth group-hover:translate-x-1"
            />
          </Link>
        </Reveal>
      </div>
    </Section>
  );
}
