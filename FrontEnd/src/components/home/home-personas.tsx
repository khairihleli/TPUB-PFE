import { ArrowRight, ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { PERSONAS, PERSONAS_SECTION } from "@/components/home/content";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { SectionHeader } from "@/components/marketing/section-header";

/**
 * « Pensé pour chaque annonceur » — four tall image cards (photo, scrim, pixel grid) with
 * the persona promise and its differentiated CTA. The whole card is clickable through a
 * stretched link; the link text stays the CTA label.
 */
export function HomePersonas() {
  return (
    <Section tone="default" labelledBy="personas-titre">
      <SectionHeader
        id="personas-titre"
        eyebrow={PERSONAS_SECTION.eyebrow}
        title={PERSONAS_SECTION.title}
        highlight={PERSONAS_SECTION.highlight}
        lede={PERSONAS_SECTION.lede}
        align="split"
        actions={
          <Link
            href={PERSONAS_SECTION.link.href}
            className="group inline-flex min-h-touch items-center gap-2 font-label text-[0.9375rem] font-semibold text-brand-orange-text"
          >
            <span className="underline-slide">{PERSONAS_SECTION.link.label}</span>
            <ArrowRight
              aria-hidden="true"
              className="size-4 transition-transform duration-300 ease-smooth group-hover:translate-x-1"
            />
          </Link>
        }
      />

      <Reveal as="ul" stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PERSONAS.map((p, i) => (
          <li
            key={p.key}
            className="group/persona relative isolate flex min-h-[360px] flex-col sm:min-h-[clamp(380px,52vh,500px)] justify-end overflow-hidden rounded-card border border-line bg-surface transition-[border-color,transform] duration-500 ease-smooth focus-within:border-orange-line hover:-translate-y-1 hover:border-orange-line"
          >
            <div className="absolute inset-0 -z-10">
              <Image
                src={p.image.src}
                alt={p.image.alt}
                fill
                sizes="(min-width: 1240px) 25vw, (min-width: 640px) 50vw, 100vw"
                className="object-cover transition-transform duration-[1400ms] ease-smooth group-hover/persona:scale-[1.06]"
                style={{ objectPosition: p.image.position }}
              />
              <div
                aria-hidden="true"
                // Darker top band keeps the tag and index legible over bright spots (tram lamps).
                className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-bg)_55%,transparent)_0%,color-mix(in_srgb,var(--color-bg)_12%,transparent)_20%,color-mix(in_srgb,var(--color-bg)_50%,transparent)_46%,color-mix(in_srgb,var(--color-bg)_96%,transparent)_100%)]"
              />
              <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_100%,var(--color-red-soft),transparent_70%)] opacity-0 transition-opacity duration-500 group-hover/persona:opacity-100" />
              <div className="pixel-grid absolute inset-0 opacity-40 mix-blend-overlay" />
            </div>
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-grad-brand transition-transform duration-500 ease-expo group-hover/persona:scale-x-100 group-focus-within/persona:scale-x-100"
            />

            <div className="absolute top-4 right-4 left-4 flex items-center justify-between">
              <span className="rounded-full border border-line-strong bg-black/45 px-2.5 py-1 font-label text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-soft uppercase backdrop-blur-md">
                {p.tag}
              </span>
              <span
                aria-hidden="true"
                className="font-display text-[0.8125rem] font-semibold text-ink-soft/80 tabular"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>

            <div className="flex flex-col gap-3 p-6">
              <h3 className="font-display text-[1.375rem] leading-tight font-semibold text-ink-strong">
                {p.title}
              </h3>
              <p className="text-[0.9375rem] leading-relaxed text-ink-soft">{p.body}</p>
              <Link
                href={p.cta.href}
                className="mt-2 inline-flex min-h-touch w-fit items-center gap-2 font-label text-[0.875rem] font-semibold text-brand-orange-text after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-card focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-brand-blue-text"
              >
                {p.cta.label}
                <ArrowUpRight
                  aria-hidden="true"
                  className="size-4 transition-transform duration-300 ease-smooth group-hover/persona:translate-x-0.5 group-hover/persona:-translate-y-0.5"
                />
              </Link>
            </div>
          </li>
        ))}
      </Reveal>
    </Section>
  );
}
