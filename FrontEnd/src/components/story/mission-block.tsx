import { ArrowDown, ArrowRight } from "lucide-react";

import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { MISSION_SECTION } from "@/components/story/a-propos-content";
import { cx } from "@/lib/cx";

function ShiftPanel({
  side,
  label,
  who,
  text,
}: {
  side: "from" | "to";
  label: string;
  who: string;
  text: string;
}) {
  const to = side === "to";
  return (
    <div
      className={cx(
        "relative flex flex-col gap-3 overflow-hidden rounded-card border p-5 sm:p-6",
        to
          ? "border-orange-line bg-orange-soft/50"
          : "border-dashed border-line-strong bg-transparent",
      )}
    >
      {to ? (
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-grad-brand" />
      ) : null}
      <span
        className={cx(
          "font-label text-[0.6875rem] font-semibold tracking-[0.14em] uppercase",
          to ? "text-brand-orange-text" : "text-muted-2",
        )}
      >
        {label}
      </span>
      <p className="text-[1.0625rem] leading-snug">
        <span
          className={cx("font-display font-semibold", to ? "text-ink-strong" : "text-ink-soft")}
        >
          {who}
        </span>{" "}
        <span className={to ? "text-ink-soft" : "text-muted"}>{text}</span>
      </p>
    </div>
  );
}

/** Mission statement, founding principle quote and the risk shift (buyer → operator). */
export function MissionBlock() {
  return (
    <Section labelledBy="mission-titre">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:gap-20 [&>*]:min-w-0">
        <Reveal variant="left" className="flex flex-col gap-5">
          <p className="eyebrow">{MISSION_SECTION.eyebrow}</p>
          <h2 id="mission-titre" className="font-display text-h2 text-ink-strong">
            {MISSION_SECTION.title}{" "}
            <span className="text-gradient">{MISSION_SECTION.highlight}</span>
          </h2>
          <p className="max-w-[34ch] font-display text-[clamp(1.25rem,2.2vw,1.625rem)] leading-snug font-medium text-ink-soft">
            {MISSION_SECTION.statement}
          </p>
          <p className="max-w-[58ch] text-[1rem] leading-relaxed text-muted">
            {MISSION_SECTION.text}
          </p>
        </Reveal>

        <Reveal variant="right" delay={120}>
          <figure className="relative overflow-hidden rounded-panel border border-line bg-surface/50 p-7 sm:p-9">
            <div aria-hidden="true" className="pixel-grid absolute inset-0 opacity-20" />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(70%_60%_at_100%_0%,var(--color-red-soft),transparent_70%)]"
            />
            <span
              aria-hidden="true"
              className="relative block font-display text-[4.5rem] leading-[0.6] font-bold text-brand-orange-text/70"
            >
              «
            </span>
            <blockquote className="relative mt-4">
              <p className="font-display text-[clamp(1.5rem,2.8vw,2.125rem)] leading-[1.15] font-semibold tracking-[-0.015em] text-ink-strong">
                {MISSION_SECTION.quote}
              </p>
            </blockquote>
            <figcaption className="relative mt-5 flex items-center gap-3 text-[0.8125rem] text-muted">
              <span aria-hidden="true" className="h-px w-8 bg-grad-brand" />
              {MISSION_SECTION.quoteSource}
            </figcaption>
          </figure>
        </Reveal>
      </div>

      <div className="mt-16 lg:mt-20">
        <Reveal variant="blur">
          <h3 className="mb-5 font-label text-[0.75rem] font-semibold tracking-[0.16em] text-muted uppercase">
            {MISSION_SECTION.shiftTitle}
          </h3>
        </Reveal>
        <Reveal
          stagger
          className="grid grid-cols-1 items-stretch gap-2 md:grid-cols-[1fr_auto_1fr] md:gap-4"
        >
          <ShiftPanel side="from" {...MISSION_SECTION.shiftFrom} />
          <span
            aria-hidden="true"
            className="flex items-center justify-center text-brand-orange-text"
          >
            <ArrowDown className="size-5 md:hidden" />
            <ArrowRight className="hidden size-5 md:block" />
          </span>
          <ShiftPanel side="to" {...MISSION_SECTION.shiftTo} />
        </Reveal>
      </div>
    </Section>
  );
}
