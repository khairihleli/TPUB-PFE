import { ArrowRight, Check, ScanSearch, UserCheck } from "lucide-react";
import Link from "next/link";

import { MODERATION } from "@/components/home/content";
import { ModerationPipeline } from "@/components/marketing/moderation-pipeline";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { SectionHeader } from "@/components/marketing/section-header";

/** Brand safety: split header, the moderation pipeline visual, then what the AI checks + principles. */
export function HomeModeration() {
  return (
    <Section tone="deep" divider="tricolor" labelledBy="moderation-titre">
      <SectionHeader
        id="moderation-titre"
        eyebrow={MODERATION.eyebrow}
        title={MODERATION.title}
        highlight={MODERATION.highlight}
        lede={MODERATION.lede}
        // Centred on purpose: breaks the run of split headers (steps, personas, measurement)
        // and gives the brand-safety moment, under the tricolor hairline, a quieter axis.
        align="center"
        breakBeforeHighlight
      />

      <ModerationPipeline />

      <div className="mt-14 grid grid-cols-1 gap-10 border-t border-line pt-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 [&>*]:min-w-0">
        <Reveal variant="left">
          <h3 className="flex items-center gap-3 font-display text-[1.125rem] font-semibold text-ink-strong">
            <ScanSearch aria-hidden="true" className="size-5 text-brand-orange-text" />
            Ce que l&apos;analyse relève
          </h3>
          <p className="mt-3 max-w-[56ch] text-[0.9375rem] leading-relaxed text-muted">
            {MODERATION.analysisIntro}
          </p>
          <ul className="mt-5 flex flex-wrap gap-2.5">
            {MODERATION.checks.map((c) => (
              <li
                key={c}
                className="rounded-full border border-line-strong bg-white/[0.03] px-3.5 py-2 text-[0.8125rem] leading-snug text-ink-soft"
              >
                {c}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal variant="right" delay={120} className="flex flex-col">
          <h3 className="flex items-center gap-3 font-display text-[1.125rem] font-semibold text-ink-strong">
            <UserCheck aria-hidden="true" className="size-5 text-success" />
            Nos principes
          </h3>
          <ul className="mt-5 flex flex-col border-t border-line">
            {MODERATION.principles.map((p) => (
              <li
                key={p}
                className="flex items-start gap-3 border-b border-line py-3.5 text-[0.9375rem] text-ink-soft"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-success/35 bg-success/10 text-success"
                >
                  <Check className="size-3" />
                </span>
                {p}
              </li>
            ))}
          </ul>
          <Link
            href={MODERATION.link.href}
            className="group mt-5 inline-flex min-h-touch w-fit items-center gap-2 font-label text-[0.9375rem] font-semibold text-brand-orange-text"
          >
            <span className="underline-slide">{MODERATION.link.label}</span>
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
