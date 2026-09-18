"use client";

import { FilePlus2, Info } from "lucide-react";
import { type FormEvent, useState } from "react";

import { mapServerFieldErrors, OBJECTIVE_MAX } from "@/components/campaign/campaign-schema";
import {
  EMPTY_QUICK_DRAFT,
  validateQuickDraft,
  type QuickDraftErrors,
  type QuickDraftValues,
  type ScheduleDraft,
} from "@/components/network/booking-plan";
import { ScheduleFields } from "@/components/network/schedule-fields";
import { useOptionalSessionContext } from "@/components/shell/session-context";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DraftRestoreNotice } from "@/components/ui/draft-restore-notice";
import { Field, Input, Textarea } from "@/components/ui/field";
import { campaignsApi } from "@/lib/api/endpoints";
import { ApiError, presentError } from "@/lib/api/errors";
import type { CampaignResponse } from "@/lib/api/types";
import { draftStorageKey, readDraft, useFormDraft } from "@/lib/forms/form-draft";
import { useUnsavedChangesGuard } from "@/lib/forms/unsaved-guard";
import { reviewTriggerHint, reviewTriggerTerms } from "@/lib/review-triggers";

/** Local draft key (UX-PLAN §7.2). */
export const QUICK_DRAFT_KEY = "network:quick-draft";

interface StoredQuickDraft {
  values: QuickDraftValues;
  schedule: ScheduleDraft;
}

/** True when this user has a quick draft saved on this device (< 24 h). */
export function useHasStoredQuickDraft(): () => boolean {
  const session = useOptionalSessionContext();
  const userId = session?.user.userId ?? null;
  return () => readDraft<StoredQuickDraft>(draftStorageKey(QUICK_DRAFT_KEY, userId)) !== null;
}

export interface QuickDraftFormProps {
  /** Créneau proposed for the campaign period (editable here). */
  schedule: ScheduleDraft;
  today: string;
  idPrefix: string;
  onCreated: (campaign: CampaignResponse) => void;
  onCancel: () => void;
  id?: string;
}

function isDirty(values: QuickDraftValues): boolean {
  return Boolean(values.name.trim() || values.objective.trim() || values.budget.trim());
}

/**
 * « Créer un brouillon rapide » : name, objective (live review-term hint), budget and the
 * campaign period (French date fields, prefilled with the Studio créneau). Kept on this device
 * while typing (`network:quick-draft`) and guarded against leaving with unsaved input.
 */
export function QuickDraftForm({
  schedule,
  today,
  idPrefix,
  onCreated,
  onCancel,
  id,
}: QuickDraftFormProps) {
  const [values, setValues] = useState<QuickDraftValues>(EMPTY_QUICK_DRAFT);
  const [period, setPeriod] = useState<ScheduleDraft>(schedule);
  const [errors, setErrors] = useState<QuickDraftErrors>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const dirty = isDirty(values);

  const draft = useFormDraft<StoredQuickDraft>({
    key: QUICK_DRAFT_KEY,
    value: { values, schedule: period },
    dirty,
    onRestore: (stored) => {
      if (stored.values) setValues({ ...EMPTY_QUICK_DRAFT, ...stored.values });
      if (stored.schedule) setPeriod(stored.schedule);
    },
  });
  useUnsavedChangesGuard({ dirty: dirty && !saving });

  const triggerTerm = reviewTriggerTerms(values.objective)[0] ?? null;
  const hintId = `${idPrefix}-objective-termes`;

  const set = (field: keyof QuickDraftValues, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const reset = () => {
    setValues(EMPTY_QUICK_DRAFT);
    setPeriod(schedule);
    setErrors({});
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const result = validateQuickDraft(values, period, today);
    setErrors(result.errors);
    setServerError(null);
    if (!result.ok) {
      const first = (["name", "objective", "budget"] as const).find((f) => result.errors[f]);
      if (first) document.getElementById(`${idPrefix}-${first}`)?.focus();
      else if (result.errors.schedule) {
        document.getElementById(`${idPrefix}-periode-start`)?.focus();
      }
      return;
    }
    setSaving(true);
    try {
      const created = await campaignsApi.create(result.request);
      draft.clear();
      setValues(EMPTY_QUICK_DRAFT);
      onCreated(created);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) {
        const mapped = mapServerFieldErrors(err.fieldErrors);
        setErrors({ name: mapped.name, objective: mapped.objective, budget: mapped.budget });
      }
      setServerError(err);
    } finally {
      setSaving(false);
    }
  };

  const presented = serverError ? presentError(serverError) : null;

  return (
    <form
      id={id}
      onSubmit={(e) => void submit(e)}
      noValidate
      aria-label="Créer un brouillon rapide"
      className="flex min-w-0 animate-fade-in flex-col gap-4 rounded-card border border-blue-line bg-surface-2 p-4"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-control border border-blue-line bg-blue-soft text-brand-blue-text"
        >
          <FilePlus2 className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-label text-[0.875rem] font-semibold text-ink-strong">
            Brouillon rapide
          </p>
          <p className="text-[0.75rem] leading-relaxed text-muted">
            Nom, objectif, budget et période : le brouillon est ensuite choisi pour ce Porteur. Vous
            compléterez le reste dans l&apos;assistant.
          </p>
        </div>
      </div>

      {draft.restoredAt ? (
        <DraftRestoreNotice
          restoredAt={draft.restoredAt}
          onDiscard={() => {
            draft.discard();
            reset();
          }}
        />
      ) : null}

      <Field label="Nom de la campagne" id={`${idPrefix}-name`} error={errors.name} required>
        <Input
          value={values.name}
          maxLength={200}
          autoComplete="off"
          placeholder="Ex. Lancement de la nouvelle gamme"
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>
      <div className="flex flex-col gap-2">
        <Field
          label="Objectif"
          id={`${idPrefix}-objective`}
          error={errors.objective}
          required
          hint="C'est le texte que l'analyse IA examine en premier."
        >
          <Textarea
            rows={3}
            value={values.objective}
            maxLength={OBJECTIVE_MAX}
            aria-describedby={triggerTerm ? hintId : undefined}
            placeholder="Ex. Faire connaître l'ouverture de notre boutique aux habitants du quartier."
            onChange={(e) => set("objective", e.target.value)}
          />
        </Field>
        {triggerTerm ? (
          <p
            id={hintId}
            role="note"
            className="flex items-start gap-2 rounded-control border border-blue-line bg-blue-soft px-3 py-2 text-[0.8125rem] leading-snug text-ink-soft"
          >
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-blue-text" />
            {reviewTriggerHint(triggerTerm)}
          </p>
        ) : null}
      </div>
      <Field label="Budget déclaré" id={`${idPrefix}-budget`} error={errors.budget} required>
        <div className="relative">
          <Input
            value={values.budget}
            inputMode="decimal"
            autoComplete="off"
            placeholder="2500"
            className="pr-16 tabular"
            onChange={(e) => set("budget", e.target.value)}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 font-label text-[0.75rem] font-semibold text-muted"
          >
            TND
          </span>
        </div>
      </Field>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 font-label text-[0.8125rem] font-medium text-ink-soft">
          Période de la campagne
        </legend>
        <ScheduleFields
          draft={period}
          onChange={(next) => {
            setPeriod(next);
            if (errors.schedule) setErrors((e) => ({ ...e, schedule: undefined }));
          }}
          errors={{}}
          today={today}
          idPrefix={idPrefix}
        />
      </fieldset>

      {errors.schedule ? (
        <p className="text-[0.8125rem] text-danger" role="alert">
          {errors.schedule}
        </p>
      ) : null}
      {presented ? (
        <Alert tone="danger" title={presented.title}>
          {presented.message}
        </Alert>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            draft.clear();
            onCancel();
          }}
          disabled={saving}
        >
          Annuler
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={saving}
          loadingLabel="Création du brouillon…"
        >
          Créer le brouillon
        </Button>
      </div>
    </form>
  );
}
