import { ReceiptText, TriangleAlert } from "lucide-react";

import { campaignReference } from "@/components/campaign/campaign-data";
import { EstimateTag } from "@/components/campaign/campaign-ui";
import { ErrorState } from "@/components/ui/error-state";
import { SectionCard } from "@/components/ui/section-card";
import { ESTIMATE_COST_RULE } from "@/content/glossary";
import type { CampaignEstimateResponse } from "@/lib/api/types";
import { RESERVATION_STATUS } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { formatDateRange, formatNumber, formatTND } from "@/lib/format";
import { formatSlot } from "@/lib/time-slots";

/** « Le budget couvre 82 % du coût estimé » / null when there is nothing to cover. */
export function budgetCoverageText(estimate: CampaignEstimateResponse): string | null {
  if (estimate.budgetCoverage === null || estimate.totalCost <= 0) return null;
  const pct = Math.round(Math.min(estimate.budgetCoverage, 9.99) * 100);
  return estimate.budgetSufficient
    ? `Le budget couvre le coût estimé (${formatNumber(pct)} %).`
    : `Le budget ne couvre que ${formatNumber(pct)} % du coût estimé : la diffusion s'arrêtera une fois le budget consommé.`;
}

/** Share of the budget already consumed, 0..100 (null without budget). */
export function consumedPercent(
  estimate: Pick<CampaignEstimateResponse, "budget" | "consumedBudget">,
): number | null {
  if (!(estimate.budget > 0)) return null;
  return Math.min(100, Math.max(0, (estimate.consumedBudget / estimate.budget) * 100));
}

export interface EstimateInvoiceProps {
  campaignId: number;
  estimate: CampaignEstimateResponse | null;
  error?: unknown;
  onRetry?: () => void;
  /** Heading level inside a wizard step. */
  headingAs?: "h2" | "h3";
  className?: string;
}

/**
 * « Estimation » card (contract §2.4 GET /estimates/campaign/{id}): views and cost per reserved
 * Porteur, totals, budget coverage and consumed budget. Simulation figures, nothing is billed.
 */
export function EstimateInvoice({
  campaignId,
  estimate,
  error,
  onRetry,
  headingAs = "h2",
  className,
}: EstimateInvoiceProps) {
  const coverage = estimate ? budgetCoverageText(estimate) : null;
  const consumed = estimate ? consumedPercent(estimate) : null;
  return (
    <SectionCard
      id="estimation"
      icon={ReceiptText}
      headingAs={headingAs}
      title="Estimation et budget"
      description={`Référence ${campaignReference(campaignId)}`}
      aside={<EstimateTag rule={ESTIMATE_COST_RULE} />}
      className={className}
    >
      {!estimate ? (
        error ? (
          <ErrorState
            scope="section"
            error={error}
            onRetry={onRetry}
            title="Estimation indisponible"
          />
        ) : (
          <p className="text-[0.875rem] text-muted">Chargement de l&apos;estimation…</p>
        )
      ) : (
        <>
          {estimate.lines.length > 0 ? (
            <ul className="flex flex-col divide-y divide-line">
              {estimate.lines.map((l) => (
                <li
                  key={l.reservationId}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-[0.875rem]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-ink-soft" title={l.supportName}>
                      {l.supportName}
                    </span>
                    <span className="block text-[0.75rem] text-muted">
                      {l.zoneName} · {formatDateRange(l.startDate, l.endDate, "medium")} ·{" "}
                      {formatSlot(l.startTime, l.endTime)} ·{" "}
                      {RESERVATION_STATUS[l.reservationStatus].label}
                    </span>
                  </span>
                  <span className="shrink-0 text-right whitespace-nowrap tabular">
                    <span className="block text-ink">{formatTND(l.estimatedCost)}</span>
                    <span className="block text-[0.75rem] text-muted">
                      {formatNumber(l.estimatedViews)} affichages
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[0.875rem] text-muted">
              Aucun Porteur réservé : l&apos;estimation apparaîtra après la réservation.
            </p>
          )}

          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[0.875rem]">
            <div>
              <dt className="text-muted">Affichages estimés</dt>
              <dd className="font-display text-[1.25rem] font-semibold text-ink-strong tabular">
                {formatNumber(estimate.totalViews)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Coût estimé</dt>
              <dd className="font-display text-[1.25rem] font-semibold whitespace-nowrap text-ink-strong tabular">
                {formatTND(estimate.totalCost)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Budget</dt>
              <dd className="whitespace-nowrap text-ink-soft tabular">
                {formatTND(estimate.budget)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Budget consommé</dt>
              <dd className="whitespace-nowrap text-ink-soft tabular">
                {formatTND(estimate.consumedBudget)}
                <span className="text-muted"> · reste {formatTND(estimate.remainingBudget)}</span>
              </dd>
            </div>
          </dl>
          {consumed !== null ? (
            <div
              role="meter"
              aria-label="Budget consommé"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(consumed)}
              className="mt-3 h-2 overflow-hidden rounded-full bg-overlay-hover"
            >
              <div
                className={cx(
                  "h-full rounded-full",
                  consumed >= 90 ? "bg-warning" : "bg-brand-blue-text",
                )}
                style={{ width: `${consumed}%` }}
              />
            </div>
          ) : null}
          {coverage ? (
            <p
              className={cx(
                "mt-3 flex items-start gap-1.5 text-[0.8125rem] leading-snug",
                estimate.budgetSufficient ? "text-muted" : "text-warning",
              )}
            >
              {estimate.budgetSufficient ? null : (
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              )}
              {coverage}
            </p>
          ) : null}
          <p className="mt-4 rounded-control border border-line bg-overlay-inset p-3 text-[0.8125rem] leading-relaxed text-muted">
            Montants simulés par TPUB à partir des audiences estimées. Le budget consommé suit les
            diffusions réelles ; rien n&apos;est facturé en ligne.
          </p>
        </>
      )}
    </SectionCard>
  );
}
