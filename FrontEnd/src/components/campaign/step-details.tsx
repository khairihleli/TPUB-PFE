"use client";

import { ArrowRight, Save } from "lucide-react";
import { type Ref, useEffect, useMemo, useRef, useState } from "react";

import {
  campaignErrorItems,
  CampaignFormFields,
  focusFirstError,
} from "@/components/campaign/campaign-form-fields";
import {
  type CampaignField,
  type CampaignFormErrors,
  type CampaignFormValues,
  CAMPAIGN_FIELDS,
  campaignToFormValues,
  EMPTY_CAMPAIGN_FORM,
  mapServerFieldErrors,
  validateCampaignForm,
} from "@/components/campaign/campaign-schema";
import { WizardStepHeading } from "@/components/campaign/wizard-chrome";
import { Alert } from "@/components/ui/alert";
import { AutosaveStatus } from "@/components/ui/autosave-status";
import { Button } from "@/components/ui/button";
import { DraftRestoreNotice } from "@/components/ui/draft-restore-notice";
import { ErrorSummary, type ErrorSummaryItem } from "@/components/ui/error-summary";
import { campaignsApi } from "@/lib/api/endpoints";
import { ApiError, presentError } from "@/lib/api/errors";
import type { CampaignResponse } from "@/lib/api/types";
import { useAutosave } from "@/lib/forms/autosave";
import { useFormDraft } from "@/lib/forms/form-draft";
import { useUnsavedChangesGuard } from "@/lib/forms/unsaved-guard";
import { todayISO } from "@/lib/format";

export interface SaveCampaignOptions {
  values: CampaignFormValues;
  campaign: CampaignResponse | null;
  today: string;
}

export type SaveCampaignResult =
  | { ok: true; campaign: CampaignResponse; changed: boolean }
  | { ok: false; errors: CampaignFormErrors; message: string | null };

function sameValues(a: CampaignFormValues, b: CampaignFormValues): boolean {
  return (Object.keys(a) as CampaignField[]).every((k) => a[k].trim() === b[k].trim());
}

function isFormValues(value: unknown): value is CampaignFormValues {
  return (
    typeof value === "object" &&
    value !== null &&
    CAMPAIGN_FIELDS.every((f) => typeof (value as Record<string, unknown>)[f] === "string")
  );
}

/**
 * Validates then POST (new) or PUT (existing, full replace). The backend releases TEMPORAIRE
 * reservations that no longer fit the new period/créneau (compare `reservationsCount`).
 */
export async function saveCampaign({
  values,
  campaign,
  today,
}: SaveCampaignOptions): Promise<SaveCampaignResult> {
  const validation = validateCampaignForm(values, {
    today,
    savedStartDate: campaign?.startDate ?? null,
  });
  if (!validation.ok) return { ok: false, errors: validation.errors, message: null };

  if (campaign && sameValues(values, campaignToFormValues(campaign))) {
    return { ok: true, campaign, changed: false };
  }

  const request = validation.request;

  try {
    const saved = campaign
      ? await campaignsApi.update(campaign.id, request)
      : await campaignsApi.create(request);
    return { ok: true, campaign: saved, changed: true };
  } catch (e) {
    return {
      ok: false,
      errors: e instanceof ApiError ? mapServerFieldErrors(e.fieldErrors) : {},
      message: presentError(e).message,
    };
  }
}

export interface StepDetailsProps {
  campaign: CampaignResponse | null;
  reservationCount: number;
  onSaved: (
    campaign: CampaignResponse,
    opts: { advance: boolean; changed: boolean; autosave?: boolean },
  ) => void;
  headingRef?: Ref<HTMLHeadingElement>;
}

const ID_PREFIX = "campagne";

export const SCHEDULE_CHANGE_NOTE =
  "Des Porteurs sont déjà réservés : ceux qui ne correspondent plus à la nouvelle période ou au nouveau créneau seront libérés à l'enregistrement.";

export function StepDetails({ campaign, reservationCount, onSaved, headingRef }: StepDetailsProps) {
  const [today] = useState(() => todayISO());
  const [initial] = useState<CampaignFormValues>(() =>
    campaign ? campaignToFormValues(campaign) : EMPTY_CAMPAIGN_FORM,
  );
  const [values, setValues] = useState<CampaignFormValues>(initial);
  const [savedValues, setSavedValues] = useState<CampaignFormValues>(initial);
  const [validValues, setValidValues] = useState<CampaignFormValues>(initial);
  const [errors, setErrors] = useState<CampaignFormErrors>({});
  const [summary, setSummary] = useState<ErrorSummaryItem[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState<"draft" | "next" | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const dirty = !sameValues(values, savedValues);

  const campaignRef = useRef(campaign);
  const valuesRef = useRef(values);
  useEffect(() => {
    campaignRef.current = campaign;
    valuesRef.current = values;
  });

  const validation = useMemo(
    () => validateCampaignForm(values, { today, savedStartDate: campaign?.startDate ?? null }),
    [values, today, campaign?.startDate],
  );
  useEffect(() => {
    if (validation.ok) setValidValues(values);
  }, [validation.ok, values]);

  // Local draft: before the POST (« campaign:new ») and for unsaved edits of an existing draft.
  const draft = useFormDraft<CampaignFormValues>({
    key: campaign ? `campaign:${campaign.id}:details` : "campaign:new",
    value: values,
    dirty,
    onRestore: (restored) => {
      if (!isFormValues(restored)) return;
      setValues(restored);
    },
  });
  const clearDraft = draft.clear;

  useUnsavedChangesGuard({ dirty: dirty || saving !== null });

  // Server autosave once the draft exists (only values that validate are sent).
  const autosave = useAutosave<CampaignFormValues>({
    value: validValues,
    enabled: campaign !== null && campaign.status === "BROUILLON",
    isEqual: sameValues,
    save: async (snapshot) => {
      const result = await saveCampaign({
        values: snapshot,
        campaign: campaignRef.current,
        today,
      });
      if (!result.ok) throw new Error(result.message ?? "Enregistrement impossible");
      setSavedValues(snapshot);
      if (sameValues(valuesRef.current, snapshot)) clearDraft();
      if (result.changed)
        onSaved(result.campaign, { advance: false, changed: true, autosave: true });
    },
  });

  const onChange = (field: CampaignField, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const submit = async (advance: boolean) => {
    if (saving) return;
    setServerError(null);
    setSaving(advance ? "next" : "draft");
    const snapshot = values;
    const result = await saveCampaign({ values: snapshot, campaign, today });
    setSaving(null);
    if (!result.ok) {
      setErrors(result.errors);
      setServerError(result.message);
      const items = campaignErrorItems(result.errors, ID_PREFIX);
      setAttempt((n) => n + 1);
      if (items.length >= 2) {
        setSummary(items);
      } else {
        setSummary([]);
        window.setTimeout(() => focusFirstError(result.errors, ID_PREFIX), 0);
      }
      return;
    }
    setErrors({});
    setSummary([]);
    setSavedValues(snapshot);
    clearDraft();
    onSaved(result.campaign, { advance, changed: result.changed });
  };

  // The summary opened on submit follows the fixes: a corrected field leaves the list, and the
  // summary disappears once nothing is left (it never lists an error the form no longer shows).
  const liveSummary =
    summary.length >= 2
      ? summary.filter((item) =>
          campaignErrorItems(errors, ID_PREFIX).some((e) => e.fieldId === item.fieldId),
        )
      : [];

  const discardDraft = () => {
    draft.discard();
    setValues(savedValues);
    setErrors({});
    setSummary([]);
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit(true);
      }}
    >
      <WizardStepHeading step={1} title="Détails de la campagne" headingRef={headingRef} />

      {draft.restoredAt ? (
        <DraftRestoreNotice
          restoredAt={draft.restoredAt}
          onDiscard={discardDraft}
          className="mb-5"
        />
      ) : null}

      {liveSummary.length > 0 ? (
        <ErrorSummary errors={liveSummary} focusKey={attempt} className="mb-5" />
      ) : null}

      <div className="rounded-panel border border-line bg-surface p-5 sm:p-7">
        <CampaignFormFields
          values={values}
          errors={errors}
          onChange={onChange}
          today={today}
          scheduleNote={reservationCount > 0 ? SCHEDULE_CHANGE_NOTE : undefined}
          disabled={saving !== null}
          idPrefix={ID_PREFIX}
        />
      </div>

      {serverError ? (
        <Alert tone="danger" className="mt-5" title="Enregistrement impossible">
          {serverError}
        </Alert>
      ) : null}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        {campaign ? (
          <AutosaveStatus
            state={autosave.state}
            savedAt={autosave.savedAt}
            onRetry={autosave.retry}
            className="sm:mr-auto"
          />
        ) : null}
        <Button
          type="button"
          variant="secondary"
          loading={saving === "draft"}
          loadingLabel="Enregistrement en cours"
          iconLeft={<Save aria-hidden="true" />}
          onClick={() => void submit(false)}
        >
          Enregistrer le brouillon
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={saving === "next"}
          loadingLabel="Enregistrement en cours"
          iconRight={<ArrowRight aria-hidden="true" />}
        >
          Continuer vers le contenu
        </Button>
      </div>
    </form>
  );
}
