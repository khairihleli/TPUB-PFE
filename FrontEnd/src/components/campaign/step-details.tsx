"use client";

import { ArrowRight, CalendarClock, Save } from "lucide-react";
import { type Ref, useEffect, useMemo, useRef, useState } from "react";

import {
  changeCampaignPeriod,
  precheckPeriodChange,
  type PeriodChangeResult,
} from "@/components/campaign/campaign-actions";
import {
  activeReservations,
  joinReservations,
  loadNetworkLookups,
} from "@/components/campaign/campaign-data";
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
  parseBudget,
  validateCampaignForm,
} from "@/components/campaign/campaign-schema";
import { WizardStepHeading } from "@/components/campaign/wizard-chrome";
import { Alert } from "@/components/ui/alert";
import { AutosaveStatus } from "@/components/ui/autosave-status";
import { Button } from "@/components/ui/button";
import { DateRangeField } from "@/components/ui/date-field";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { DraftRestoreNotice } from "@/components/ui/draft-restore-notice";
import { ErrorSummary, type ErrorSummaryItem } from "@/components/ui/error-summary";
import { TimeRangeField } from "@/components/ui/time-range-field";
import { campaignsApi, reservationsApi } from "@/lib/api/endpoints";
import { ApiError, presentError } from "@/lib/api/errors";
import type { CampaignRequest, CampaignResponse, ReservationResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { useAutosave } from "@/lib/forms/autosave";
import { useFormDraft } from "@/lib/forms/form-draft";
import { useUnsavedChangesGuard } from "@/lib/forms/unsaved-guard";
import { formatDate, formatDateRangeLong, fromApiTime, todayISO } from "@/lib/format";
import { isISODate } from "@/lib/network/availability";
import { useSupportsAvailability } from "@/lib/network/use-supports-availability";
import { useResource } from "@/lib/use-resource";

export interface SaveCampaignOptions {
  values: CampaignFormValues;
  campaign: CampaignResponse | null;
  today: string;
  lockSchedule: boolean;
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
 * Validates then POST (new) or PUT (existing, full replace). With `lockSchedule` the period and
 * times of the saved campaign are sent unchanged (booked Porteurs keep their dates).
 */
export async function saveCampaign({
  values,
  campaign,
  today,
  lockSchedule,
}: SaveCampaignOptions): Promise<SaveCampaignResult> {
  const validation = validateCampaignForm(values, { today, lockSchedule });
  if (!validation.ok) return { ok: false, errors: validation.errors, message: null };

  if (campaign && sameValues(values, campaignToFormValues(campaign))) {
    return { ok: true, campaign, changed: false };
  }

  const request: CampaignRequest =
    lockSchedule && campaign
      ? {
          ...validation.request,
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          startTime: campaign.startTime,
          endTime: campaign.endTime,
        }
      : validation.request;

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
  /** Opens « Changer de période… » (drafts with créneaux). */
  onChangePeriod?: () => void;
}

const ID_PREFIX = "campagne";

export const BUDGET_CHANGE_NOTE =
  "Les estimations des créneaux déjà bloqués restent calculées sur l'ancien budget.";

export function StepDetails({
  campaign,
  reservationCount,
  onSaved,
  headingRef,
  onChangePeriod,
}: StepDetailsProps) {
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
  const lockSchedule = reservationCount > 0;
  const dirty = !sameValues(values, savedValues);

  const campaignRef = useRef(campaign);
  const valuesRef = useRef(values);
  useEffect(() => {
    campaignRef.current = campaign;
    valuesRef.current = values;
  });

  const validation = useMemo(
    () => validateCampaignForm(values, { today, lockSchedule }),
    [values, today, lockSchedule],
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
      const c = campaignRef.current;
      setValues(
        lockSchedule && c
          ? {
              ...restored,
              startDate: c.startDate ?? "",
              endDate: c.endDate ?? "",
              startTime: fromApiTime(c.startTime),
              endTime: fromApiTime(c.endTime),
            }
          : restored,
      );
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
        lockSchedule,
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
    const result = await saveCampaign({ values: snapshot, campaign, today, lockSchedule });
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

  const budgetChanged =
    lockSchedule &&
    campaign !== null &&
    !Number.isNaN(parseBudget(values.budget)) &&
    parseBudget(values.budget) !== campaign.budget;

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
          lockSchedule={lockSchedule}
          scheduleAction={
            lockSchedule && onChangePeriod ? (
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<CalendarClock aria-hidden="true" />}
                onClick={onChangePeriod}
              >
                Changer de période…
              </Button>
            ) : undefined
          }
          budgetNote={budgetChanged ? BUDGET_CHANGE_NOTE : undefined}
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
          Continuer vers les Porteurs
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// « Changer de période… » (FLOW-01)
// ---------------------------------------------------------------------------
export const PERIOD_CHANGE_CONSEQUENCE =
  "Nous créons une copie du brouillon sur la nouvelle période, supprimons l'actuel (ses créneaux sont libérés), puis re-bloquons les Porteurs disponibles. Les Porteurs indisponibles ne seront pas conservés.";

/** Result summary shown on step 2 of the new draft. */
export interface PeriodChangeNotice {
  campaignId: number;
  rebooked: string[];
  unavailable: string[];
  failed: { name: string; message: string }[];
}

export interface ChangePeriodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: CampaignResponse;
  reservations: readonly ReservationResponse[];
  /** Called after the copy exists and the original is deleted. */
  onChanged: (campaign: CampaignResponse, notice: PeriodChangeNotice, sourceId: number) => void;
}

export function ChangePeriodDialog(props: ChangePeriodDialogProps) {
  const { open, onOpenChange } = props;
  const [running, setRunning] = useState(false);
  const [dirty, setDirty] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (running) return;
        onOpenChange(next);
      }}
    >
      {open ? (
        <ChangePeriodBody
          {...props}
          running={running}
          setRunning={setRunning}
          dirty={dirty}
          setDirty={setDirty}
        />
      ) : null}
    </Dialog>
  );
}

function failureMessage(result: Exclude<PeriodChangeResult, { ok: true }>): string {
  const detail = presentError(result.error).message;
  if (result.stage === "duplicate") {
    return `La copie n'a pas pu être créée : rien n'a changé. ${detail}`;
  }
  return result.rollbackFailed
    ? `Le brouillon actuel n'a pas pu être supprimé et la copie « ${result.copy.name} » (${formatDate(result.copy.startDate, "medium")}) n'a pas pu être retirée : supprimez-la depuis Campagnes. ${detail}`
    : `Le brouillon actuel n'a pas pu être supprimé : la copie a été retirée, rien n'a changé. ${detail}`;
}

function ChangePeriodBody({
  campaign,
  reservations,
  onOpenChange,
  onChanged,
  running,
  setRunning,
  dirty,
  setDirty,
}: ChangePeriodDialogProps & {
  running: boolean;
  setRunning: (v: boolean) => void;
  dirty: boolean;
  setDirty: (v: boolean) => void;
}) {
  const [today] = useState(() => todayISO());
  const [period, setPeriod] = useState({
    start: campaign.startDate ?? "",
    end: campaign.endDate ?? "",
  });
  const [times, setTimes] = useState({
    start: fromApiTime(campaign.startTime) || "08:00",
    end: fromApiTime(campaign.endTime) || "22:00",
  });
  const [failure, setFailure] = useState<string | null>(null);

  const active = useMemo(() => activeReservations(reservations), [reservations]);
  const ids = useMemo(() => [...new Set(active.map((r) => r.supportId))], [active]);
  const lookups = useResource("wizard-network-lookups", loadNetworkLookups);
  const joined = useMemo(
    () => joinReservations(active, lookups.data ?? { supports: null, zones: null }),
    [active, lookups.data],
  );
  const nameOf = (supportId: number) =>
    joined.find((r) => r.supportId === supportId)?.supportName ?? `Porteur n° ${supportId}`;

  const validDates = isISODate(period.start) && isISODate(period.end) && period.end >= period.start;
  const validTimes = times.start !== "" && times.end !== "" && times.end > times.start;
  const unchanged =
    period.start === campaign.startDate &&
    period.end === campaign.endDate &&
    times.start === fromApiTime(campaign.startTime) &&
    times.end === fromApiTime(campaign.endTime);

  const entries = useSupportsAvailability(
    ids,
    validDates ? period.start : null,
    validDates ? period.end : null,
    { concurrency: 4, enabled: validDates },
  );
  const precheck = useMemo(
    () => precheckPeriodChange(active, entries, period.start, period.end),
    [active, entries, period.start, period.end],
  );

  const reason = !validDates
    ? "Choisissez une nouvelle période valide."
    : period.start < today
      ? "La date de début ne peut pas être passée."
      : !validTimes
        ? "L'heure de fin doit suivre l'heure de début."
        : unchanged
          ? "Choisissez une période différente de la période actuelle."
          : precheck.loading
            ? "Vérification des disponibilités en cours."
            : null;

  useEffect(() => {
    setDirty(!unchanged);
  }, [unchanged, setDirty]);

  const confirm = async () => {
    if (reason || running) return;
    setRunning(true);
    setFailure(null);
    const result = await changeCampaignPeriod(
      {
        source: campaign,
        period: {
          startDate: period.start,
          endDate: period.end,
          startTime: times.start,
          endTime: times.end,
        },
        reservations: active,
        availableSupportIds: precheck.available,
      },
      {
        duplicate: (source, overrides) => campaignsApi.duplicate(source, overrides),
        remove: (id) => campaignsApi.remove(id),
        reserve: (body) => reservationsApi.create(body),
      },
    );
    setRunning(false);
    if (!result.ok) {
      setFailure(failureMessage(result));
      return;
    }
    setDirty(false);
    onChanged(
      result.campaign,
      {
        campaignId: result.campaign.id,
        rebooked: result.rebooked.map((r) => nameOf(r.supportId)),
        unavailable: result.skipped.map(nameOf),
        failed: result.failed.map((f) => ({
          name: nameOf(f.supportId),
          message: presentError(f.error).message,
        })),
      },
      campaign.id,
    );
    onOpenChange(false);
  };

  return (
    <DialogContent
      size="lg"
      title="Changer de période"
      description={`Brouillon « ${campaign.name} » · période actuelle ${formatDateRangeLong(campaign.startDate, campaign.endDate)}`}
      dirty={dirty && !running}
      preventOutsideClose={running}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="ghost" disabled={running}>
              Annuler
            </Button>
          </DialogClose>
          <Button
            variant="primary"
            loading={running}
            loadingLabel="Changement de période en cours"
            disabledReason={running ? null : reason}
            onClick={() => void confirm()}
          >
            Changer la période
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <DateRangeField
          id="nouvelle-periode"
          value={period}
          onChange={setPeriod}
          min={today}
          startLabel="Nouvelle date de début"
          endLabel="Nouvelle date de fin"
          disabled={running}
          required
        />
        <TimeRangeField
          id="nouveaux-horaires"
          value={times}
          onChange={setTimes}
          disabled={running}
        />

        <section aria-labelledby="precheck-titre" className="flex flex-col gap-2">
          <h3
            id="precheck-titre"
            className="font-label text-[0.875rem] font-semibold text-ink-strong"
          >
            Porteurs bloqués sur ce brouillon
          </h3>
          <ul className="divide-y divide-line rounded-card border border-line" aria-live="polite">
            {ids.map((id) => {
              const entry = precheck.bySupport.get(id);
              const state = validDates ? (entry?.state ?? "loading") : "loading";
              const first = entry?.slots.find(
                (s) => s.endDate >= period.start && s.startDate <= period.end,
              );
              return (
                <li
                  key={id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3.5 py-2.5 text-[0.8125rem]"
                >
                  <span className="font-medium text-ink-soft">{nameOf(id)}</span>
                  <span
                    className={cx(
                      state === "free"
                        ? "text-success"
                        : state === "loading"
                          ? "text-muted"
                          : "text-warning",
                    )}
                  >
                    {!validDates
                      ? "Choisissez la période"
                      : state === "free"
                        ? "Disponible · sera re-bloqué"
                        : state === "busy"
                          ? `Réservé${first ? ` du ${formatDate(first.startDate, "medium")} au ${formatDate(first.endDate, "medium")}` : ""} · ne sera pas conservé`
                          : state === "error"
                            ? "Disponibilité illisible · ne sera pas conservé"
                            : "Vérification…"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <p className="text-[0.875rem] leading-relaxed text-ink-soft">{PERIOD_CHANGE_CONSEQUENCE}</p>

        {failure ? (
          <Alert tone="danger" title="Changement de période impossible">
            {failure}
          </Alert>
        ) : null}
      </div>
    </DialogContent>
  );
}
