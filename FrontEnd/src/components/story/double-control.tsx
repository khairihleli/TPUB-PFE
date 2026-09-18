import { Ban, BadgeCheck, Flag } from "lucide-react";
import type { ReactNode } from "react";

import { IconTile } from "@/components/marketing/icon-tile";
import { ModerationPipeline } from "@/components/marketing/moderation-pipeline";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { SectionHeader } from "@/components/marketing/section-header";
import {
  CONTENT_CHARTER,
  CONTROL_SECTION,
  type CharterKey,
} from "@/components/story/fonctionnement-content";
import { cx } from "@/lib/cx";

const CHARTER_STYLE: Record<
  CharterKey,
  { icon: ReactNode; tone: "red" | "orange" | "success"; dot: string; rail: string }
> = {
  refuses: { icon: <Ban />, tone: "red", dot: "bg-brand-red-text", rail: "bg-brand-red" },
  signales: {
    icon: <Flag />,
    tone: "orange",
    dot: "bg-brand-orange-text",
    rail: "bg-brand-orange",
  },
  toujours: { icon: <BadgeCheck />, tone: "success", dot: "bg-success", rail: "bg-success" },
};

/** AI + human double control: moderation pipeline + content charter summary. */
export function DoubleControl() {
  return (
    <Section id="controle" tone="deep" labelledBy="controle-titre" className="overflow-hidden">
      <SectionHeader
        id="controle-titre"
        eyebrow={CONTROL_SECTION.eyebrow}
        title={CONTROL_SECTION.title}
        highlight={CONTROL_SECTION.highlight}
        lede={CONTROL_SECTION.lede}
        align="center"
      />

      <ModerationPipeline />

      <div className="mt-16 grid grid-cols-1 gap-10 lg:mt-20 lg:grid-cols-[0.7fr_1.3fr] lg:gap-14 [&>*]:min-w-0">
        <Reveal variant="left" className="flex flex-col gap-4">
          <h3 className="font-display text-h3 text-ink-strong">Charte des contenus, en bref</h3>
          <p className="max-w-[46ch] text-[0.9375rem] leading-relaxed text-muted">
            {CONTROL_SECTION.caveat}
          </p>
        </Reveal>
        <Reveal as="ul" stagger className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {CONTENT_CHARTER.map((group) => {
            const style = CHARTER_STYLE[group.key];
            return (
              <li
                key={group.key}
                className="relative flex flex-col overflow-hidden rounded-card border border-line bg-surface/55 p-5"
              >
                <span
                  aria-hidden="true"
                  className={cx("absolute inset-x-0 top-0 h-[2px]", style.rail)}
                />
                <div className="flex items-center gap-3">
                  <IconTile icon={style.icon} tone={style.tone} size="sm" />
                  <h4 className="font-display text-[1rem] font-semibold text-ink-strong">
                    {group.title}
                  </h4>
                </div>
                <ul className="mt-4 flex flex-col gap-2">
                  {group.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-[0.875rem] leading-snug text-ink-soft"
                    >
                      <span
                        aria-hidden="true"
                        className={cx("mt-[0.5em] size-1.5 shrink-0 rounded-full", style.dot)}
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </Reveal>
      </div>
    </Section>
  );
}
