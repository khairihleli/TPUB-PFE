"use client";

import { ReceiptText, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { campaignReference } from "@/components/campaign/campaign-data";
import { EstimateTag } from "@/components/campaign/campaign-ui";
import { ErrorState } from "@/components/ui/error-state";
import { SectionCard } from "@/components/ui/section-card";
import { ESTIMATE_COST_RULE } from "@/content/glossary";
import { pricingApi } from "@/lib/api/endpoints-carte";
import { DAYS_OF_WEEK_FR } from "@/lib/api/types-carte";
import { useResource } from "@/lib/use-resource";
import { multiplierLabel, totalBaseCost } from "@/components/campaign/zone-model";
import type { CampaignEstimateResponse } from "@/lib/api/types";
import type {
  CampaignEstimateResponseCarte,
  PriceBreakdown,
  PricingConfig,
} from "@/lib/api/types-carte";
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

/** Note shown under every dynamic price (docs/round2-contract.md §4.6). */
export const DYNAMIC_PRICE_NOTE =
  "Estimation : tarif ajusté selon le créneau, le jour et la demande.";

/**
 * « Détail du prix » disclosure: base cost, the four factors with their French explanations and the
 * final multiplier. Renders nothing when the backend sent no breakdown (prices before V8).
 */
export function PriceBreakdownDetails({
  pricing,
  className,
}: {
  pricing: PriceBreakdown | null | undefined;
  className?: string;
}) {
  if (!pricing) return null;
  const multiplier = multiplierLabel(pricing.multiplier);
  return (
    <details className={cx("mt-1 text-[0.75rem] text-muted", className)}>
      <summary className="cursor-pointer text-brand-blue-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text">
        Détail du prix{multiplier ? ` (${multiplier})` : ""}
      </summary>
      <dl className="mt-1.5 flex flex-col gap-0.5">
        <div className="flex justify-between gap-3">
          <dt>Coût de base</dt>
          <dd className="tabular">{formatTND(pricing.baseCost)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Créneau horaire</dt>
          <dd className="tabular">×{formatNumber(pricing.factors.hour)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Jour de la semaine</dt>
          <dd className="tabular">×{formatNumber(pricing.factors.dayOfWeek)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Demande</dt>
          <dd className="tabular">×{formatNumber(pricing.factors.demand)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Rareté des Porteurs</dt>
          <dd className="tabular">×{formatNumber(pricing.factors.scarcity)}</dd>
        </div>
        <div className="flex justify-between gap-3 font-semibold text-ink-soft">
          <dt>Multiplicateur appliqué</dt>
          <dd className="tabular">×{formatNumber(pricing.multiplier)}</dd>
        </div>
      </dl>
      {pricing.explanations.length > 0 ? (
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {pricing.explanations.map((e) => (
            <li key={e}>• {e}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1.5">{DYNAMIC_PRICE_NOTE}</p>
    </details>
  );
}

const DAY_LABEL: Record<(typeof DAYS_OF_WEEK_FR)[number], string> = {
  LUNDI: "Lundi",
  MARDI: "Mardi",
  MERCREDI: "Mercredi",
  JEUDI: "Jeudi",
  VENDREDI: "Vendredi",
  SAMEDI: "Samedi",
  DIMANCHE: "Dimanche",
};

function PricingScale({ config }: { config: PricingConfig }) {
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      <ul className="flex flex-col gap-0.5">
        {config.hourBands.map((band) => (
          <li key={band.start}>
            • {band.label} ({band.start}–{band.end}) : ×{formatNumber(band.multiplier)}
          </li>
        ))}
      </ul>
      <p>
        Jours :{" "}
        {DAYS_OF_WEEK_FR.map(
          (day) => `${DAY_LABEL[day]} ×${formatNumber(config.dayMultipliers[day])}`,
        ).join(" · ")}
      </p>
      <p>
        La demande et la rareté des Porteurs ajoutent au plus ×
        {formatNumber(1 + config.demandWeight)} et ×{formatNumber(1 + config.scarcityWeight)} ; le
        multiplicateur reste entre ×{formatNumber(config.minMultiplier)} et ×
        {formatNumber(config.maxMultiplier)}.
      </p>
    </div>
  );
}

/**
 * « Barème tarifaire » disclosure: hour bands, day multipliers and bounds of the dynamic pricing
 * (GET /api/pricing/config, docs/round2-contract.md §4.6). Loaded only when opened.
 */
export function PricingScaleNote({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const config = useResource(open ? "pricing-config" : null, (signal) =>
    pricingApi.config({ signal }),
  );
  return (
    <details
      className={cx("text-[0.8125rem] text-muted", className)}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-brand-blue-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text">
        Barème tarifaire
      </summary>
      {config.error && !config.data ? (
        <p className="mt-1.5 text-danger">Barème indisponible pour le moment.</p>
      ) : !config.data ? (
        <p className="mt-1.5">Chargement du barème…</p>
      ) : !config.data.enabled ? (
        <p className="mt-1.5">
          Tarification dynamique désactivée : le tarif de base s&apos;applique.
        </p>
      ) : (
        <PricingScale config={config.data} />
      )}
    </details>
  );
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
  const carte: CampaignEstimateResponseCarte | null = estimate;
  const lines = carte?.lines ?? [];
  const baseTotal = totalBaseCost(lines);
  const dynamic = lines.some((l) => l.pricing?.enabled === true);
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
          {lines.length > 0 ? (
            <ul className="flex flex-col divide-y divide-line">
              {lines.map((l) => (
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
                    <span className="block text-ink">
                      {formatTND(l.estimatedCost)}
                      {multiplierLabel(l.priceMultiplier) ? (
                        <span className="ml-1 text-[0.75rem] font-semibold text-brand-blue-text">
                          {multiplierLabel(l.priceMultiplier)}
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-[0.75rem] text-muted">
                      {formatNumber(l.estimatedViews)} affichages
                    </span>
                    <PriceBreakdownDetails pricing={l.pricing} className="text-right" />
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
            {dynamic ? (
              <div>
                <dt className="text-muted">Coût de base</dt>
                <dd className="whitespace-nowrap text-ink-soft tabular">{formatTND(baseTotal)}</dd>
              </div>
            ) : null}
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
          <div className="mt-4 flex flex-col gap-2 rounded-control border border-line bg-overlay-inset p-3 text-[0.8125rem] leading-relaxed text-muted">
            <p>
              Montants simulés par ZELQANE à partir des audiences estimées. Le budget consommé suit les
              diffusions réelles ; rien n&apos;est facturé en ligne.
              {dynamic ? ` ${DYNAMIC_PRICE_NOTE}` : ""}
            </p>
            {dynamic ? <PricingScaleNote /> : null}
          </div>
        </>
      )}
    </SectionCard>
  );
}
