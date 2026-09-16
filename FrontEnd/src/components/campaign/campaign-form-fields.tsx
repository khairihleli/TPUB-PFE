"use client";

import { Info, Lock } from "lucide-react";
import { type ReactNode, useId } from "react";

import {
  type CampaignField,
  type CampaignFormErrors,
  type CampaignFormValues,
  OBJECTIVE_MAX,
} from "@/components/campaign/campaign-schema";
import { DateRangeField } from "@/components/ui/date-field";
import type { ErrorSummaryItem } from "@/components/ui/error-summary";
import { focusField } from "@/components/ui/error-summary";
import { Field, Input, Textarea } from "@/components/ui/field";
import { TimeRangeField } from "@/components/ui/time-range-field";
import { cx } from "@/lib/cx";
import { DAY_PARTS } from "@/lib/network/availability";
import { detectReviewTriggers, reviewTriggerHint } from "@/lib/review-triggers";

/** Reason shown on read-only dates when créneaux exist (FLOW-01). */
export const LOCKED_PERIOD_REASON =
  "La période est verrouillée : des Porteurs sont bloqués sur ces dates.";

/** Day-part chips of the time range (same presets as the Studio booking plan). */
const DAY_PART_OPTIONS = DAY_PARTS.flatMap((p) =>
  p.start && p.end ? [{ label: p.label, start: p.start, end: p.end }] : [],
);

export interface CampaignFormFieldsProps {
  values: CampaignFormValues;
  errors: CampaignFormErrors;
  onChange: (field: CampaignField, value: string) => void;
  /** Today in Africa/Tunis (min of the start date). */
  today: string;
  /** Period and time range read-only because Porteurs are already booked. */
  lockSchedule?: boolean;
  /** Reason displayed on the locked period (default LOCKED_PERIOD_REASON). */
  lockedReason?: string;
  /** Action next to the locked period, e.g. « Changer de période… ». */
  scheduleAction?: ReactNode;
  /** Note under the budget (e.g. estimates of booked créneaux keep the old budget). */
  budgetNote?: ReactNode;
  disabled?: boolean;
  /** Prefix for control ids (focus management). */
  idPrefix: string;
}

/**
 * DOM id of a field's control. Dates and times live in shared range fields that suffix their
 * own ids (`-start` / `-end`).
 */
export function campaignFieldId(idPrefix: string, field: CampaignField): string {
  switch (field) {
    case "startDate":
      return `${idPrefix}-periode-start`;
    case "endDate":
      return `${idPrefix}-periode-end`;
    case "startTime":
      return `${idPrefix}-horaires-start`;
    case "endTime":
      return `${idPrefix}-horaires-end`;
    default:
      return `${idPrefix}-${field}`;
  }
}

const FIELD_ORDER: readonly CampaignField[] = [
  "name",
  "objective",
  "budget",
  "startDate",
  "endDate",
  "startTime",
  "endTime",
];

/** Errors in form order, as ErrorSummary items. */
export function campaignErrorItems(
  errors: CampaignFormErrors,
  idPrefix: string,
): ErrorSummaryItem[] {
  return FIELD_ORDER.flatMap((f) => {
    const message = errors[f];
    return message ? [{ fieldId: campaignFieldId(idPrefix, f), message }] : [];
  });
}

function Group({
  title,
  description,
  children,
  aside,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
}) {
  const titleId = useId();
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className="grid grid-cols-[minmax(0,1fr)] gap-4 border-t border-line pt-6 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] lg:gap-10"
    >
      <div className="min-w-0">
        <p id={titleId} className="font-display text-[1rem] font-semibold text-ink-strong">
          {title}
        </p>
        {description ? (
          <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">{description}</p>
        ) : null}
        {aside}
      </div>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </div>
  );
}

/** Wizard step 1 and edit page: name, objective, budget, period, daily time range. */
export function CampaignFormFields({
  values,
  errors,
  onChange,
  today,
  lockSchedule = false,
  lockedReason = LOCKED_PERIOD_REASON,
  scheduleAction,
  budgetNote,
  disabled = false,
  idPrefix,
}: CampaignFormFieldsProps) {
  const id = (f: CampaignField) => campaignFieldId(idPrefix, f);
  const scheduleDisabled = disabled || lockSchedule;
  const triggers = detectReviewTriggers(values.objective);
  const firstTrigger = triggers[0]?.term;
  const triggerId = `${idPrefix}-objective-termes`;

  return (
    <div className="flex flex-col gap-7">
      <Group
        title="Identité"
        description="Le nom vous sert à retrouver la campagne. L'objectif est le texte lu par l'analyse IA."
      >
        <Field
          label="Nom de la campagne"
          id={id("name")}
          error={errors.name}
          required
          disabled={disabled}
        >
          <Input
            value={values.name}
            onChange={(e) => onChange("name", e.target.value)}
            maxLength={200}
            autoComplete="off"
            placeholder="Ex. Lancement de la nouvelle gamme"
          />
        </Field>
        <div className="flex flex-col gap-2">
          <Field
            label="Objectif"
            id={id("objective")}
            error={errors.objective}
            required
            disabled={disabled}
            hint="Que voulez-vous obtenir ? Lancement, notoriété locale, promotion, événement… C'est ce texte que l'analyse IA examine en premier."
            labelAside={
              <span
                className={cx(
                  "tabular",
                  values.objective.length > OBJECTIVE_MAX ? "text-danger" : "text-muted",
                )}
              >
                {values.objective.length}/{OBJECTIVE_MAX}
              </span>
            }
          >
            <Textarea
              value={values.objective}
              onChange={(e) => onChange("objective", e.target.value)}
              rows={4}
              aria-describedby={firstTrigger ? triggerId : undefined}
              placeholder="Ex. Faire connaître l'ouverture de notre boutique aux habitants du quartier."
            />
          </Field>
          <p id={triggerId} aria-live="polite" className="text-[0.8125rem] leading-snug text-muted">
            {firstTrigger ? (
              <span className="flex items-start gap-1.5">
                <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-blue-text" />
                <span>{reviewTriggerHint(firstTrigger)}</span>
              </span>
            ) : null}
          </p>
        </div>
      </Group>

      <Group
        title="Budget"
        description="Budget déclaré en dinars (TND). Il sert de base aux estimations des créneaux."
      >
        <Field
          label="Budget déclaré"
          id={id("budget")}
          error={errors.budget}
          required
          disabled={disabled}
        >
          <div className="relative">
            <Input
              value={values.budget}
              onChange={(e) => onChange("budget", e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              placeholder="Ex. 2500"
              className="pr-16 tabular"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 font-label text-[0.75rem] font-semibold text-muted"
            >
              TND
            </span>
          </div>
        </Field>
        {budgetNote ? (
          <p className="flex items-start gap-1.5 text-[0.8125rem] leading-snug text-muted">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-blue-text" />
            <span>{budgetNote}</span>
          </p>
        ) : null}
      </Group>

      <Group
        title="Période et heures"
        description="Dates de début et de fin, puis la plage horaire quotidienne."
        aside={
          lockSchedule ? (
            <div className="mt-3 flex flex-col items-start gap-2">
              <p className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-label text-[0.75rem] font-semibold text-ink-soft">
                <Lock aria-hidden="true" className="size-3.5 text-brand-orange-text" />
                Période verrouillée
              </p>
              {scheduleAction}
            </div>
          ) : null
        }
      >
        <DateRangeField
          id={`${idPrefix}-periode`}
          value={{ start: values.startDate, end: values.endDate }}
          onChange={(next) => {
            if (next.start !== values.startDate) onChange("startDate", next.start);
            if (next.end !== values.endDate) onChange("endDate", next.end);
          }}
          min={lockSchedule ? undefined : today}
          presets={lockSchedule ? false : ["1w", "2w", "1m"]}
          startLabel="Date de début"
          endLabel="Date de fin"
          errors={{ start: errors.startDate, end: errors.endDate }}
          lockedReason={lockSchedule ? lockedReason : null}
          disabled={disabled}
          required
        />
        <TimeRangeField
          id={`${idPrefix}-horaires`}
          value={{ start: values.startTime, end: values.endTime }}
          onChange={(next) => {
            if (next.start !== values.startTime) onChange("startTime", next.start);
            if (next.end !== values.endTime) onChange("endTime", next.end);
          }}
          dayParts={scheduleDisabled ? undefined : DAY_PART_OPTIONS}
          errors={{ start: errors.startTime, end: errors.endTime }}
          disabled={scheduleDisabled}
          required
        />
      </Group>
    </div>
  );
}

/** Moves focus to the first field in error (form order). */
export function focusFirstError(errors: CampaignFormErrors, idPrefix: string): void {
  const first = FIELD_ORDER.find((f) => errors[f]);
  if (!first) return;
  focusField(campaignFieldId(idPrefix, first));
}
