import { ArrowDownRight } from "lucide-react";

import { GlassCard } from "@/components/marketing/glass-card";
import { IconTile } from "@/components/marketing/icon-tile";
import { ImageFrame } from "@/components/marketing/image-frame";
import { Reveal } from "@/components/marketing/reveal";
import { frTypo } from "@/components/offer/fr-typo";
import type { PriceCriterion } from "@/components/offer/tarifs-content";
import { cx } from "@/lib/cx";

function FactorChips({
  factors,
  strong = false,
}: {
  factors: readonly string[];
  strong?: boolean;
}) {
  return (
    <ul aria-label="Ce qui joue" className="flex flex-wrap gap-1.5">
      {factors.map((f) => (
        <li
          key={f}
          className={cx(
            "rounded-full border px-2.5 py-1 text-[0.75rem] leading-none",
            strong
              ? "border-white/20 bg-black/35 text-ink-soft backdrop-blur-md"
              : "border-line bg-white/[0.03] text-ink-soft",
          )}
        >
          {f}
        </li>
      ))}
    </ul>
  );
}

function BriefLink({ id, title }: { id: string; title: string }) {
  return (
    <a
      href={`#brief-${id}`}
      className="group/brief mt-auto inline-flex min-h-touch w-fit items-center gap-1.5 font-label text-[0.8125rem] font-semibold text-brand-blue-text"
    >
      <span className="underline-slide">Préciser dans mon brief</span>
      <span className="sr-only"> : {title}</span>
      <ArrowDownRight
        aria-hidden="true"
        className="size-3.5 transition-transform duration-300 ease-expo group-hover/brief:translate-x-0.5 group-hover/brief:translate-y-0.5"
      />
    </a>
  );
}

export interface CriteriaBentoProps {
  criteria: readonly PriceCriterion[];
}

/** Six pricing criteria: the heaviest one as a large image card, the others as glass cards. */
export function CriteriaBento({ criteria }: CriteriaBentoProps) {
  const [lead, ...rest] = criteria;
  if (!lead) return null;
  const LeadIcon = lead.icon;

  return (
    <Reveal
      as="ol"
      stagger
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5 [&>*]:min-w-0"
    >
      <li className="md:col-span-2 lg:row-span-2">
        <article className="relative isolate flex h-full min-h-[440px] flex-col overflow-hidden rounded-panel border border-line shadow-card lg:min-h-[560px]">
          <ImageFrame
            src="/images/zones-map.jpg"
            alt="Vue aérienne illustrant un découpage en zones de diffusion"
            ratio="fill"
            sizes="(min-width: 1040px) 66vw, 100vw"
            scrim="bottom"
            radius="none"
            label="Illustration"
            className="-z-10 border-0"
          />
          <div className="mt-auto flex flex-col gap-4 p-6 sm:p-9">
            <div className="flex flex-wrap items-center gap-3">
              <IconTile icon={<LeadIcon />} tone="orange" />
              <span className="font-label text-xs font-semibold tracking-[0.18em] text-ink-soft tabular">
                {lead.number}
              </span>
              {lead.weighs ? (
                <span className="rounded-full border border-orange-line bg-orange-soft px-3 py-1 font-label text-[0.75rem] font-semibold text-brand-orange-text backdrop-blur-md">
                  {lead.weighs}
                </span>
              ) : null}
            </div>
            <h3 className="font-display text-h2 text-ink-strong">{lead.title}</h3>
            <p className="max-w-[52ch] text-lead text-ink-soft">{frTypo(lead.text)}</p>
            <FactorChips factors={lead.factors} strong />
            <BriefLink id={lead.id} title={lead.title} />
          </div>
        </article>
      </li>

      {rest.map((c, i) => {
        const Icon = c.icon;
        const odd = rest.length % 2 === 1 && i === rest.length - 1;
        return (
          <li key={c.id} className={cx(odd && "md:col-span-2 lg:col-span-1")}>
            <GlassCard as="article" interactive className="flex h-full flex-col gap-4">
              <div className="flex items-center justify-between">
                <IconTile icon={<Icon />} tone="blue" size="sm" />
                <span className="font-label text-xs font-semibold tracking-[0.18em] text-muted-2 tabular">
                  {c.number}
                </span>
              </div>
              <h3 className="font-display text-[1.25rem] leading-tight font-semibold text-ink-strong">
                {c.title}
              </h3>
              <p className="text-[0.9375rem] leading-relaxed text-muted">{frTypo(c.text)}</p>
              <FactorChips factors={c.factors} />
              <BriefLink id={c.id} title={c.title} />
            </GlassCard>
          </li>
        );
      })}
    </Reveal>
  );
}
