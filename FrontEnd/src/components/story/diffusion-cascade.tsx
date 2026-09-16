import { ArrowDown, ArrowRight, BellRing, Megaphone, MonitorPlay } from "lucide-react";
import type { ReactNode } from "react";

import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { SectionHeader } from "@/components/marketing/section-header";
import {
  DIFFUSION_KINDS,
  DIFFUSION_LOG_EXAMPLE,
  DIFFUSION_SECTION,
  type DiffusionKind,
} from "@/components/story/reseau-content";
import { cx } from "@/lib/cx";

type KindKey = DiffusionKind["key"];

const KIND_STYLE: Record<
  KindKey,
  { icon: ReactNode; tile: string; rail: string; chip: string; short: string }
> = {
  urgence: {
    icon: <BellRing />,
    tile: "border-red-line bg-red-soft text-brand-red-text",
    rail: "bg-brand-red",
    chip: "border-red-line bg-red-soft text-brand-red-text",
    short: "Message prioritaire",
  },
  publicite: {
    icon: <Megaphone />,
    tile: "border-orange-line bg-orange-soft text-brand-orange-text",
    rail: "bg-brand-orange",
    chip: "border-orange-line bg-orange-soft text-brand-orange-text",
    short: "Publicité",
  },
  defaut: {
    icon: <MonitorPlay />,
    tile: "border-blue-line bg-blue-soft text-brand-blue-text",
    rail: "bg-brand-blue",
    chip: "border-blue-line bg-blue-soft text-brand-blue-text",
    short: "Contenu par défaut",
  },
};

function Otherwise() {
  return (
    <div
      aria-hidden="true"
      className="flex items-center justify-center gap-2 py-2 lg:flex-col lg:px-2 lg:py-0"
    >
      <span className="h-5 w-px bg-line-strong lg:h-px lg:w-5" />
      <span className="rounded-full border border-line-strong bg-bg px-2.5 py-1 font-label text-[0.6875rem] font-semibold tracking-[0.08em] text-muted uppercase">
        sinon
      </span>
      <ArrowDown className="size-3.5 text-muted-2 lg:hidden" />
      <ArrowRight className="hidden size-3.5 text-muted-2 lg:block" />
    </div>
  );
}

/** Log of three fictional passages, one per content type (labelled « Illustration »). */
export function DiffusionLogExample({ className }: { className?: string }) {
  return (
    <figure
      className={cx(
        "relative overflow-hidden rounded-card border border-line bg-black/30 p-4 sm:p-5",
        className,
      )}
    >
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="font-label text-[0.75rem] font-semibold tracking-[0.12em] text-muted uppercase">
          Journal de diffusion
        </span>
        <span className="rounded-full border border-line-strong px-2.5 py-0.5 font-label text-[0.6875rem] font-semibold tracking-[0.08em] text-muted uppercase">
          Illustration
        </span>
      </figcaption>
      <ol className="flex flex-col divide-y divide-line text-[0.8125rem]">
        {DIFFUSION_LOG_EXAMPLE.map((line) => {
          const style = KIND_STYLE[line.kind];
          return (
            <li
              key={line.time}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="font-label text-ink-strong tabular">{line.time}</span>
              <span aria-hidden="true" className="text-muted-2">
                ·
              </span>
              <span className="text-ink-soft">{line.screen}</span>
              <span aria-hidden="true" className="text-muted-2">
                ·
              </span>
              <span className="text-muted">{line.zone}</span>
              <span aria-hidden="true" className="text-muted-2">
                ·
              </span>
              <span className="text-muted tabular">{line.duration}</span>
              <span
                className={cx(
                  "ml-auto rounded-full border px-2 py-0.5 font-label text-[0.6875rem] font-semibold",
                  style.chip,
                )}
              >
                {"campaign" in line ? `${style.short} · ${line.campaign}` : style.short}
              </span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}

/** Diffusion decision cascade: message prioritaire → publicité → contenu par défaut. */
export function DiffusionCascade() {
  return (
    <Section tone="deep" divider="hairline" labelledBy="diffusion-titre">
      <SectionHeader
        id="diffusion-titre"
        eyebrow={DIFFUSION_SECTION.eyebrow}
        title={DIFFUSION_SECTION.title}
        highlight={DIFFUSION_SECTION.highlight}
        lede={DIFFUSION_SECTION.lede}
      />

      <Reveal
        as="ol"
        stagger
        aria-label="Ordre de choix du contenu diffusé"
        className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr_auto_1fr]"
      >
        {DIFFUSION_KINDS.flatMap((kind, i) => {
          const style = KIND_STYLE[kind.key];
          const card = (
            <li
              key={kind.key}
              className="glass-card relative flex flex-col overflow-hidden p-6"
              data-interactive="true"
            >
              <span
                aria-hidden="true"
                className={cx("absolute inset-x-0 top-0 h-[3px]", style.rail)}
              />
              <div className="flex items-center justify-between gap-3">
                <span
                  aria-hidden="true"
                  className={cx(
                    "inline-flex size-11 items-center justify-center rounded-control border [&_svg]:size-5",
                    style.tile,
                  )}
                >
                  {style.icon}
                </span>
                <span className="font-label text-[0.75rem] font-semibold tracking-[0.12em] text-muted uppercase tabular">
                  <span className="text-ink-strong">{String(i + 1).padStart(2, "0")}</span> ·{" "}
                  {kind.rule}
                </span>
              </div>
              <h3 className="mt-5 font-display text-[1.25rem] font-semibold text-ink-strong">
                {kind.name}
              </h3>
              <p className="mt-2 flex-1 text-[0.9375rem] leading-relaxed text-muted">{kind.text}</p>
              <p className="mt-5 border-t border-line pt-3 text-[0.8125rem] text-ink-soft">
                {kind.owner}
              </p>
            </li>
          );
          return i < DIFFUSION_KINDS.length - 1
            ? [
                card,
                <li key={`${kind.key}-sinon`} aria-hidden="true" className="list-none">
                  <Otherwise />
                </li>,
              ]
            : [card];
        })}
      </Reveal>

      <div className="mt-10 grid grid-cols-1 items-center gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12 [&>*]:min-w-0">
        <Reveal variant="left">
          <p className="max-w-[48ch] text-[0.9375rem] leading-relaxed text-ink-soft">
            {DIFFUSION_SECTION.footnote}
          </p>
        </Reveal>
        <Reveal variant="right" delay={100}>
          <DiffusionLogExample />
        </Reveal>
      </div>
    </Section>
  );
}
