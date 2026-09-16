import { BadgeCheck, FileText, ScanSearch, UserCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Reveal } from "@/components/marketing/reveal";
import { ScoreMeter } from "@/components/ui/score-meter";
import { cx } from "@/lib/cx";

export interface ModerationPipelineProps {
  /** Example scores (clearly labelled « Valeurs d'exemple »). */
  riskScore?: number;
  qualityScore?: number;
  className?: string;
}

function StageLabel({ n, icon, children }: { n: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span
        aria-hidden="true"
        className="inline-flex size-9 items-center justify-center rounded-[10px] border border-orange-line bg-orange-soft text-brand-orange-text [&_svg]:size-4.5"
      >
        {icon}
      </span>
      <span className="font-label text-[0.6875rem] font-semibold tracking-[0.18em] text-muted uppercase">
        <span className="text-brand-orange-text">{n}</span> · {children}
      </span>
    </div>
  );
}

function Connector() {
  return (
    <div
      aria-hidden="true"
      className="relative flex items-center justify-center py-1 lg:px-1 lg:py-0"
    >
      <span className="block h-8 w-px bg-[linear-gradient(180deg,var(--color-orange-line),var(--color-blue-line))] lg:h-px lg:w-10 lg:bg-[linear-gradient(90deg,var(--color-orange-line),var(--color-blue-line))]" />
      <span className="absolute size-1.5 rounded-full bg-brand-orange-text shadow-[0_0_12px_var(--color-brand-orange)]" />
    </div>
  );
}

/**
 * Double control made tangible: campaign card → AI gauges (Risque /100, Qualité /100) →
 * « Validé par un expert TPUB ». All values are labelled as examples.
 */
export function ModerationPipeline({
  riskScore = 20,
  qualityScore = 75,
  className,
}: ModerationPipelineProps) {
  return (
    <figure className={cx("relative", className)}>
      <figcaption className="sr-only">
        Illustration du double contrôle : une campagne est analysée par l&apos;IA (score de risque{" "}
        {riskScore} sur 100 et score de qualité {qualityScore} sur 100, valeurs d&apos;exemple),
        puis validée par un expert TPUB avant diffusion.
      </figcaption>

      <Reveal
        stagger
        className="grid grid-cols-1 items-stretch gap-0 lg:grid-cols-[1fr_auto_1.15fr_auto_1fr]"
      >
        {/* 1 · Campaign */}
        <div className="glass-card flex flex-col p-5 sm:p-6">
          <StageLabel n="01" icon={<FileText />}>
            Campagne soumise
          </StageLabel>
          <p className="font-display text-lg font-semibold text-ink-strong">
            Ouverture de boutique
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            « Nouvelle adresse au centre-ville, ouverte du lundi au samedi. »
          </p>
          <dl className="mt-auto grid grid-cols-2 gap-3 border-t border-line pt-4 text-[0.8125rem]">
            <div>
              <dt className="text-muted-2">Zone</dt>
              <dd className="font-medium text-ink-soft">Centre-ville</dd>
            </div>
            <div>
              <dt className="text-muted-2">Créneau</dt>
              <dd className="font-medium text-ink-soft">08:00 – 20:00</dd>
            </div>
          </dl>
        </div>

        <Connector />

        {/* 2 · AI analysis */}
        <div className="glass-card flex flex-col p-5 sm:p-6">
          <div className="flex items-start justify-between gap-2">
            <StageLabel n="02" icon={<ScanSearch />}>
              Analyse IA
            </StageLabel>
            <span className="rounded-full border border-line-strong px-2 py-0.5 font-label text-[0.625rem] font-semibold tracking-[0.08em] text-muted uppercase">
              Valeurs d&apos;exemple
            </span>
          </div>
          <div className="flex flex-col gap-4">
            <ScoreMeter
              label="Score de risque"
              value={riskScore}
              kind="risk"
              hint="Plus il est bas, mieux c'est."
            />
            <ScoreMeter label="Score de qualité" value={qualityScore} kind="quality" />
          </div>
          <div className="mt-5 rounded-control border border-line bg-black/20 px-3.5 py-3 text-[0.8125rem] leading-snug">
            <span className="text-muted-2">Recommandation · </span>
            <span className="text-ink-soft">Contenu conforme, à valider par un expert.</span>
          </div>
        </div>

        <Connector />

        {/* 3 · Human validation */}
        <div className="glass-card flex flex-col p-5 sm:p-6">
          <StageLabel n="03" icon={<UserCheck />}>
            Validation humaine
          </StageLabel>
          <div className="flex flex-1 flex-col items-start justify-center gap-4">
            <span className="inline-flex items-center gap-2.5 rounded-full border border-success/35 bg-success/10 py-2 pr-4 pl-2.5 font-label text-sm font-semibold text-success">
              <BadgeCheck aria-hidden="true" className="size-5" />
              Validé par un expert TPUB
            </span>
            <ul className="flex flex-col gap-2 text-[0.8125rem] leading-snug text-muted">
              <li className="flex gap-2">
                <span
                  aria-hidden="true"
                  className="mt-[0.5em] size-1 shrink-0 rounded-full bg-muted"
                />
                L&apos;IA assiste, une personne décide.
              </li>
              <li className="flex gap-2">
                <span
                  aria-hidden="true"
                  className="mt-[0.5em] size-1 shrink-0 rounded-full bg-muted"
                />
                Décision motivée et enregistrée.
              </li>
              <li className="flex gap-2">
                <span
                  aria-hidden="true"
                  className="mt-[0.5em] size-1 shrink-0 rounded-full bg-muted"
                />
                Créneaux confirmés à la validation.
              </li>
            </ul>
          </div>
        </div>
      </Reveal>
    </figure>
  );
}
