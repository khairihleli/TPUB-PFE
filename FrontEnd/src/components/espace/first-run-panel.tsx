import { Box, Check, Plus } from "lucide-react";
import Link from "next/link";

import type { Milestone } from "@/components/espace/kpis";
import { Button } from "@/components/ui/button";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";

export interface FirstRunPanelProps {
  milestones: readonly Milestone[];
}

/**
 * First-run hero (FLOW-10, VD-11): one primary action, one secondary, and 3 milestones read
 * from real data only (no page-visit flags, nothing invented).
 */
export function FirstRunPanel({ milestones }: FirstRunPanelProps) {
  const done = milestones.filter((m) => m.done).length;
  const total = milestones.length;
  const nextKey = milestones.find((m) => !m.done)?.key;
  const progress = Math.round((done / Math.max(1, total)) * 100);

  return (
    <section
      aria-labelledby="first-run-title"
      className="relative overflow-hidden rounded-panel border border-line bg-grad-card p-6 sm:p-8"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px hairline-tricolor"
      />
      <h2
        id="first-run-title"
        className="font-display text-h3 font-semibold tracking-tight text-ink-strong"
      >
        Lancez votre première campagne
      </h2>
      <p className="mt-2 max-w-[60ch] text-body text-muted">
        Préparez un brouillon, réservez des Porteurs sur votre période, puis soumettez-le à
        l&apos;équipe TPUB. Rien n&apos;est diffusé sans validation.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button asChild variant="primary" size="lg" className="max-sm:w-full">
          <Link href={routes.espace.wizard(null)}>
            <Plus aria-hidden="true" />
            Créer ma première campagne
          </Link>
        </Button>
        <Button asChild variant="secondary" size="lg" className="max-sm:w-full">
          <Link href={routes.espace.network()}>
            <Box aria-hidden="true" />
            Voir les Porteurs en 3D
          </Link>
        </Button>
      </div>

      <div className="mt-8 border-t border-line pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3
            id="milestones-title"
            className="font-label text-[0.9375rem] font-semibold text-ink-strong"
          >
            Vos premiers pas
          </h3>
          <span className="font-label text-[0.8125rem] font-medium text-muted tabular">
            {done} sur {total}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-labelledby="milestones-title"
          aria-valuetext={`${done} sur ${total}`}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-overlay-strong"
        >
          <div
            className="h-full rounded-full bg-grad-brand transition-[width] duration-700 ease-expo"
            style={{ width: `${progress}%` }}
          />
        </div>

        <ol
          aria-labelledby="milestones-title"
          className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-3"
        >
          {milestones.map((m, i) => {
            const isNext = m.key === nextKey;
            return (
              <li
                key={m.key}
                className={cx(
                  "flex items-start gap-3 rounded-card border p-4",
                  isNext ? "border-blue-line bg-blue-soft" : "border-line bg-overlay-subtle",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-full border font-label text-[0.8125rem] font-semibold tabular",
                    m.done
                      ? "border-success/40 bg-success/12 text-success"
                      : isNext
                        ? "border-blue-line text-brand-blue-text"
                        : "border-line-strong text-muted",
                  )}
                >
                  {m.done ? <Check className="size-4" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block font-label text-[0.9375rem] font-semibold text-ink-strong">
                    {m.title}
                    <span className="sr-only">{m.done ? " (fait)" : " (à faire)"}</span>
                  </span>
                  <span className="mt-1 block text-[0.8125rem] leading-relaxed text-muted">
                    {m.description}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

const HOW_IT_WORKS = [
  {
    title: "Brouillon",
    text: "Vous saisissez la campagne et réservez des Porteurs. Tout reste modifiable jusqu'à l'envoi.",
  },
  {
    title: "Analyse IA puis examen par l'équipe TPUB",
    text: "Le contenu est analysé automatiquement, puis examiné par l'équipe TPUB en jours ouvrés.",
  },
  {
    title: "Diffusion sur la période validée",
    text: "Une fois validée, la campagne passe sur les Porteurs réservés, aux dates et heures prévues.",
  },
] as const;

/** Honest 3-step explainer that replaces the decorative photo (VD-11). */
export function HowItWorks({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="how-title"
      className={cx("rounded-card border border-line bg-grad-card p-5 sm:p-6", className)}
    >
      <h2 id="how-title" className="font-display text-title font-semibold text-ink-strong">
        Comment ça marche
      </h2>
      <ol className="mt-4 flex flex-col gap-4">
        {HOW_IT_WORKS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span
              aria-hidden="true"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-line-strong font-label text-[0.8125rem] font-semibold text-ink-soft tabular"
            >
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block font-label text-[0.9375rem] font-semibold text-ink-strong">
                {step.title}
              </span>
              <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-muted">
                {step.text}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
