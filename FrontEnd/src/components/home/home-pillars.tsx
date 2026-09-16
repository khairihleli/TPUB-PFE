import { ArrowRight, Crosshair, LayoutDashboard, ScrollText, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { PILLARS, PILLARS_SECTION, type PillarKey } from "@/components/home/content";
import { IconTile } from "@/components/marketing/icon-tile";
import { Reveal } from "@/components/marketing/reveal";

const PILLAR_ICON: Record<
  PillarKey,
  { icon: ReactNode; tone: "orange" | "blue" | "red" | "success" }
> = {
  ciblage: { icon: <Crosshair />, tone: "orange" },
  protection: { icon: <ShieldCheck />, tone: "success" },
  preuve: { icon: <ScrollText />, tone: "blue" },
  tableau: { icon: <LayoutDashboard />, tone: "red" },
};

/**
 * Immersive split: full-bleed mall screens behind a 110° scrim, statement on the left,
 * four glass pillar cards (promise + proof mechanism) on the right.
 */
export function HomePillars() {
  return (
    <section aria-labelledby="piliers-titre" className="relative isolate overflow-hidden">
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <Image
          src="/images/screen-mall.jpg"
          alt=""
          fill
          sizes="100vw"
          className="ken-burns object-cover object-[70%_center]"
        />
        {/* Lighter than the shared side scrim: the statement column stays near-opaque, the
            mall screens read through behind the glass cards instead of disappearing. */}
        <div className="absolute inset-0 bg-[linear-gradient(105deg,color-mix(in_srgb,var(--color-bg)_95%,transparent)_32%,color-mix(in_srgb,var(--color-bg)_62%,transparent)_62%,color-mix(in_srgb,var(--color-bg)_38%,transparent))]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,var(--color-bg)_0%,transparent_22%,transparent_78%,var(--color-bg)_100%)]" />
        <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--color-bg)_35%,transparent)] lg:bg-transparent" />
        <div className="pixel-grid absolute inset-0 opacity-30 mix-blend-overlay" />
      </div>

      <div className="container-site section-y">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16 [&>*]:min-w-0">
          <Reveal variant="left" className="flex flex-col gap-5">
            <p className="eyebrow">{PILLARS_SECTION.eyebrow}</p>
            <h2 id="piliers-titre" className="font-display text-h2 text-ink-strong">
              {PILLARS_SECTION.title}{" "}
              <span className="text-gradient">{PILLARS_SECTION.highlight}</span>
            </h2>
            <p className="max-w-[48ch] text-lead text-ink-soft">{PILLARS_SECTION.lede}</p>
            <Link
              href={PILLARS_SECTION.link.href}
              className="group mt-2 inline-flex min-h-touch w-fit items-center gap-2 font-label text-[0.9375rem] font-semibold text-ink-strong"
            >
              <span className="underline-slide">{PILLARS_SECTION.link.label}</span>
              <ArrowRight
                aria-hidden="true"
                className="size-4 text-brand-orange-text transition-transform duration-300 ease-smooth group-hover:translate-x-1"
              />
            </Link>
          </Reveal>

          <Reveal as="ul" stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:pb-6">
            {PILLARS.map((p, i) => {
              const meta = PILLAR_ICON[p.key];
              return (
                <li
                  key={p.key}
                  className="glass-card flex flex-col p-6 sm:p-7 lg:[&:nth-child(even)]:translate-y-6"
                  data-interactive="true"
                >
                  <div className="flex items-center justify-between">
                    <IconTile icon={meta.icon} tone={meta.tone} />
                    <span
                      aria-hidden="true"
                      className="font-display text-[0.8125rem] font-semibold text-muted-2 tabular"
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="mt-5 font-display text-[1.1875rem] font-semibold text-ink-strong">
                    {p.title}
                  </h3>
                  <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{p.body}</p>
                  <div className="mt-auto pt-5">
                    <div className="border-t border-line pt-4">
                      <p className="font-label text-[0.625rem] font-semibold tracking-[0.16em] text-muted-2 uppercase">
                        Mécanisme de preuve
                      </p>
                      <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink-soft">
                        {p.proof}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
