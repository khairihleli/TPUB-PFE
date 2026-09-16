import { ReceiptText } from "lucide-react";

import {
  activeReservations,
  campaignReference,
  type JoinedReservation,
  sumEstimatedCost,
} from "@/components/campaign/campaign-data";
import { EstimateTag } from "@/components/campaign/campaign-ui";
import { SectionCard } from "@/components/ui/section-card";
import { ESTIMATE_COST_RULE } from "@/content/glossary";
import type { CampaignResponse } from "@/lib/api/types";
import { formatEstimate, formatNumber, formatTND } from "@/lib/format";

export interface EstimateInvoiceProps {
  campaign: CampaignResponse;
  reservations: readonly JoinedReservation[];
  className?: string;
}

/**
 * « Coût estimé des créneaux » (glossary): sum of the backend's estimatedCost per créneau
 * (10 % of the budget, fixed at booking). There is no payment endpoint (contract §7.3): amounts
 * are indicative, nothing is billed here.
 */
export function EstimateInvoice({ campaign, reservations, className }: EstimateInvoiceProps) {
  const billable = activeReservations(reservations);
  const released = reservations.filter((r) => !billable.includes(r));
  const total = sumEstimatedCost(billable);

  return (
    <SectionCard
      id="cout-estime"
      icon={ReceiptText}
      title="Coût estimé des créneaux"
      description={`Référence ${campaignReference(campaign.id)}`}
      aside={<EstimateTag rule={ESTIMATE_COST_RULE} />}
      className={className}
    >
      <div>
        {billable.length > 0 ? (
          <ul className="flex flex-col gap-2.5">
            {billable.map((r) => (
              <li key={r.id} className="flex items-baseline justify-between gap-3 text-[0.875rem]">
                <span className="min-w-0 truncate text-ink-soft" title={r.supportName}>
                  {r.supportName}
                </span>
                <span className="shrink-0 whitespace-nowrap text-ink tabular">
                  {formatTND(r.estimatedCost)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.875rem] text-muted">
            Aucun créneau bloqué : l&apos;estimation apparaîtra après la réservation.
          </p>
        )}
        {released.length > 0 ? (
          <p className="mt-3 text-[0.8125rem] text-muted">
            {released.length === 1
              ? "1 créneau libéré ou passé n'est pas compté."
              : `${formatNumber(released.length)} créneaux libérés ou passés ne sont pas comptés.`}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-2 border-t border-line pt-4">
        <p className="font-label text-[0.8125rem] font-semibold text-ink-soft">
          Total estimé des créneaux
        </p>
        <p className="ml-auto font-display text-[1.375rem] leading-none font-semibold whitespace-nowrap text-ink-strong tabular">
          {formatEstimate(total, "DT")}
        </p>
      </div>

      <dl className="mt-4 flex items-baseline justify-between gap-3 text-[0.8125rem]">
        <dt className="text-muted">Budget déclaré</dt>
        <dd className="whitespace-nowrap text-ink-soft tabular">{formatTND(campaign.budget)}</dd>
      </dl>

      <p className="mt-5 rounded-control border border-line bg-overlay-inset p-3 text-[0.8125rem] leading-relaxed text-muted">
        Paiement en ligne : pas encore disponible. Les montants affichés sont des estimations, rien
        n&apos;est facturé depuis cette page.
      </p>
    </SectionCard>
  );
}
