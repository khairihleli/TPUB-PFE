"use client";

import { motion } from "framer-motion";
import {
  CircleCheck,
  CircleX,
  ListChecks,
  MessageSquareQuote,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useId, useState } from "react";

import type { SubmitFlowState } from "@/components/campaign/use-submit-flow";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScoreMeter } from "@/components/ui/score-meter";
import { StatusPill } from "@/components/ui/status-pill";
import { presentError } from "@/lib/api/errors";
import type { AiReport, AiReportStatusUpper } from "@/lib/api/types";
import { AI_REPORT_STATUS } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/** What the analysis is designed to look at (brief §8.4, charte des contenus). */
const ANALYSIS_TOPICS = [
  "Lecture du nom et de l'objectif",
  "Formulations trompeuses ou ambiguës",
  "Cohérence entre budget et objectif",
  "Calcul des scores de risque et de qualité",
] as const;

/** Animated « analysis in progress » state. Honest: no fake percentage, just elapsed time. */
export function AiAnalysisProgress({
  campaignName,
  objective,
  startedAt,
}: {
  campaignName: string;
  objective?: string | null;
  startedAt: number;
}) {
  const reduce = useReducedMotion();
  const [topic, setTopic] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [startedAt]);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setTopic((t) => (t + 1) % ANALYSIS_TOPICS.length), 1400);
    return () => window.clearInterval(id);
  }, [reduce]);

  return (
    <div className="relative overflow-hidden rounded-panel border border-blue-line bg-[radial-gradient(120%_90%_at_0%_0%,var(--color-blue-soft),transparent_60%)] p-5 sm:p-7">
      <p className="sr-only" role="status" aria-live="polite">
        Analyse IA en cours. Cela peut prendre quelques secondes.
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-7 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        {/* Scanned document */}
        <div
          aria-hidden="true"
          className="relative mx-auto w-full max-w-[15rem] overflow-hidden rounded-card border border-line-strong bg-surface p-4 shadow-card"
        >
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-brand-orange-text" />
            <span className="h-2 w-16 rounded-full bg-overlay-strong" />
          </div>
          <p className="mt-3 line-clamp-2 font-display text-[0.9375rem] leading-snug font-semibold text-ink-strong">
            {campaignName}
          </p>
          <p className="mt-2 line-clamp-3 text-[0.75rem] leading-relaxed text-muted">
            {objective || "—"}
          </p>
          <div className="mt-3 flex flex-col gap-1.5">
            <span className="h-1.5 w-full rounded-full bg-overlay-hover" />
            <span className="h-1.5 w-4/5 rounded-full bg-overlay-hover" />
            <span className="h-1.5 w-3/5 rounded-full bg-overlay-hover" />
          </div>
          {reduce ? null : (
            <motion.span
              className="absolute inset-x-0 h-12 bg-[linear-gradient(180deg,transparent,color-mix(in_srgb,var(--color-brand-blue-text)_28%,transparent),transparent)]"
              initial={{ top: "-20%" }}
              animate={{ top: ["-20%", "100%"] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: [0.45, 0, 0.55, 1] }}
            />
          )}
        </div>

        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 font-label text-[0.75rem] font-semibold tracking-[0.16em] text-brand-blue-text uppercase">
            <ScanSearch aria-hidden="true" className="size-4" />
            Analyse IA en cours
            <span className="font-medium tracking-normal text-muted normal-case tabular">
              · {elapsed} s
            </span>
          </p>
          <p className="mt-2 font-display text-[1.25rem] leading-snug font-semibold text-ink-strong">
            Votre campagne est en cours d&apos;analyse.
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Cela peut prendre quelques secondes. Restez sur cette page : le résultat s&apos;affiche
            ici.
          </p>
          <ul aria-hidden="true" className="mt-5 flex flex-col gap-2">
            {ANALYSIS_TOPICS.map((label, i) => {
              const active = !reduce && i === topic;
              return (
                <li
                  key={label}
                  className={cx(
                    "flex items-center gap-3 rounded-control border px-3 py-2 text-[0.8125rem] transition-[border-color,background-color,color] duration-500",
                    active
                      ? "border-blue-line bg-blue-soft text-ink-strong"
                      : "border-transparent text-muted",
                  )}
                >
                  <span
                    className={cx(
                      "size-1.5 shrink-0 rounded-full",
                      active
                        ? "pulse-dot bg-brand-blue-text text-brand-blue-text"
                        : "bg-overlay-strong",
                    )}
                  />
                  {label}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

const RESULT_VISUAL: Record<AiReportStatusUpper, { icon: ReactNode; ring: string; title: string }> =
  {
    APPROVED: {
      icon: <CircleCheck className="size-6" />,
      ring: "border-success/30 bg-success/[0.06]",
      title: "Analyse favorable",
    },
    REVIEW_REQUIRED: {
      icon: <TriangleAlert className="size-6" />,
      ring: "border-warning/30 bg-warning/[0.06]",
      title: "Revue manuelle requise",
    },
    REJECTED: {
      icon: <CircleX className="size-6" />,
      ring: "border-danger/35 bg-danger/[0.06]",
      title: "Corrections nécessaires",
    },
  };

const ICON_TONE: Record<AiReportStatusUpper, string> = {
  APPROVED: "text-success border-success/30 bg-success/12",
  REVIEW_REQUIRED: "text-warning border-warning/30 bg-warning/12",
  REJECTED: "text-danger border-danger/30 bg-danger/12",
};

/** Scores, detected issues and recommendation (shared by the wizard and the detail page). */
export function AiReportBody({ report }: { report: AiReport }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2">
        <ScoreMeter
          label="Score de risque"
          value={report.riskScore}
          kind="risk"
          hint="Plus il est bas, mieux c'est."
        />
        <ScoreMeter label="Score de qualité" value={report.qualityScore} kind="quality" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <div className="rounded-card border border-line bg-overlay-inset p-4">
          <p className="flex items-center gap-2 font-label text-[0.8125rem] font-semibold text-ink-soft">
            <ListChecks aria-hidden="true" className="size-4 text-brand-orange-text" />
            Points relevés
          </p>
          {report.detectedIssues.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {report.detectedIssues.map((issue) => (
                <li
                  key={issue}
                  className="rounded-full border border-line-strong bg-overlay-hover px-2.5 py-1 text-[0.8125rem] text-ink"
                >
                  {issue}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[0.875rem] text-muted">Aucun point relevé.</p>
          )}
        </div>
        <div className="rounded-card border border-line bg-overlay-inset p-4">
          <p className="flex items-center gap-2 font-label text-[0.8125rem] font-semibold text-ink-soft">
            <MessageSquareQuote aria-hidden="true" className="size-4 text-brand-orange-text" />
            Recommandation
          </p>
          <p className="mt-3 text-[0.875rem] leading-relaxed text-ink">
            {report.recommendation?.trim() || "Aucune recommandation particulière."}
          </p>
        </div>
      </div>
      <p className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-muted">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-blue-text" />
        L&apos;IA assiste l&apos;analyse ; un expert TPUB valide toujours la campagne avant toute
        diffusion.
      </p>
    </div>
  );
}

/** Result panel shown right after the analysis. */
export function AiResultPanel({
  report,
  actions,
  headingAs: Heading = "h3",
}: {
  report: AiReport;
  actions?: ReactNode;
  /** h3 inside a wizard step (under its h2), h2 directly under the page h1. */
  headingAs?: "h2" | "h3";
}) {
  const visual = RESULT_VISUAL[report.aiStatus];
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cx("rounded-panel border p-5 sm:p-7", visual.ring)}
    >
      <p className="sr-only" role="status" aria-live="polite">
        Modération : {AI_REPORT_STATUS[report.aiStatus].label}.
      </p>
      <div className="flex flex-wrap items-start gap-4">
        <span
          aria-hidden="true"
          className={cx(
            "inline-flex size-12 shrink-0 items-center justify-center rounded-full border",
            ICON_TONE[report.aiStatus],
          )}
        >
          {visual.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <Heading
              id={titleId}
              className="font-display text-[1.25rem] leading-snug font-semibold text-ink-strong"
            >
              {visual.title}
            </Heading>
            <StatusPill type="ai" status={report.aiStatus} size="sm" />
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            {report.aiStatus === "APPROVED"
              ? "Analyse favorable. Votre campagne est en attente de validation TPUB : un expert va l'examiner avant toute diffusion."
              : AI_REPORT_STATUS[report.aiStatus].description}
          </p>
        </div>
      </div>
      <div className="mt-6 border-t border-line pt-6">
        <AiReportBody report={report} />
      </div>
      {actions ? <div className="mt-6 flex flex-wrap gap-2.5">{actions}</div> : null}
    </section>
  );
}

/**
 * Renders the in-flight part of a submit flow (analysing / error). Returns null when idle or
 * done (callers render their own result panel).
 */
export function SubmitFlowStatus({
  state,
  campaignName,
  objective,
  onRetry,
  campaignId,
}: {
  state: SubmitFlowState;
  campaignName: string;
  objective?: string | null;
  onRetry: () => void;
  /** Link target of the « analysis continues » message after the client timeout. */
  campaignId?: number;
}) {
  if (state.phase === "submitting" || state.phase === "analysing") {
    return (
      <AiAnalysisProgress
        campaignName={campaignName}
        objective={objective}
        startedAt={state.startedAt}
      />
    );
  }
  if (state.phase === "error" && state.timedOut) {
    const detailId = state.campaignId ?? campaignId;
    return (
      <Alert
        tone="info"
        title="Analyse IA plus longue que prévu"
        action={
          detailId !== undefined ? (
            <Button asChild variant="primary" size="sm">
              <Link href={routes.espace.campaign(detailId)} data-guard="off">
                Voir la campagne
              </Link>
            </Button>
          ) : undefined
        }
      >
        L&apos;analyse continue côté serveur ; retrouvez le résultat sur la page de la campagne dans
        quelques minutes. Votre campagne est bien soumise.
      </Alert>
    );
  }
  if (state.phase === "error") {
    const p = presentError(state.error);
    return state.stage === "submit" ? (
      <Alert
        tone="danger"
        title="La soumission n'a pas abouti"
        action={
          <Button
            variant="secondary"
            size="sm"

            onClick={onRetry}
            iconLeft={<RefreshCw aria-hidden="true" />}
          >
            Réessayer
          </Button>
        }
      >
        {p.message} Votre campagne est toujours en brouillon.
      </Alert>
    ) : (
      <Alert
        tone="warning"
        title="Campagne soumise, analyse IA non aboutie"
        action={
          <Button
            variant="primary"
            size="sm"

            onClick={onRetry}
            iconLeft={<RefreshCw aria-hidden="true" />}
          >
            Relancer l&apos;analyse
          </Button>
        }
      >
        {p.message} Votre campagne est bien soumise ; relancez l&apos;analyse pour obtenir le
        résultat.
      </Alert>
    );
  }
  return null;
}
