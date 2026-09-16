"use client";

import { CircleCheck, Info, LocateFixed, OctagonAlert, TriangleAlert, Wrench } from "lucide-react";

import type {
  CoherenceIssue,
  CoherenceReport,
  CoherenceSeverity,
} from "@/components/admin/network-coherence";
import { cx } from "@/lib/cx";

const SEVERITY: Record<
  CoherenceSeverity,
  { label: string; icon: typeof Info; text: string; chip: string }
> = {
  danger: {
    label: "Erreur",
    icon: OctagonAlert,
    text: "text-danger",
    chip: "border-danger/30 bg-danger/10 text-danger",
  },
  warning: {
    label: "À vérifier",
    icon: TriangleAlert,
    text: "text-warning",
    chip: "border-warning/30 bg-warning/10 text-warning",
  },
  info: {
    label: "À compléter",
    icon: Info,
    text: "text-info",
    chip: "border-info/30 bg-info/10 text-info",
  },
};

const actionClass =
  "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 font-label text-[0.75rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-text [&_svg]:size-3.5";

/**
 * « Contrôle de cohérence »: one section per rule, one row per finding, each with « Localiser »
 * (map) and « Corriger » (form, administrators only).
 */
export function NetworkCoherencePanel({
  report,
  canAct,
  onLocate,
  onFix,
  activeKey = null,
}: {
  report: CoherenceReport;
  canAct: boolean;
  onLocate: (issue: CoherenceIssue) => void;
  onFix: (issue: CoherenceIssue) => void;
  /** Issue whose target is currently inspected (highlighted row). */
  activeKey?: string | null;
}) {
  if (report.total === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <CircleCheck aria-hidden="true" className="size-8 text-success" />
        <p className="font-label text-sm font-semibold text-ink-strong">Réseau cohérent</p>
        <p className="text-[0.8125rem] text-muted">
          Aucune incohérence détectée parmi les règles de contrôle.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[0.8125rem] leading-relaxed text-muted" aria-live="polite">
        {report.total} point{report.total > 1 ? "s" : ""} à traiter
        {report.bySeverity.danger > 0
          ? ` · ${report.bySeverity.danger} erreur${report.bySeverity.danger > 1 ? "s" : ""}`
          : ""}
        {report.bySeverity.warning > 0 ? ` · ${report.bySeverity.warning} à vérifier` : ""}
        {report.bySeverity.info > 0 ? ` · ${report.bySeverity.info} à compléter` : ""}. Contrôle
        calculé sur les données chargées.
      </p>
      {report.groups.map(({ rule, issues }) => {
        const sev = SEVERITY[rule.severity];
        const Icon = sev.icon;
        const headingId = `coherence-${rule.id}`;
        return (
          <section key={rule.id} aria-labelledby={headingId}>
            <div className="flex items-start gap-2">
              <Icon aria-hidden="true" className={cx("mt-0.5 size-4 shrink-0", sev.text)} />
              <div className="min-w-0">
                <h3
                  id={headingId}
                  className="font-label text-[0.8125rem] font-semibold text-ink-strong"
                >
                  {rule.title}{" "}
                  <span
                    className={cx(
                      "ml-1 inline-flex rounded-full border px-1.5 py-px align-middle text-xs tabular",
                      sev.chip,
                    )}
                  >
                    {issues.length}
                    <span className="sr-only"> · {sev.label}</span>
                  </span>
                </h3>
                <p className="mt-0.5 text-[0.75rem] leading-snug text-muted-2">
                  {rule.description}
                </p>
              </div>
            </div>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {issues.map((issue) => (
                <li
                  key={issue.key}
                  className={cx(
                    "rounded-[14px] border px-3 py-2.5 transition-colors",
                    activeKey === `${issue.target.kind}:${issue.target.id}`
                      ? "border-brand-blue-text/50 bg-brand-blue/12"
                      : "border-line bg-surface-2/50",
                  )}
                >
                  <p className="text-[0.8125rem] font-medium break-words text-ink">
                    <span className="sr-only">
                      {issue.target.kind === "zone" ? "Zone " : "Porteur "}
                    </span>
                    {issue.label}
                  </p>
                  <p className="mt-0.5 text-[0.75rem] leading-snug text-muted">{issue.detail}</p>
                  {issue.hint ? (
                    <p className="mt-0.5 text-[0.75rem] leading-snug text-muted-2">{issue.hint}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => onLocate(issue)}
                      aria-label={`Localiser ${issue.label} sur la carte`}
                      className={cx(
                        actionClass,
                        "border-line-strong text-ink-soft hover:bg-overlay-hover hover:text-ink-strong",
                      )}
                    >
                      <LocateFixed aria-hidden="true" />
                      Localiser
                    </button>
                    {canAct ? (
                      <button
                        type="button"
                        onClick={() => onFix(issue)}
                        aria-label={`Corriger ${issue.label}`}
                        className={cx(
                          actionClass,
                          "border-brand-blue-text/40 text-brand-blue-text hover:bg-brand-blue/15",
                        )}
                      >
                        <Wrench aria-hidden="true" />
                        Corriger
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {!canAct ? (
        <p className="text-[0.75rem] text-muted-2">
          Les corrections sont réservées aux administrateurs.
        </p>
      ) : null}
    </div>
  );
}
