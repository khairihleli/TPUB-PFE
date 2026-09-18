"use client";

import { Check, FilePlus2, Megaphone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { isDraftCampaign, type ScheduleDraft } from "@/components/network/booking-plan";
import { QuickDraftForm, useHasStoredQuickDraft } from "@/components/network/quick-draft-form";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { CampaignResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { formatDateRange, formatTimeRange, formatTND } from "@/lib/format";
import { routes } from "@/lib/routes";
import type { ResourceState } from "@/lib/use-resource";

export interface CampaignPickerProps {
  /** `useResource` over GET /campaigns/mine (all statuses; drafts are filtered here). */
  campaigns: ResourceState<CampaignResponse[]>;
  value: number | null;
  /** The campaign object is passed too (a just-created draft is not in the list yet). */
  onChange: (campaignId: number | null, campaign: CampaignResponse | null) => void;
  /** Créneau proposed to a quick draft (its period is editable there). */
  schedule: ScheduleDraft;
  today: string;
  idPrefix: string;
  /** Inline error (e.g. « Choisissez une campagne »). */
  error?: string | null;
  disabled?: boolean;
}

/** Campaign choice for a booking: one of my BROUILLON campaigns or a quick draft. */
export function CampaignPicker({
  campaigns,
  value,
  onChange,
  schedule,
  today,
  idPrefix,
  error,
  disabled = false,
}: CampaignPickerProps) {
  const hasStoredDraft = useHasStoredQuickDraft();
  // A quick draft typed earlier on this device reopens the form (restored with a notice).
  const [creating, setCreating] = useState(hasStoredDraft);
  const { data, loading, reload, setData } = campaigns;
  const drafts = (data ?? []).filter(isDraftCampaign);
  const errorId = `${idPrefix}-campagne-erreur`;
  const formId = `${idPrefix}-brouillon-form`;

  if (campaigns.error && !data) {
    return (
      <ErrorState
        compact
        error={campaigns.error}
        onRetry={reload}
        title="Vos campagnes n'ont pas pu être chargées"
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {loading && !data ? (
        <div role="status" aria-label="Chargement de vos brouillons…" className="grid gap-2">
          <Skeleton className="h-16 rounded-card" />
          <Skeleton className="h-16 rounded-card" />
        </div>
      ) : drafts.length === 0 ? (
        <div className="flex items-start gap-3 rounded-card border border-line bg-overlay-inset p-3.5">
          <Megaphone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-orange-text" />
          <p className="text-[0.8125rem] leading-relaxed text-muted">
            Aucune campagne en brouillon. Créez un brouillon rapide ci-dessous, ou{" "}
            <Link
              href={routes.espace.wizard(null)}
              className="font-semibold text-brand-blue-text underline-offset-2 hover:underline"
            >
              ouvrez l&apos;assistant
            </Link>
            .
          </p>
        </div>
      ) : (
        <fieldset
          disabled={disabled}
          aria-describedby={error ? errorId : undefined}
          className="min-w-0"
        >
          <legend className="sr-only">Campagne brouillon</legend>
          <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto overscroll-contain pr-0.5">
            {drafts.map((c) => {
              const checked = c.id === value;
              return (
                <li key={c.id}>
                  <label
                    className={cx(
                      "flex cursor-pointer items-center gap-3 rounded-card border px-3.5 py-3 transition-[border-color,background-color] duration-200 ease-smooth has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-blue-text",
                      checked
                        ? "border-brand-blue-text/60 bg-blue-soft"
                        : "border-line bg-overlay-inset hover:border-line-strong",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${idPrefix}-campagne`}
                      className="sr-only"
                      checked={checked}
                      onChange={() => onChange(c.id, c)}
                    />
                    <span
                      aria-hidden="true"
                      className={cx(
                        "inline-flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                        checked
                          ? "border-brand-blue bg-brand-blue text-on-brand"
                          : "border-line-strong text-transparent",
                      )}
                    >
                      <Check className="size-3" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        title={c.name}
                        className="block truncate font-label text-[0.8125rem] font-semibold text-ink-strong"
                      >
                        {c.name}
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-x-2 text-[0.75rem] text-muted tabular">
                        <span className="whitespace-nowrap">
                          {c.startDate
                            ? formatDateRange(c.startDate, c.endDate)
                            : "Période non définie"}
                        </span>
                        {c.startTime ? (
                          <span className="whitespace-nowrap">
                            {formatTimeRange(c.startTime, c.endTime)}
                          </span>
                        ) : null}
                        <span className="whitespace-nowrap">{formatTND(c.budget)}</span>
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      {error ? (
        <p id={errorId} role="alert" className="text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : null}

      {creating ? (
        <QuickDraftForm
          id={formId}
          schedule={schedule}
          today={today}
          idPrefix={`${idPrefix}-brouillon`}
          onCancel={() => setCreating(false)}
          onCreated={(created) => {
            setData((prev) => [created, ...(prev ?? []).filter((c) => c.id !== created.id)]);
            onChange(created.id, created);
            setCreating(false);
          }}
        />
      ) : (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          iconLeft={<FilePlus2 aria-hidden="true" />}
          aria-expanded={false}
          onClick={() => setCreating(true)}
          disabled={disabled}
        >
          Créer un brouillon rapide
        </Button>
      )}
    </div>
  );
}
