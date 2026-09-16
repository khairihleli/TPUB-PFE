import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";
import Image from "next/image";

import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { GROUP_CHAIN, GROUP_SECTION } from "@/components/story/a-propos-content";
import { Button } from "@/components/ui/button";
import { GROUP } from "@/content/site";
import { cx } from "@/lib/cx";

/** TPUB inside the Tukhnanutha group: pôle Médias, audience & données (TPUB · AFRIVA · INFINTRA). */
export function GroupChain() {
  return (
    <Section tone="glow" divider="tricolor" labelledBy="groupe-titre">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:gap-16 [&>*]:min-w-0">
        <Reveal variant="left" className="flex flex-col gap-5">
          <p className="eyebrow">{GROUP_SECTION.eyebrow}</p>
          <h2 id="groupe-titre" className="font-display text-h2 text-ink-strong">
            {GROUP_SECTION.title} <span className="text-gradient">{GROUP_SECTION.highlight}</span>
          </h2>
          <p className="max-w-[60ch] text-lead text-muted">{GROUP_SECTION.text}</p>
        </Reveal>

        <Reveal variant="right" delay={120} className="glass-card flex flex-col gap-5 p-6 sm:p-7">
          <div className="flex items-center gap-4">
            <span className="inline-flex size-16 shrink-0 items-center justify-center rounded-card border border-white/15 bg-white/[0.06] p-2.5 backdrop-blur-md">
              <Image
                src="/brand/tukhnanutha.png"
                alt=""
                width={400}
                height={380}
                sizes="44px"
                className="h-auto w-full object-contain drop-shadow-[0_2px_8px_var(--color-orange-soft)]"
              />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="font-label text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-2 uppercase">
                {GROUP.mention}
              </span>
              <span className="font-display text-[1rem] font-semibold text-ink-strong">
                {GROUP_SECTION.identity}
              </span>
            </span>
          </div>
          <div className="flex flex-col gap-2.5 border-t border-line pt-5 min-[420px]:flex-row min-[420px]:flex-wrap">
            <Button asChild variant="outline" shape="pill">
              <a href={GROUP.tpubPage} target="_blank" rel="noopener noreferrer">
                {GROUP_SECTION.tpubLink}
                <ArrowUpRight aria-hidden="true" />
                <span className="sr-only"> (site du groupe Tukhnanutha, nouvel onglet)</span>
              </a>
            </Button>
            <Button asChild variant="ghost" shape="pill">
              <a href={GROUP.url} target="_blank" rel="noopener noreferrer">
                {GROUP_SECTION.groupLink}
                <ArrowUpRight aria-hidden="true" />
                <span className="sr-only"> (nouvel onglet)</span>
              </a>
            </Button>
          </div>
        </Reveal>
      </div>

      <div className="mt-14 lg:mt-16">
        <p className="mb-4 font-label text-[0.6875rem] font-semibold tracking-[0.16em] text-muted-2 uppercase">
          {GROUP_SECTION.chainLabel}
        </p>
        <Reveal
          as="ol"
          stagger
          aria-label={GROUP_SECTION.chainLabel}
          className="grid grid-cols-1 gap-2 lg:grid-cols-4 lg:gap-8"
        >
          {GROUP_CHAIN.map((node, i) => (
            <li key={node.key} className="relative flex flex-col">
              <div
                className={cx(
                  "relative flex flex-1 flex-col gap-2 overflow-hidden rounded-card border p-5 sm:p-6",
                  node.self
                    ? "border-orange-line bg-orange-soft/60 shadow-brand"
                    : "border-line bg-surface/55",
                )}
              >
                {node.self ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-[3px] bg-grad-brand"
                  />
                ) : null}
                <span className="font-label text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-2 uppercase tabular">
                  {String(i + 1).padStart(2, "0")}
                  {node.self ? " · Pôle Médias, audience & données" : null}
                </span>
                <h3
                  className={cx(
                    "font-display text-[1.25rem] font-semibold tracking-[0.02em]",
                    node.self ? "text-ink-strong" : "text-ink-soft",
                  )}
                >
                  {node.name}
                </h3>
                <p className="text-[0.875rem] leading-snug text-muted">{node.role}</p>
              </div>
              {i < GROUP_CHAIN.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="flex items-center justify-center py-1 text-muted-2 lg:absolute lg:top-1/2 lg:-right-6 lg:w-4 lg:-translate-y-1/2 lg:py-0"
                >
                  <ArrowDown className="size-4 lg:hidden" />
                  <ArrowRight className="hidden size-4 lg:block" />
                </span>
              ) : null}
            </li>
          ))}
        </Reveal>
      </div>
    </Section>
  );
}
