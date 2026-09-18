import type { ReactNode } from "react";

import { Reveal } from "@/components/marketing/reveal";
import { cx } from "@/lib/cx";

export interface NumberedStep {
  title: string;
  description: ReactNode;
  icon?: ReactNode;
}

export interface NumberedStepsProps {
  steps: readonly NumberedStep[];
  /**
   * grid = cards in columns with big 01–04 numbers · chain = vertical chain with connectors
   */
  layout?: "grid" | "chain";
  /** Heading level of each step title. */
  headingAs?: "h3" | "h4";
  className?: string;
}

/** Numbered journey (01–0n) as a card grid or a vertical chain. Ordered list semantics. */
export function NumberedSteps({
  steps,
  layout = "grid",
  headingAs = "h3",
  className,
}: NumberedStepsProps) {
  const Heading = headingAs;

  if (layout === "chain") {
    return (
      <Reveal as="ol" stagger className={cx("relative flex flex-col", className)}>
        {steps.map((s, i) => (
          <li
            key={s.title}
            className="relative grid grid-cols-[56px_1fr] gap-5 pb-8 last:pb-0 sm:grid-cols-[72px_1fr] sm:gap-7"
          >
            {i < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className="absolute top-14 bottom-0 left-[27px] w-px bg-[linear-gradient(180deg,var(--color-orange-line),var(--color-line))] sm:top-[68px] sm:left-[35px]"
              />
            ) : null}
            <span
              aria-hidden="true"
              className="relative inline-flex size-14 items-center justify-center rounded-full border border-orange-line bg-bg font-display text-lg font-semibold text-brand-orange-text sm:size-[72px] sm:text-xl"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="pt-2.5 sm:pt-4">
              <Heading className="font-display text-[1.125rem] font-semibold text-ink-strong sm:text-[1.25rem]">
                {s.title}
              </Heading>
              <div className="mt-2 max-w-[62ch] text-[0.9375rem] leading-relaxed text-muted">
                {s.description}
              </div>
            </div>
          </li>
        ))}
      </Reveal>
    );
  }

  return (
    <Reveal
      as="ol"
      stagger
      className={cx(
        "grid gap-4 sm:grid-cols-2",
        steps.length === 3 ? "lg:grid-cols-3" : steps.length >= 4 ? "lg:grid-cols-4" : "",
        className,
      )}
    >
      {steps.map((s, i) => (
        <li
          key={s.title}
          className="glass-card group/step flex flex-col p-6"
          data-interactive="true"
        >
          <div className="flex items-start justify-between gap-3">
            <span
              aria-hidden="true"
              className="font-display text-[2.5rem] leading-none font-bold text-transparent [-webkit-text-stroke:1px_color-mix(in_srgb,var(--color-brand-orange-text)_55%,transparent)] transition-colors duration-500 group-hover/step:text-brand-orange-text/90"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            {s.icon ? (
              <span
                aria-hidden="true"
                className="inline-flex size-10 items-center justify-center rounded-control border border-line bg-surface-2 text-brand-orange-text transition-transform duration-300 ease-smooth group-hover/step:-translate-y-0.5 group-hover/step:-rotate-6 [&_svg]:size-5"
              >
                {s.icon}
              </span>
            ) : null}
          </div>
          <Heading className="mt-6 font-display text-[1.0625rem] font-semibold text-ink-strong">
            <span className="sr-only">Étape {i + 1} :</span> {s.title}
          </Heading>
          <div className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{s.description}</div>
        </li>
      ))}
    </Reveal>
  );
}
