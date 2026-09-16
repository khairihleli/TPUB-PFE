"use client";

import { Check, Lock } from "lucide-react";
import { type ReactNode, type Ref, useEffect, useRef } from "react";

import {
  campaignReference,
  WIZARD_STEPS,
  type WizardStep,
} from "@/components/campaign/campaign-actions";
import { activeReservations, sumEstimatedCost } from "@/components/campaign/campaign-data";
import type { CampaignResponse, ReservationResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { formatDateRange, formatEstimate, formatTimeRange, formatTND } from "@/lib/format";

/** CSS variable: bottom edge of the sticky wizard strip (zone headers stick under it). */
export const WIZARD_STICKY_VAR = "--wizard-sticky-top";
const TOPBAR_PX = 68;

function stepLabel(step: WizardStep): string {
  return WIZARD_STEPS.find((s) => s.step === step)?.label ?? "";
}

/** « Étape 2/3 · Porteurs → Vérification & envoi » (visible below sm). */
export function compactStepLabel(current: WizardStep): string {
  const next = WIZARD_STEPS.find((s) => s.step === current + 1);
  return `Étape ${current}/${WIZARD_STEPS.length} · ${stepLabel(current)}${next ? ` → ${next.label}` : ""}`;
}

export interface WizardStripProps {
  current: WizardStep;
  maxReachable: WizardStep;
  onSelect: (step: WizardStep) => void;
  /** Submitted: steps are read-only. */
  locked?: boolean;
  /** Steps that cannot be opened right now, with the reason (e.g. pending selection). */
  blocked?: Partial<Record<WizardStep, string>>;
  onBlockedSelect?: (step: WizardStep) => void;
  campaign: CampaignResponse | null;
  reservations: readonly ReservationResponse[];
}

/**
 * Compact sticky strip (IA-04, VD-19): stepper + draft summary. Period and budget never
 * truncate; the name truncates with a title.
 */
export function WizardStrip({
  current,
  maxReachable,
  onSelect,
  locked = false,
  blocked,
  onBlockedSelect,
  campaign,
  reservations,
}: WizardStripProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Publishes the strip's bottom edge so section headers can stick right under it.
  useEffect(() => {
    const el = ref.current;
    const root = typeof document !== "undefined" ? document.documentElement : null;
    if (!el || !root) return;
    const apply = () => {
      root.style.setProperty(
        WIZARD_STICKY_VAR,
        `${TOPBAR_PX + Math.round(el.getBoundingClientRect().height)}px`,
      );
    };
    apply();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(apply);
      observer.observe(el);
    }
    return () => {
      observer?.disconnect();
      root.style.removeProperty(WIZARD_STICKY_VAR);
    };
  }, []);

  const active = activeReservations(reservations);
  const cost = sumEstimatedCost(active);
  const summary: { label: string; value: string }[] = campaign
    ? [
        {
          label: "Période",
          value: campaign.startDate
            ? formatDateRange(campaign.startDate, campaign.endDate, "medium")
            : "À définir",
        },
        {
          label: "Horaires",
          value: campaign.startTime
            ? formatTimeRange(campaign.startTime, campaign.endTime)
            : "À définir",
        },
        { label: "Budget", value: formatTND(campaign.budget) },
        {
          label: "Créneaux",
          value: active.length > 0 ? `${active.length} · ${formatEstimate(cost, "DT")}` : "Aucun",
        },
      ]
    : [];

  return (
    <div
      ref={ref}
      className="sticky top-[68px] z-[5] -mx-4 border-b border-line bg-bg px-4 py-2 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10"
    >
      {/* One row only when the stepper and the full summary fit side by side (2xl); below, two
          tidy rows instead of a summary wrapping under a truncated name. */}
      <div className="flex flex-col gap-x-6 gap-y-1 2xl:flex-row 2xl:items-center">
        <nav aria-label="Étapes de création de la campagne" className="min-w-0 shrink-0">
          <ol className="flex items-center gap-1">
            {WIZARD_STEPS.map(({ step, label }) => {
              const isCurrent = step === current;
              const done = step < current;
              const unreachable = step > maxReachable;
              const reason = blocked?.[step];
              const reachable = !locked && !unreachable && !isCurrent;
              const content = (
                <>
                  <span
                    aria-hidden="true"
                    className={cx(
                      "inline-flex size-6 shrink-0 items-center justify-center rounded-full border font-label text-[0.75rem] font-bold",
                      isCurrent
                        ? "border-brand-blue-text bg-blue-soft text-ink-strong"
                        : done
                          ? "border-brand-blue bg-brand-blue text-on-brand"
                          : "border-line-strong text-muted",
                    )}
                  >
                    {done ? (
                      <Check className="size-3.5" />
                    ) : unreachable ? (
                      <Lock className="size-3" />
                    ) : (
                      step
                    )}
                  </span>
                  <span
                    className={cx(
                      "font-label text-[0.8125rem] font-semibold whitespace-nowrap",
                      isCurrent ? "text-ink-strong" : done ? "text-ink-soft" : "text-muted",
                      "sr-only sm:not-sr-only",
                    )}
                  >
                    {label}
                  </span>
                  <span className="sr-only">
                    {isCurrent
                      ? " — étape en cours"
                      : reason
                        ? ` — ${reason}`
                        : done
                          ? " — terminée"
                          : unreachable
                            ? " — verrouillée"
                            : " — accessible"}
                  </span>
                </>
              );
              const base =
                "inline-flex min-h-touch items-center gap-2 rounded-control px-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text";
              return (
                <li
                  key={step}
                  aria-current={isCurrent ? "step" : undefined}
                  className="flex items-center gap-1"
                >
                  {step > 1 ? (
                    <span aria-hidden="true" className="h-px w-3 bg-line-strong sm:w-5" />
                  ) : null}
                  {reachable && reason ? (
                    <button
                      type="button"
                      aria-disabled="true"
                      title={reason}
                      onClick={() => onBlockedSelect?.(step)}
                      className={cx(base, "cursor-not-allowed opacity-70")}
                    >
                      {content}
                    </button>
                  ) : reachable ? (
                    <button
                      type="button"
                      onClick={() => onSelect(step)}
                      className={cx(base, "hover:bg-overlay-hover")}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className={base}>{content}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
        <p aria-hidden="true" className="text-[0.8125rem] font-medium text-ink-soft sm:hidden">
          {compactStepLabel(current)}
        </p>
        {campaign ? (
          // Hidden below sm: on a phone the sticky strip keeps to the steps (the h1, the period
          // card of step 2 and the review of step 3 carry the summary) so content stays visible.
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 pb-1 max-sm:hidden 2xl:border-l 2xl:border-line 2xl:pb-0 2xl:pl-6">
            <p
              className="hidden max-w-[22rem] min-w-0 truncate text-[0.8125rem] font-semibold text-ink-strong md:block"
              title={campaign.name}
            >
              <span className="mr-1.5 font-normal text-muted">
                {campaignReference(campaign.id)}
              </span>
              {campaign.name}
            </p>
            <dl
              aria-label="Résumé du brouillon"
              className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[0.8125rem]"
            >
              {summary.map((item) => (
                <div key={item.label} className="flex items-baseline gap-1.5">
                  <dt className="text-muted">{item.label}</dt>
                  <dd className="font-medium whitespace-nowrap text-ink-soft tabular">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Step title (h2), focus target after a step change. */
export function WizardStepHeading({
  step,
  title,
  lede,
  headingRef,
  aside,
}: {
  step: WizardStep;
  title: string;
  lede?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2
          ref={headingRef}
          data-wizard-step={step}
          tabIndex={-1}
          className="font-display text-[1.375rem] leading-tight font-semibold tracking-tight text-ink-strong focus:outline-none sm:text-[1.5rem]"
        >
          {title}
        </h2>
        {lede ? (
          <p className="mt-1.5 max-w-2xl text-[0.9375rem] leading-relaxed text-muted">{lede}</p>
        ) : null}
      </div>
      {aside}
    </div>
  );
}
