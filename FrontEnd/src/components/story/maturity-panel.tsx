import { Check, Minus } from "lucide-react";

import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { STATUS_SECTION_APROPOS } from "@/components/story/a-propos-content";
import { Badge } from "@/components/ui/badge";

/** Honest maturity status: what exists as intention, what can be done now, what is not claimed. */
export function MaturityPanel() {
  const s = STATUS_SECTION_APROPOS;
  return (
    <Section tone="deep" labelledBy="statut-titre">
      <Reveal
        variant="zoom"
        className="relative overflow-hidden rounded-panel border border-line-strong bg-surface/50"
      >
        <div aria-hidden="true" className="hairline-tricolor absolute inset-x-0 top-0 opacity-70" />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(50%_80%_at_0%_0%,var(--color-orange-soft),transparent_70%)]"
        />
        <div className="relative grid grid-cols-1 gap-10 p-6 sm:p-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14 lg:p-14">
          <div className="flex flex-col items-start gap-5">
            <p className="eyebrow">{s.eyebrow}</p>
            <Badge tone="warning" dot size="md">
              {s.badge}
            </Badge>
            <h2
              id="statut-titre"
              className="font-display text-[clamp(1.375rem,2.6vw,2rem)] leading-[1.2] font-semibold tracking-[-0.01em] text-ink-strong"
            >
              {s.notice}
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <h3 className="font-label text-[0.75rem] font-semibold tracking-[0.14em] text-success uppercase">
                {s.nowTitle}
              </h3>
              <ul className="mt-3 flex flex-col gap-2.5">
                {s.now.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[0.9375rem] text-ink-soft">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-success/35 bg-success/10 text-success [&_svg]:size-3"
                    >
                      <Check />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-label text-[0.75rem] font-semibold tracking-[0.14em] text-muted uppercase">
                {s.noClaimTitle}
              </h3>
              <ul className="mt-3 flex flex-col gap-2.5">
                {s.noClaim.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[0.9375rem] text-muted">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong text-muted [&_svg]:size-3"
                    >
                      <Minus />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
