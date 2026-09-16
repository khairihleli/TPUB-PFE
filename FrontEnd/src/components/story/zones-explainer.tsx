import { MapPinned } from "lucide-react";

import { ImageFrame } from "@/components/marketing/image-frame";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { ZONES_SECTION } from "@/components/story/reseau-content";
import { StatusPill } from "@/components/ui/status-pill";

function RadiusGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40" className="size-10 shrink-0">
      <circle
        cx="20"
        cy="20"
        r="15"
        className="fill-orange-soft stroke-brand-orange-text"
        strokeWidth="1.2"
        strokeDasharray="3 3"
      />
      <line
        x1="20"
        y1="20"
        x2="35"
        y2="20"
        className="stroke-brand-orange-text"
        strokeWidth="1.2"
      />
      <circle cx="20" cy="20" r="2.4" className="fill-brand-orange-text" />
    </svg>
  );
}

function ContourGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40" className="size-10 shrink-0">
      <path
        d="M8 14 L17 6 L31 10 L35 22 L27 34 L12 31 L5 23 Z"
        className="fill-blue-soft stroke-brand-blue-text"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {[
        [8, 14],
        [17, 6],
        [31, 10],
        [35, 22],
        [27, 34],
        [12, 31],
        [5, 23],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" className="fill-brand-blue-text" />
      ))}
    </svg>
  );
}

/** Zone logic over the aerial map (illustration only, no real emplacement). */
export function ZonesExplainer() {
  return (
    <Section tone="glow" labelledBy="zones-titre" className="overflow-hidden">
      <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[1.02fr_0.98fr] lg:gap-20 [&>*]:min-w-0">
        <Reveal variant="right" delay={120} className="flex flex-col gap-5 lg:order-2">
          <p className="eyebrow">{ZONES_SECTION.eyebrow}</p>
          <h2 id="zones-titre" className="font-display text-h2 text-ink-strong">
            {ZONES_SECTION.title} <span className="text-gradient">{ZONES_SECTION.highlight}</span>
          </h2>
          <p className="max-w-[58ch] text-lead text-muted">{ZONES_SECTION.body}</p>

          <ul
            aria-label="Deux façons de définir une zone"
            className="mt-2 grid gap-3 sm:grid-cols-2"
          >
            {ZONES_SECTION.definitions.map((d) => (
              <li
                key={d.key}
                className="flex items-center gap-4 rounded-card border border-line bg-surface/55 p-4"
              >
                {d.key === "rayon" ? <RadiusGlyph /> : <ContourGlyph />}
                <span className="flex min-w-0 flex-col">
                  <span className="font-display text-[0.9375rem] font-semibold text-ink-strong">
                    {d.label}
                  </span>
                  <span className="text-[0.8125rem] leading-snug text-muted">{d.detail}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-2 rounded-card border border-line bg-surface/40 p-5">
            <p className="font-label text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-2 uppercase">
              Pour chaque emplacement
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {ZONES_SECTION.attributes.map((a) => (
                <li
                  key={a}
                  className="rounded-full border border-line-strong bg-white/[0.03] px-3 py-1.5 text-[0.8125rem] text-ink-soft"
                >
                  {a}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <span className="mr-1 text-[0.8125rem] text-muted">États possibles :</span>
              <StatusPill type="support" status="ACTIF" size="sm" />
              <StatusPill type="support" status="MAINTENANCE" size="sm" />
              <StatusPill type="support" status="HORS_LIGNE" size="sm" />
            </div>
          </div>

          <div className="relative mt-2 overflow-hidden rounded-card border border-dashed border-line-strong p-5">
            <div className="flex items-start gap-4">
              <span
                aria-hidden="true"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-control border border-blue-line bg-blue-soft text-brand-blue-text [&_svg]:size-5"
              >
                <MapPinned />
              </span>
              <div className="flex min-w-0 flex-col gap-2">
                <h3 className="font-display text-[1rem] font-semibold text-ink-strong">
                  {ZONES_SECTION.spaceTitle}
                </h3>
                <p className="text-[0.875rem] leading-relaxed text-muted">
                  {ZONES_SECTION.spaceText}
                </p>
                <p className="border-l-2 border-blue-line pl-3 text-[0.875rem] text-ink-soft italic">
                  «&nbsp;{ZONES_SECTION.emptyState}&nbsp;»
                </p>
              </div>
            </div>
          </div>
        </Reveal>

        {/* After the text in DOM (read heading first, map follows on phones); placed left on lg. */}
        <Reveal variant="left" className="lg:sticky lg:top-28 lg:order-1">
          <ImageFrame
            src="/images/zones-map.jpg"
            alt={ZONES_SECTION.mapAlt}
            ratio="1/1"
            sizes="(min-width: 1040px) 48vw, 100vw"
            scrim="none"
            label="Illustration"
            className="shadow-card"
            caption={
              <span className="inline-flex rounded-control bg-black/55 px-3 py-2 text-[0.8125rem] backdrop-blur-md">
                {ZONES_SECTION.mapCaption}
              </span>
            }
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 size-full"
            >
              <circle
                cx="60"
                cy="40"
                r="16"
                className="fill-orange-soft stroke-brand-orange-text"
                strokeWidth="0.35"
                strokeDasharray="1.4 1.2"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1="60"
                y1="40"
                x2="76"
                y2="40"
                className="stroke-brand-orange-text"
                strokeWidth="0.35"
                vectorEffect="non-scaling-stroke"
              />
              <circle cx="60" cy="40" r="0.9" className="fill-brand-orange-text" />
              <path
                d="M40 60 L52 55 L63 60 L66 71 L57 80 L44 78 L37 70 Z"
                className="fill-blue-soft stroke-brand-blue-text"
                strokeWidth="0.35"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <span
              aria-hidden="true"
              className="absolute top-[19%] left-[62%] rounded-full border border-orange-line bg-black/55 px-2 py-0.5 font-label text-[0.625rem] font-semibold text-brand-orange-text backdrop-blur-md sm:text-[0.6875rem]"
            >
              Centre et rayon
            </span>
            <span
              aria-hidden="true"
              className="absolute top-[50%] left-[34%] rounded-full border border-blue-line bg-black/55 px-2 py-0.5 font-label text-[0.625rem] font-semibold text-brand-blue-text backdrop-blur-md sm:text-[0.6875rem]"
            >
              Contour
            </span>
          </ImageFrame>
        </Reveal>
      </div>
    </Section>
  );
}
