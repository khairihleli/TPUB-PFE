import { Activity, MonitorCheck, MousePointerClick, TrendingUp, Users } from "lucide-react";
import type { ReactNode } from "react";

import { Reveal } from "@/components/marketing/reveal";
import { cx } from "@/lib/cx";

export type ConfidenceNature = "observed" | "estimated" | "counterfactual";

export interface ConfidenceStep {
  level: string;
  nature: ConfidenceNature;
  /** e.g. « Observée (journalisée) ». */
  natureLabel: string;
  /** What TPUB shows for this level. */
  inTpub: string;
  icon?: ReactNode;
}

/** Brief §8.4 « Ce que la plateforme prouve, ce qu'elle estime ». */
export const DEFAULT_CONFIDENCE_STEPS: readonly ConfidenceStep[] = [
  {
    level: "Disponibilité de l'écran",
    nature: "observed",
    natureLabel: "Observée",
    inTpub: "État technique de chaque support",
    icon: <MonitorCheck />,
  },
  {
    level: "Diffusion",
    nature: "observed",
    natureLabel: "Observée (journalisée)",
    inTpub: "Horodatage, écran, zone, campagne, durée",
    icon: <Activity />,
  },
  {
    level: "Interactions (canaux connectés)",
    nature: "observed",
    natureLabel: "Observées",
    inTpub: "Clics, interactions",
    icon: <MousePointerClick />,
  },
  {
    level: "Audience, exposition",
    nature: "estimated",
    natureLabel: "Estimée ou modélisée",
    inTpub: "Présentée avec sa méthode, anonyme et agrégée",
    icon: <Users />,
  },
  {
    level: "Effet commercial",
    nature: "counterfactual",
    natureLabel: "Nécessite un groupe témoin",
    inTpub: "Pas revendiqué par défaut",
    icon: <TrendingUp />,
  },
];

const NATURE = {
  observed: {
    chip: "border-success/35 bg-success/10 text-success",
    rail: "bg-success",
    tile: "border-success/30 bg-success/10 text-success",
    card: "border-line bg-surface/60",
  },
  estimated: {
    chip: "border-warning/35 bg-warning/10 text-warning",
    rail: "bg-warning",
    tile: "border-warning/30 bg-warning/10 text-warning",
    card: "border-dashed border-line-strong bg-surface/30",
  },
  counterfactual: {
    chip: "border-line-strong bg-white/5 text-muted",
    rail: "bg-muted-2",
    tile: "border-line-strong bg-white/5 text-muted",
    card: "border-dashed border-line bg-transparent",
  },
} as const;

export interface ConfidenceLadderProps {
  steps?: readonly ConfidenceStep[];
  /** Closing sentence under the ladder. */
  footnote?: ReactNode;
  className?: string;
}

/**
 * Visual confidence ladder: proven (solid, green) → estimated (dashed, amber) →
 * counterfactual (faint). Rendered as an ordered list; colour is never the only signal.
 */
export function ConfidenceLadder({
  steps = DEFAULT_CONFIDENCE_STEPS,
  footnote = "Une mesure prudente peut sembler moins spectaculaire qu'un chiffre gonflé. Elle reste préférable.",
  className,
}: ConfidenceLadderProps) {
  return (
    <div className={className}>
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.8125rem] text-muted">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-5 rounded-full bg-success" /> Prouvé par la
          plateforme
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2 w-5 rounded-full border border-dashed border-warning bg-warning/20"
          />{" "}
          Estimé, avec sa méthode
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-2 w-5 rounded-full bg-muted-2/60" /> Non revendiqué
        </span>
      </div>

      <Reveal
        as="ol"
        stagger
        className="flex flex-col gap-3"
        aria-label="Échelle de confiance de la mesure"
      >
        {steps.map((s, i) => {
          const n = NATURE[s.nature];
          return (
            <li
              key={s.level}
              className={cx(
                "relative grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 overflow-hidden rounded-card border py-4 pr-4 pl-5 sm:grid-cols-[auto_1.1fr_auto_1fr] sm:gap-x-6 sm:pr-6",
                n.card,
              )}
              style={{ marginLeft: `min(${i * 18}px, ${i * 4}vw)` }}
            >
              <span
                aria-hidden="true"
                className={cx("absolute inset-y-0 left-0 w-[3px]", n.rail)}
              />
              <span
                aria-hidden="true"
                className={cx(
                  "inline-flex size-10 items-center justify-center rounded-[10px] border [&_svg]:size-5",
                  n.tile,
                )}
              >
                {s.icon}
              </span>
              <span className="font-display text-[1rem] font-semibold text-ink-strong sm:text-[1.0625rem]">
                <span className="mr-2 font-label text-[0.75rem] text-muted-2 tabular">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {s.level}
              </span>
              <span
                className={cx(
                  "col-start-2 w-fit rounded-full border px-2.5 py-1 font-label text-[0.6875rem] font-semibold sm:col-start-auto",
                  n.chip,
                )}
              >
                {s.natureLabel}
              </span>
              <span className="col-start-2 text-[0.875rem] leading-snug text-muted sm:col-start-auto">
                {s.inTpub}
              </span>
            </li>
          );
        })}
      </Reveal>

      {footnote ? (
        <p className="mt-6 max-w-[62ch] text-[0.9375rem] leading-relaxed text-ink-soft italic">
          {footnote}
        </p>
      ) : null}
    </div>
  );
}
