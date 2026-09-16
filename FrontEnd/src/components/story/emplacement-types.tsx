import { MonitorOff } from "lucide-react";

import { ImageFrame } from "@/components/marketing/image-frame";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { SectionHeader } from "@/components/marketing/section-header";
import {
  EMPLACEMENT_TYPES,
  type EmplacementType,
  TYPES_SECTION,
} from "@/components/story/reseau-content";
import { cx } from "@/lib/cx";

function LetterMark({ letter, muted = false }: { letter: string; muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "font-display text-[3.25rem] leading-none font-bold",
        muted
          ? "text-transparent [-webkit-text-stroke:1px_var(--color-line-strong)]"
          : "text-transparent [-webkit-text-stroke:1px_color-mix(in_srgb,var(--color-ink-strong)_80%,transparent)] transition-colors duration-500 group-hover/type:text-ink-strong/90",
      )}
    >
      {letter}
    </span>
  );
}

function NoScreenVisual() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-bg-2">
      <div aria-hidden="true" className="pixel-grid absolute inset-0 opacity-25" />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_45%,var(--color-surface-2),transparent_70%)]"
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <span
          aria-hidden="true"
          className="flex aspect-[3/4] w-[26%] max-w-[120px] sm:w-[38%] items-center justify-center rounded-[10px] border border-dashed border-line-strong text-muted-2 [&_svg]:size-7"
        >
          <MonitorOff />
        </span>
        <span className="max-w-[20ch] text-[0.8125rem] leading-snug text-muted">
          Pas d&apos;écran publicitaire sur ce type de site.
        </span>
      </div>
      <span className="absolute top-3 left-3 rounded-full border border-line-strong bg-black/45 px-2.5 py-1 font-label text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-soft uppercase">
        Hors inventaire
      </span>
    </div>
  );
}

function TypeCard({ type }: { type: EmplacementType }) {
  const noScreen = type.image === null;
  return (
    <li
      className={cx(
        "group/type relative flex flex-col overflow-hidden rounded-card border transition-[transform,border-color,box-shadow] duration-500 ease-expo hover:-translate-y-1 hover:shadow-card",
        noScreen
          ? "border-dashed border-line-strong bg-transparent"
          : "border-line bg-surface/55 hover:border-line-strong",
      )}
    >
      {/* 4:3 on phones (a 4:5 card per type filled a whole viewport), portrait from sm up. */}
      <div className="relative aspect-[4/3] w-full sm:aspect-[4/5]">
        {type.image ? (
          <ImageFrame
            src={type.image.src}
            alt={type.image.alt}
            ratio="fill"
            radius="none"
            scrim="bottom"
            label="Illustration"
            objectPosition={type.image.position}
            sizes="(min-width: 1240px) 290px, (min-width: 640px) 50vw, 100vw"
            className="border-0"
          />
        ) : (
          <NoScreenVisual />
        )}
        <div className="pointer-events-none absolute bottom-0 left-0 z-[3] p-4 sm:p-5">
          <LetterMark letter={type.letter} muted={noScreen} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        {/* Type letter on its own line so long names never wrap and misalign the rows below. */}
        <h3 className="font-display text-[1.125rem] leading-snug font-semibold text-ink-strong">
          <span className="mb-1 block font-label text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-2 uppercase">
            Type {type.letter}
            <span className="sr-only"> · </span>
          </span>
          {type.name}
        </h3>
        <dl className="mt-4 flex flex-col text-[0.875rem]">
          {[
            ["Écran", type.screen],
            ["Lieu", type.place],
            ["Flux", type.flow],
          ].map(([term, value]) => (
            <div
              key={term}
              className="grid grid-cols-[64px_1fr] gap-3 border-t border-line py-2.5 last:pb-0"
            >
              <dt className="font-label text-[0.6875rem] font-semibold tracking-[0.1em] text-muted-2 uppercase">
                {term}
              </dt>
              <dd className={cx("leading-snug", noScreen ? "text-muted" : "text-ink-soft")}>
                {value === "—" ? (
                  <>
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">Aucun écran</span>
                  </>
                ) : (
                  value
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </li>
  );
}

/** Porteur emplacement typologies A–D (brief §8.3), D = no screen, no TPUB inventory. */
export function EmplacementTypes() {
  return (
    <Section tone="band" labelledBy="types-titre">
      <SectionHeader
        id="types-titre"
        eyebrow={TYPES_SECTION.eyebrow}
        title={TYPES_SECTION.title}
        highlight={TYPES_SECTION.highlight}
        lede={TYPES_SECTION.lede}
        align="split"
      />
      <Reveal
        as="ul"
        stagger
        aria-label="Types d'emplacements du Porteur"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {EMPLACEMENT_TYPES.map((t) => (
          <TypeCard key={t.letter} type={t} />
        ))}
      </Reveal>
      <p className="mt-8 max-w-[70ch] text-[0.8125rem] leading-relaxed text-muted-2 italic">
        {TYPES_SECTION.mention}
      </p>
    </Section>
  );
}
