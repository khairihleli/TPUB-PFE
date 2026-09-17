"use client";

import { motion } from "framer-motion";
import {
  CircleCheck,
  CircleX,
  Hourglass,
  Lightbulb,
  ListChecks,
  RefreshCw,
  ScanSearch,
  ScanText,
  ShieldCheck,
  Tags,
  TriangleAlert,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";

import type { SubmitFlowState } from "@/components/campaign/use-submit-flow";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreMeter } from "@/components/ui/score-meter";
import { StatusPill } from "@/components/ui/status-pill";
import { presentError } from "@/lib/api/errors";
import { SUBMIT_INCOMPLETE_LABELS } from "@/lib/api/messages";
import type {
  AiIssue,
  AiIssueSource,
  AiReport,
  AiReportStatusUpper,
  Severity,
  SubmitIncompleteKey,
} from "@/lib/api/types";
import {
  AI_CONTENT_TYPE_LABEL,
  AI_ENGINE_LABEL,
  AI_ISSUE_SOURCE_LABEL,
  AI_REPORT_STATUS,
  AI_SECTOR_LABEL,
  AI_SEVERITY,
  OCR_ENGINE_LABEL,
} from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { formatDateTime } from "@/lib/format";
import { useReducedMotion } from "@/lib/use-reduced-motion";

/** What the analysis looks at (contract §2.2). */
const ANALYSIS_TOPICS = [
  "Lecture du nom et de l'objectif",
  "Règles internes et mots interdits",
  "Qualité des visuels et texte dans l'image",
  "Calcul des scores de risque et de qualité",
] as const;

/** Animated « analysis in progress » state. Honest: no fake percentage, just elapsed time. */
export function AiAnalysisProgress({
  campaignName,
  objective,
  startedAt,
  title = "Analyse IA en cours…",
}: {
  campaignName: string;
  objective?: string | null;
  startedAt: number;
  title?: string;
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
        {title} Cela peut prendre quelques secondes.
      </p>
      <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-7 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
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
            {title}
            <span className="font-medium tracking-normal text-muted normal-case tabular">
              · {elapsed} s
            </span>
          </p>
          <p className="mt-2 font-display text-[1.25rem] leading-snug font-semibold text-ink-strong">
            Votre campagne est en cours d&apos;analyse.
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Restez sur cette page : le résultat s&apos;affiche ici.
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

const SEVERITY_ORDER: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export interface IssueGroup {
  source: AiIssueSource;
  label: string;
  issues: AiIssue[];
}

/**
 * Issues grouped by source (most severe group first, most severe issue first). Older reports
 * without `issues` fall back to `detectedIssues` under « Texte ».
 */
export function groupIssues(report: Pick<AiReport, "issues" | "detectedIssues">): IssueGroup[] {
  const issues: AiIssue[] =
    report.issues && report.issues.length > 0
      ? report.issues
      : report.detectedIssues.map((label) => ({ label, severity: "MEDIUM", source: "TEXTE" }));
  const groups = new Map<AiIssueSource, AiIssue[]>();
  for (const issue of issues) {
    const list = groups.get(issue.source) ?? [];
    list.push(issue);
    groups.set(issue.source, list);
  }
  const worst = (list: AiIssue[]) => Math.min(...list.map((i) => SEVERITY_ORDER[i.severity]));
  return [...groups.entries()]
    .map(([source, list]) => ({
      source,
      label: AI_ISSUE_SOURCE_LABEL[source] ?? source,
      issues: [...list].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]),
    }))
    .sort((a, b) => worst(a.issues) - worst(b.issues) || a.label.localeCompare(b.label, "fr"));
}

function Panel({
  icon,
  title,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("rounded-card border border-line bg-overlay-inset p-4", className)}>
      <p className="flex items-center gap-2 font-label text-[0.8125rem] font-semibold text-ink-soft [&_svg]:size-4 [&_svg]:text-brand-orange-text">
        <span aria-hidden="true">{icon}</span>
        {title}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** Scores, grouped issues, recommendations, OCR text and sector (wizard, detail page). */
export function AiReportBody({ report }: { report: AiReport }) {
  const groups = groupIssues(report);
  const recommendations = report.recommendations ?? [];
  const ocrEngine = report.ocrEngine ?? "AUCUN";
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

      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-[0.8125rem]">
        {report.sector ? (
          <div className="flex items-center gap-1.5">
            <dt className="text-muted">Secteur détecté</dt>
            <dd>
              <Badge tone="cat-2" size="sm" icon={<Tags aria-hidden="true" />}>
                {AI_SECTOR_LABEL[report.sector]}
              </Badge>
            </dd>
          </div>
        ) : null}
        {report.contentType ? (
          <div className="flex items-center gap-1.5">
            <dt className="text-muted">Contenu analysé</dt>
            <dd className="text-ink-soft">{AI_CONTENT_TYPE_LABEL[report.contentType]}</dd>
          </div>
        ) : null}
        {report.engine ? (
          <div className="flex items-center gap-1.5">
            <dt className="text-muted">Moteur</dt>
            <dd className="text-ink-soft">{AI_ENGINE_LABEL[report.engine]}</dd>
          </div>
        ) : null}
        {report.checkedAt ? (
          <div className="flex items-center gap-1.5">
            <dt className="text-muted">{report.preview ? "Pré-analyse du" : "Analyse du"}</dt>
            <dd className="text-ink-soft tabular">{formatDateTime(report.checkedAt)}</dd>
          </div>
        ) : null}
      </dl>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <Panel icon={<ListChecks />} title="Points relevés">
          {groups.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {groups.map((g) => (
                <li key={g.source}>
                  <p className="text-[0.75rem] font-semibold tracking-wide text-muted uppercase">
                    {g.label}
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {g.issues.map((issue, i) => (
                      <li
                        key={`${issue.label}-${i}`}
                        className="flex flex-wrap items-baseline gap-2 text-[0.875rem] text-ink"
                      >
                        <Badge tone={AI_SEVERITY[issue.severity].tone} size="sm">
                          {AI_SEVERITY[issue.severity].label}
                        </Badge>
                        <span className="min-w-0 flex-1 break-words">{issue.label}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[0.875rem] text-muted">Aucun point relevé.</p>
          )}
        </Panel>

        <Panel icon={<Lightbulb />} title="Recommandations">
          <p className="text-[0.875rem] leading-relaxed font-medium text-ink">
            {report.recommendation?.trim() || "Aucune recommandation particulière."}
          </p>
          {recommendations.length > 0 ? (
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {recommendations.map((r) => (
                <li key={r} className="flex gap-2 text-[0.875rem] leading-relaxed text-ink-soft">
                  <span
                    aria-hidden="true"
                    className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-brand-orange-text"
                  />
                  {r}
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      </div>

      <Panel icon={<ScanText />} title="Texte détecté dans les visuels">
        <p className="mb-2">
          <Badge tone={ocrEngine === "AUCUN" ? "neutral" : "info"} size="sm">
            {OCR_ENGINE_LABEL[ocrEngine]}
          </Badge>
        </p>
        {report.extractedText?.trim() ? (
          <blockquote className="rounded-control border-l-2 border-line-strong bg-surface px-3 py-2 text-[0.875rem] leading-relaxed whitespace-pre-wrap text-ink-soft">
            {report.extractedText}
          </blockquote>
        ) : (
          <p className="text-[0.875rem] text-muted">Aucun texte extrait des visuels.</p>
        )}
        {ocrEngine === "SIMULE" ? (
          <p className="mt-2 text-[0.75rem] leading-snug text-muted">
            OCR simulé : le texte est déduit du nom du fichier, faute de moteur OCR installé.
          </p>
        ) : null}
      </Panel>

      <p className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-muted">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-blue-text" />
        L&apos;IA assiste l&apos;analyse ; un expert TPUB valide toujours la campagne avant toute
        diffusion.
      </p>
    </div>
  );
}

const RESULT_VISUAL: Record<
  AiReportStatusUpper | "PENDING",
  { icon: ReactNode; ring: string; title: string; iconTone: string }
> = {
  APPROVED: {
    icon: <CircleCheck className="size-6" />,
    ring: "border-success/30 bg-success/[0.06]",
    title: "Analyse favorable",
    iconTone: "text-success border-success/30 bg-success/12",
  },
  REVIEW_REQUIRED: {
    icon: <TriangleAlert className="size-6" />,
    ring: "border-warning/30 bg-warning/[0.06]",
    title: "Revue manuelle requise",
    iconTone: "text-warning border-warning/30 bg-warning/12",
  },
  REJECTED: {
    icon: <CircleX className="size-6" />,
    ring: "border-danger/35 bg-danger/[0.06]",
    title: "Corrections nécessaires",
    iconTone: "text-danger border-danger/30 bg-danger/12",
  },
  PENDING: {
    icon: <Hourglass className="size-6" />,
    ring: "border-line bg-surface",
    title: "Campagne soumise",
    iconTone: "text-muted border-line-strong bg-overlay-hover",
  },
};

const RESULT_TEXT: Record<AiReportStatusUpper | "PENDING", string> = {
  APPROVED:
    "Analyse favorable. Votre campagne attend la validation TPUB : un expert l'examine avant toute diffusion.",
  REVIEW_REQUIRED: AI_REPORT_STATUS.REVIEW_REQUIRED.description,
  REJECTED: AI_REPORT_STATUS.REJECTED.description,
  PENDING:
    "Votre campagne est soumise mais le résultat de l'analyse n'est pas encore disponible. Relancez l'analyse ou revenez dans quelques instants.",
};

/** Result panel shown right after an analysis (submission, pre-analysis, relaunch). */
export function AiResultPanel({
  report,
  outcome,
  actions,
  headingAs: Heading = "h3",
  preview = false,
}: {
  /** Full report when available. */
  report: AiReport | null;
  /** AI outcome (from the report or the campaign status); null = not analysed yet. */
  outcome?: AiReportStatusUpper | null;
  actions?: ReactNode;
  /** h3 inside a wizard step (under its h2), h2 directly under the page h1. */
  headingAs?: "h2" | "h3";
  /** Pre-analysis of a draft (nothing is submitted). */
  preview?: boolean;
}) {
  const key = report?.aiStatus ?? outcome ?? "PENDING";
  const visual = RESULT_VISUAL[key];
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cx("rounded-panel border p-5 sm:p-7", visual.ring)}
    >
      <p className="sr-only" role="status" aria-live="polite">
        {preview ? "Pré-analyse" : "Modération"} :{" "}
        {key === "PENDING" ? "résultat en attente" : AI_REPORT_STATUS[key].label}.
      </p>
      <div className="flex flex-wrap items-start gap-4">
        <span
          aria-hidden="true"
          className={cx(
            "inline-flex size-12 shrink-0 items-center justify-center rounded-full border",
            visual.iconTone,
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
              {preview ? `Pré-analyse : ${visual.title.toLowerCase()}` : visual.title}
            </Heading>
            {key !== "PENDING" ? <StatusPill type="ai" status={key} size="sm" /> : null}
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            {preview
              ? "Résultat indicatif : la campagne reste en brouillon. L'analyse officielle a lieu à la soumission."
              : RESULT_TEXT[key]}
          </p>
        </div>
      </div>
      {report ? (
        <div className="mt-6 border-t border-line pt-6">
          <AiReportBody report={report} />
        </div>
      ) : null}
      {actions ? <div className="mt-6 flex flex-wrap gap-2.5">{actions}</div> : null}
    </section>
  );
}

/**
 * In-flight and failure part of a submit flow. Returns null when idle or done (callers render
 * their own result panel).
 */
export function SubmitFlowStatus({
  state,
  campaignName,
  objective,
  onRetry,
}: {
  state: SubmitFlowState;
  campaignName: string;
  objective?: string | null;
  onRetry: () => void;
}) {
  if (state.phase === "submitting") {
    return (
      <AiAnalysisProgress
        campaignName={campaignName}
        objective={objective}
        startedAt={state.startedAt}
      />
    );
  }
  if (state.phase !== "error") return null;
  if (state.incomplete) {
    const entries = Object.entries(state.incomplete);
    return (
      <Alert tone="warning" title="Campagne incomplète">
        <p>Complétez ces éléments avant de soumettre :</p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
          {entries.map(([key, message]) => (
            <li key={key}>
              <span className="font-semibold">
                {SUBMIT_INCOMPLETE_LABELS[key as SubmitIncompleteKey] ?? key}
              </span>{" "}
              : {message}
            </li>
          ))}
        </ul>
      </Alert>
    );
  }
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
      {p.message}
    </Alert>
  ) : (
    <Alert
      tone="warning"
      title="Analyse IA non aboutie"
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
