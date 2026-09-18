import {
  BadgeCheck,
  CalendarClock,
  FileText,
  Hourglass,
  Images,
  LineChart,
  Map as MapIcon,
  MonitorPlay,
  ScanSearch,
  UserPlus,
} from "lucide-react";
import type { ReactNode } from "react";

import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { SectionHeader } from "@/components/marketing/section-header";
import {
  JOURNEY_PHASES,
  JOURNEY_SECTION,
  JOURNEY_STEPS,
  type JourneyIconKey,
  type JourneyPhase,
  type JourneyStep,
} from "@/components/story/fonctionnement-content";
import { StatusPill } from "@/components/ui/status-pill";
import { cx } from "@/lib/cx";

const STEP_ICON: Record<JourneyIconKey, ReactNode> = {
  compte: <UserPlus />,
  exploration: <MapIcon />,
  campagne: <FileText />,
  creations: <Images />,
  reservation: <CalendarClock />,
  analyse: <ScanSearch />,
  validation: <BadgeCheck />,
  diffusion: <MonitorPlay />,
  suivi: <LineChart />,
};

export interface PhaseSummary {
  phase: JourneyPhase;
  label: string;
  from: number;
  to: number;
}

/** Groups consecutive steps by phase → « Étapes 01–02 ». Step numbers are 1-based. */
export function summarizePhases(steps: readonly JourneyStep[]): PhaseSummary[] {
  const out: PhaseSummary[] = [];
  steps.forEach((s, i) => {
    const last = out[out.length - 1];
    if (last && last.phase === s.phase) last.to = i + 1;
    else out.push({ phase: s.phase, label: JOURNEY_PHASES[s.phase], from: i + 1, to: i + 1 });
  });
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");

function StepCard({ step, index }: { step: JourneyStep; index: number }) {
  const hasStatus = (step.statuses?.length ?? 0) > 0 || (step.reservations?.length ?? 0) > 0;
  return (
    <article className="glass-card p-5 sm:p-6" data-interactive="true">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-display text-[1.125rem] font-semibold text-ink-strong sm:text-[1.25rem]">
          <span className="sr-only">Étape {index + 1} : </span>
          {step.title}
        </h3>
        <span className="font-label text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-2 uppercase">
          {JOURNEY_PHASES[step.phase]}
        </span>
      </header>
      <p className="mt-2 max-w-[62ch] text-[0.9375rem] leading-relaxed text-muted">{step.text}</p>

      {step.note ? (
        <p className="mt-4 flex items-start gap-2.5 rounded-control border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-[0.8125rem] leading-snug text-ink-soft">
          <Hourglass aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          {step.note}
        </p>
      ) : null}

      <dl className="mt-5 grid grid-cols-1 gap-3 border-t border-line pt-4 text-[0.8125rem] sm:grid-cols-[88px_1fr] sm:gap-x-4">
        {hasStatus ? (
          <>
            <dt className="font-label text-[0.6875rem] font-semibold tracking-[0.1em] text-muted-2 uppercase sm:pt-1">
              Statut
            </dt>
            <dd className="flex flex-wrap items-center gap-1.5">
              {step.statuses?.map((s) => (
                <StatusPill key={s} type="campaign-status" status={s} size="sm" />
              ))}
              {step.reservations && step.reservations.length > 0 ? (
                <>
                  <span className="mx-1 text-muted-2">Créneau</span>
                  {step.reservations.map((r) => (
                    <StatusPill key={r} type="reservation" status={r} size="sm" />
                  ))}
                </>
              ) : null}
            </dd>
          </>
        ) : null}
        <dt className="font-label text-[0.6875rem] font-semibold tracking-[0.1em] text-muted-2 uppercase">
          Trace
        </dt>
        <dd className="text-ink-soft">{step.trace}</dd>
      </dl>
    </article>
  );
}

/** Detailed 9-step vertical journey with connectors, statuses and what gets recorded. */
export function JourneyTimeline({ steps = JOURNEY_STEPS }: { steps?: readonly JourneyStep[] }) {
  const phases = summarizePhases(steps);
  return (
    <Section id="parcours" labelledBy="parcours-titre">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16 [&>*]:min-w-0">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeader
            id="parcours-titre"
            eyebrow={JOURNEY_SECTION.eyebrow}
            title={JOURNEY_SECTION.title}
            highlight={JOURNEY_SECTION.highlight}
            breakBeforeHighlight
            lede={JOURNEY_SECTION.lede}
            className="mb-8! sm:mb-10!"
          />
          <Reveal
            as="ol"
            stagger
            aria-label="Phases du parcours"
            className="hidden border-t border-line lg:block"
          >
            {phases.map((p, i) => (
              <li
                key={p.phase}
                className="flex items-center justify-between gap-4 border-b border-line py-3.5"
              >
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="font-display text-[0.875rem] font-semibold text-brand-orange-text tabular"
                  >
                    {pad(i + 1)}
                  </span>
                  <span className="font-display text-[0.9375rem] font-semibold text-ink-strong">
                    {p.label}
                  </span>
                </span>
                <span className="text-[0.8125rem] text-muted tabular">
                  {p.from === p.to ? `Étape ${pad(p.from)}` : `Étapes ${pad(p.from)}–${pad(p.to)}`}
                </span>
              </li>
            ))}
          </Reveal>
        </div>

        <Reveal
          as="ol"
          stagger
          aria-label="Parcours en neuf étapes"
          className="relative flex flex-col"
        >
          {steps.map((step, i) => {
            const last = i === steps.length - 1;
            const next = steps[i + 1];
            const phaseChange = next !== undefined && next.phase !== step.phase;
            return (
              <li
                key={step.key}
                className={cx(
                  "relative grid grid-cols-[44px_1fr] gap-4 sm:grid-cols-[60px_1fr] sm:gap-6",
                  !last && (phaseChange ? "pb-10" : "pb-5"),
                )}
              >
                {!last ? (
                  <span
                    aria-hidden="true"
                    className={cx(
                      "absolute top-12 bottom-0 left-[21.5px] w-px sm:top-[64px] sm:left-[29.5px]",
                      phaseChange
                        ? "bg-[linear-gradient(180deg,var(--color-orange-line),var(--color-line)_60%,var(--color-blue-line))]"
                        : "bg-[linear-gradient(180deg,var(--color-orange-line),var(--color-line))]",
                    )}
                  />
                ) : null}
                <span aria-hidden="true" className="relative flex flex-col items-center">
                  <span className="relative inline-flex size-11 items-center justify-center rounded-full border border-orange-line bg-bg text-brand-orange-text shadow-[0_0_0_6px_var(--color-bg)] sm:size-[60px] [&_svg]:size-[18px] sm:[&_svg]:size-[22px]">
                    {STEP_ICON[step.key]}
                    <span className="absolute -right-1 -bottom-1 inline-flex min-w-6 items-center justify-center rounded-full border border-line-strong bg-surface-2 px-1 font-label text-[0.625rem] leading-5 font-semibold text-ink-strong tabular">
                      {pad(i + 1)}
                    </span>
                  </span>
                </span>
                <div className="min-w-0 sm:pt-1">
                  <StepCard step={step} index={i} />
                </div>
              </li>
            );
          })}
        </Reveal>
      </div>
    </Section>
  );
}
