"use client";

import { ArrowLeft, CircleCheck, CircleX, MapPin, Siren } from "lucide-react";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";

import {
  createPerZone,
  DURATION_MAX,
  DURATION_MIN,
  EMERGENCY_FIELDS,
  type EmergencyDraft,
  type EmergencyField,
  type EmergencyFormValues,
  emergencyImpact,
  emergencyRequests,
  emergencySchema,
  emptyEmergencyForm,
  isEmergencyFormDirty,
  normalizeEmergencyDraft,
  PRIORITY_OPTIONS,
  priorityLabel,
  TITLE_MAX,
  TITLE_RECOMMENDED,
  URGENCY_LEVELS,
  type ZonePostResult,
} from "@/components/admin/emergency-schema";
import {
  firstIssues,
  focusFirstInvalid,
  type FormErrors,
  serverFieldErrors,
} from "@/components/admin/form-utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateRangeField } from "@/components/ui/date-field";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { DraftRestoreNotice } from "@/components/ui/draft-restore-notice";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { TimeRangeField } from "@/components/ui/time-range-field";
import { emergencyApi } from "@/lib/api/endpoints";
import { ApiError, presentError } from "@/lib/api/errors";
import type { EmergencyResponse, SupportResponse, ZoneResponse } from "@/lib/api/types";
import { URGENCY_LEVEL } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { formatDateRangeLong, formatTimeRange, fromApiTime, todayISO } from "@/lib/format";
import { useFormDraft } from "@/lib/forms/form-draft";

export const EMERGENCY_DRAFT_KEY = "admin:emergency:new";
const DRAFT_VERSION = 2;

export interface EmergencyCreated {
  messages: EmergencyResponse[];
  /** An active Porteur of the targeted zones, for « Vérifier sur un écran ». */
  sampleSupportId: number | null;
}

export function EmergencyFormDialog({
  open,
  onOpenChange,
  zones,
  supports = [],
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zones: readonly ZoneResponse[];
  /** For the impact line (active Porteurs per zone). */
  supports?: readonly SupportResponse[];
  /** Called once per submission with every message created (partial success included). */
  onCreated: (result: EmergencyCreated) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <EmergencyForm
          zones={zones}
          supports={supports}
          onClose={() => onOpenChange(false)}
          onCreated={onCreated}
        />
      ) : null}
    </Dialog>
  );
}

function ScreenPreview({
  title,
  zone,
  size = "sm",
}: {
  title: string;
  zone: string | null;
  size?: "sm" | "lg";
}) {
  const text = title.trim() || "Titre du message";
  return (
    <figure className="flex flex-col gap-2">
      {/* Simulated street screen (always red on dark): literal colours are the screen content. */}
      <div
        aria-hidden="true"
        className={cx(
          "@container relative aspect-video overflow-hidden rounded-card bg-brand-red-600 shadow-lift",
          size === "lg" && "w-full",
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(70%_80%_at_30%_35%,var(--color-brand-red),transparent_70%)]" />
        <div className="absolute inset-[3cqw] rounded-[2cqw] border-[0.7cqw] border-on-brand/90" />
        <div className="absolute inset-0 flex flex-col justify-between p-[8cqw]">
          <span className="inline-flex items-center gap-[2cqw] font-label text-[max(12px,3.4cqw)] font-bold tracking-[0.16em] text-on-brand uppercase">
            <span className="inline-flex size-[8cqw] items-center justify-center rounded-full bg-on-brand text-brand-red-600">
              <Siren className="size-[4.6cqw]" />
            </span>
            Message prioritaire
          </span>
          <span className="line-clamp-3 font-display text-[9cqw] leading-[1.04] font-extrabold tracking-tight break-words text-on-brand">
            {text}
          </span>
          <span className="inline-flex items-center gap-[1.4cqw] text-[max(12px,3.4cqw)] font-semibold text-on-brand">
            <MapPin className="size-[3.6cqw]" />
            {zone ?? "Zone"}
          </span>
        </div>
      </div>
      <figcaption className="text-xs leading-snug text-muted">
        Aperçu : sur les écrans, seul le titre est affiché, avec le nom de la zone.
      </figcaption>
    </figure>
  );
}

type Step = "edit" | "confirm" | "results";

function EmergencyForm({
  zones,
  supports,
  onClose,
  onCreated,
}: {
  zones: readonly ZoneResponse[];
  supports: readonly SupportResponse[];
  onClose: () => void;
  onCreated: (result: EmergencyCreated) => void;
}) {
  const today = todayISO();
  const uid = useId().replace(/:/g, "");
  const formRef = useRef<HTMLFormElement>(null);
  const allRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<EmergencyFormValues>(() => emptyEmergencyForm(today));
  const [errors, setErrors] = useState<FormErrors<EmergencyField>>({});
  const [step, setStep] = useState<Step>("edit");
  const [draft, setDraft] = useState<EmergencyDraft | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [results, setResults] = useState<ZonePostResult[] | null>(null);

  const dirty = isEmergencyFormDirty(values, today);
  const saved = useFormDraft<EmergencyFormValues>({
    key: EMERGENCY_DRAFT_KEY,
    version: DRAFT_VERSION,
    value: values,
    dirty: dirty && results === null,
    onRestore: (v) => setValues(normalizeEmergencyDraft(v, today)),
  });

  const sortedZones = useMemo(
    () => [...zones].sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [zones],
  );
  const activeByZone = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of supports) {
      if (s.technicalStatus === "ACTIF") m.set(s.zoneId, (m.get(s.zoneId) ?? 0) + 1);
    }
    return m;
  }, [supports]);
  const zoneName = (id: number | string) =>
    zones.find((z) => String(z.id) === String(id))?.name ?? `Zone n° ${id}`;

  const allSelected = sortedZones.length > 0 && values.zoneIds.length === sortedZones.length;
  const someSelected = values.zoneIds.length > 0 && !allSelected;
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const impact = emergencyImpact(values.zoneIds, zones, supports, values.startDate, today);

  const set = <K extends keyof EmergencyFormValues>(key: K, value: EmergencyFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const toggleZone = (id: string, on: boolean) =>
    set(
      "zoneIds",
      on ? [...new Set([...values.zoneIds, id])] : values.zoneIds.filter((z) => z !== id),
    );

  const review = (e: FormEvent) => {
    e.preventDefault();
    const parsed = emergencySchema(today).safeParse(values);
    if (!parsed.success) {
      setErrors(firstIssues(parsed.error, EMERGENCY_FIELDS));
      focusFirstInvalid(formRef.current);
      return;
    }
    setErrors({});
    setDraft(parsed.data);
    setStep("confirm");
  };

  const send = async (onlyZones?: readonly number[]) => {
    if (!draft || sending) return;
    const requests = emergencyRequests(draft).filter(
      (r) => !onlyZones || onlyZones.includes(r.zoneId),
    );
    setSending(`0 sur ${requests.length}`);
    const out = await createPerZone(
      requests,
      (body) => emergencyApi.create(body),
      (done, total) => setSending(`${done} sur ${total}`),
    );
    setSending(null);
    const merged = onlyZones
      ? [...(results ?? []).filter((r) => !onlyZones.includes(r.zoneId)), ...out]
      : out;
    const created = out.flatMap((r) => (r.ok && r.message ? [r.message] : []));
    const sample = emergencyImpact(
      created.map((m) => m.zoneId),
      zones,
      supports,
      draft.body.startDate,
      today,
    ).sampleSupportId;
    if (created.length > 0) onCreated({ messages: created, sampleSupportId: sample });

    if (merged.every((r) => r.ok)) {
      saved.clear();
      onClose();
      return;
    }
    // Field errors from the backend (400) on a single-zone send go back to the form.
    const firstError = out.find((r) => !r.ok)?.error;
    if (
      out.length === 1 &&
      firstError instanceof ApiError &&
      Object.keys(firstError.fieldErrors).length > 0
    ) {
      const mapped = serverFieldErrors(firstError, EMERGENCY_FIELDS);
      if ("zoneId" in firstError.fieldErrors) mapped.zoneIds = firstError.fieldErrors.zoneId;
      setErrors(mapped);
      setResults(null);
      setStep("edit");
      focusFirstInvalid(formRef.current);
      return;
    }
    saved.clear();
    setResults(merged);
    setStep("results");
  };

  const failedZones = (results ?? []).filter((r) => !r.ok).map((r) => r.zoneId);
  const formId = `${uid}-emergency-form`;
  const titleLength = values.title.trim().length;
  const startsToday = draft ? draft.body.startDate <= today : false;

  const reset = () => {
    setValues(emptyEmergencyForm(today));
    setErrors({});
  };

  // ---------------------------------------------------------------------------------------
  if (step === "results" && results) {
    const okCount = results.filter((r) => r.ok).length;
    return (
      <DialogContent
        size="lg"
        title="Résultat de la diffusion"
        description={`${okCount} message${okCount > 1 ? "s" : ""} programmé${okCount > 1 ? "s" : ""} sur ${results.length} zone${results.length > 1 ? "s" : ""}.`}
        preventOutsideClose={sending !== null}
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={sending !== null}>
              Fermer
            </Button>
            {failedZones.length > 0 ? (
              <Button
                variant="primary"
                loading={sending !== null}
                loadingLabel="Nouvel essai en cours"
                iconLeft={<Siren aria-hidden="true" />}
                onClick={() => void send(failedZones)}
              >
                Réessayer {failedZones.length} zone{failedZones.length > 1 ? "s" : ""}
              </Button>
            ) : null}
          </>
        }
      >
        <ul
          aria-label="Résultat par zone"
          className="flex flex-col divide-y divide-line rounded-card border border-line pb-0"
        >
          {results.map((r) => (
            <li key={r.zoneId} className="flex items-start gap-3 px-4 py-3">
              {r.ok ? (
                <CircleCheck aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-success" />
              ) : (
                <CircleX aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-danger" />
              )}
              <span className="flex min-w-0 flex-col">
                <span className="font-label text-sm font-semibold text-ink-strong">
                  {zoneName(r.zoneId)}
                </span>
                <span className={cx("text-[0.8125rem]", r.ok ? "text-muted" : "text-danger")}>
                  {r.ok
                    ? `Programmé (message n° ${r.message?.id ?? "?"})`
                    : `Échec : ${presentError(r.error).message}`}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {sending ? (
          <p role="status" className="mt-3 text-[0.8125rem] text-muted">
            Envoi en cours : {sending}
          </p>
        ) : null}
      </DialogContent>
    );
  }

  if (step === "confirm" && draft) {
    const zoneList = draft.zoneIds.map(zoneName);
    const impactConfirm = emergencyImpact(
      draft.zoneIds,
      zones,
      supports,
      draft.body.startDate,
      today,
    );
    return (
      <DialogContent
        size="lg"
        title="Confirmer la diffusion"
        description="Vérifiez le message tel qu'il apparaîtra. Il passe avant toute publicité sur les Porteurs des zones choisies, pendant sa période."
        dirty={sending === null}
        onDiscard={() => {
          saved.discard();
          reset();
        }}
        preventOutsideClose={sending !== null}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setStep("edit")}
              disabled={sending !== null}
              iconLeft={<ArrowLeft aria-hidden="true" />}
            >
              Modifier
            </Button>
            <Button
              variant="primary"
              loading={sending !== null}
              loadingLabel="Diffusion en cours"
              iconLeft={<Siren aria-hidden="true" />}
              onClick={() => void send()}
            >
              {zoneList.length > 1
                ? `Diffuser dans ${zoneList.length} zones`
                : "Diffuser le message"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5 pb-2">
          {startsToday ? (
            <Alert tone="warning" title="Diffusion immédiate" live="none">
              La période commence aujourd&apos;hui : le message prend la main sur les écrans dès le
              prochain appel des lecteurs.
            </Alert>
          ) : null}
          <ScreenPreview title={draft.body.title} zone={zoneList[0] ?? null} size="lg" />
          {impactConfirm.sentence ? (
            <p className="text-sm font-medium text-ink-soft">{impactConfirm.sentence}</p>
          ) : null}
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm min-[420px]:grid-cols-2">
            <div className="min-w-0 min-[420px]:col-span-2">
              <dt className="text-[0.8125rem] font-medium text-muted">Zones</dt>
              <dd className="mt-0.5 text-ink-strong">{zoneList.join(", ")}</dd>
            </div>
            <div>
              <dt className="text-[0.8125rem] font-medium text-muted">Période</dt>
              <dd className="mt-0.5 text-ink-strong">
                {formatDateRangeLong(draft.body.startDate, draft.body.endDate)}
              </dd>
            </div>
            <div>
              <dt className="text-[0.8125rem] font-medium text-muted">Heures</dt>
              <dd className="mt-0.5 text-ink-soft">
                {draft.body.startTime
                  ? `${formatTimeRange(draft.body.startTime, draft.body.endTime ?? null)} (enregistrées, non appliquées)`
                  : "Toute la journée"}
              </dd>
            </div>
            <div>
              <dt className="text-[0.8125rem] font-medium text-muted">Urgence</dt>
              <dd className="mt-0.5">
                <StatusPill type="urgency" level={draft.body.urgencyLevel ?? "HIGH"} size="sm" />
              </dd>
            </div>
            <div>
              <dt className="text-[0.8125rem] font-medium text-muted">Priorité</dt>
              <dd className="mt-0.5 text-ink-soft">{priorityLabel(draft.body.priority ?? 1)}</dd>
            </div>
            <div className="min-w-0 min-[420px]:col-span-2">
              <dt className="text-[0.8125rem] font-medium text-muted">
                Contenu détaillé (back-office)
              </dt>
              <dd className="mt-0.5 break-words whitespace-pre-line text-ink-soft">
                {draft.body.content}
              </dd>
            </div>
          </dl>
          {sending ? (
            <p role="status" className="text-[0.8125rem] text-muted">
              Envoi en cours : {sending}
            </p>
          ) : null}
        </div>
      </DialogContent>
    );
  }

  return (
    <DialogContent
      size="lg"
      title="Nouveau message prioritaire"
      description="Pendant sa période, un message actif passe avant toute publicité sur les Porteurs de sa zone. Réservé aux informations d'intérêt général."
      dirty={dirty}
      onDiscard={() => {
        saved.discard();
        reset();
      }}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="ghost">Annuler</Button>
          </DialogClose>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            iconLeft={<Siren aria-hidden="true" />}
          >
            Vérifier et diffuser
          </Button>
        </>
      }
    >
      <form id={formId} ref={formRef} noValidate onSubmit={review} className="flex flex-col gap-6">
        {saved.restoredAt ? (
          <DraftRestoreNotice
            restoredAt={saved.restoredAt}
            onDiscard={() => {
              saved.discard();
              reset();
            }}
          />
        ) : null}

        {zones.length === 0 ? (
          <Alert tone="info" title="Aucune zone" live="none">
            Un message prioritaire cible une zone : créez d&apos;abord une zone dans Réseau.
          </Alert>
        ) : null}

        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]">
          <div className="flex flex-col gap-5">
            <Field
              label="Titre affiché"
              required
              id={`${uid}-title`}
              hint={`Seul texte transmis aux écrans : ${TITLE_RECOMMENDED} caractères au plus pour rester lisible de loin.`}
              error={errors.title}
            >
              <Input
                value={values.title}
                maxLength={TITLE_MAX}
                autoComplete="off"
                placeholder="Ex. : Route fermée, déviation par l'avenue voisine"
                onChange={(e) => set("title", e.target.value)}
              />
            </Field>
            <p
              className={cx(
                "-mt-3 text-right text-xs tabular",
                titleLength > TITLE_RECOMMENDED ? "text-warning" : "text-muted",
              )}
              aria-live="polite"
            >
              {titleLength}/{TITLE_RECOMMENDED} caractères recommandés
              {titleLength > TITLE_RECOMMENDED ? " · difficile à lire de loin" : ""}
            </p>
            <Field
              label="Contenu détaillé (facultatif)"
              hint="Pas encore affiché sur les écrans : conservé dans le back-office. Laissé vide, le titre est repris."
              error={errors.content}
            >
              <Textarea
                value={values.content}
                maxLength={2000}
                rows={3}
                onChange={(e) => set("content", e.target.value)}
              />
            </Field>
          </div>
          <ScreenPreview
            title={values.title}
            zone={
              values.zoneIds.length === 1
                ? zoneName(values.zoneIds[0] ?? "")
                : values.zoneIds.length > 1
                  ? `${values.zoneIds.length} zones`
                  : null
            }
          />
        </div>

        <div className="hairline" aria-hidden="true" />

        <fieldset
          className="flex flex-col gap-2"
          aria-describedby={errors.zoneIds ? `${uid}-zones-error` : undefined}
        >
          <legend className="mb-1 font-label text-[0.8125rem] font-medium text-ink-soft">
            Zones
            <span aria-hidden="true" className="ml-0.5 text-brand-orange-text">
              *
            </span>
          </legend>
          {sortedZones.length > 0 ? (
            <>
              <Checkbox
                ref={allRef}
                label="Toutes les zones"
                description={`${sortedZones.length} zone${sortedZones.length > 1 ? "s" : ""}`}
                checked={allSelected}
                aria-invalid={errors.zoneIds ? true : undefined}
                onChange={(e) =>
                  set("zoneIds", e.target.checked ? sortedZones.map((z) => String(z.id)) : [])
                }
              />
              <div className="grid max-h-56 grid-cols-1 gap-x-4 overflow-y-auto rounded-card border border-line bg-overlay-inset px-3 sm:grid-cols-2">
                {sortedZones.map((z) => {
                  const active = activeByZone.get(z.id) ?? 0;
                  return (
                    <Checkbox
                      key={z.id}
                      label={`${z.name}${z.isActive ? "" : " (inactive)"}`}
                      description={`${active} Porteur${active > 1 ? "s" : ""} actif${active > 1 ? "s" : ""}`}
                      checked={values.zoneIds.includes(String(z.id))}
                      onChange={(e) => toggleZone(String(z.id), e.target.checked)}
                    />
                  );
                })}
              </div>
            </>
          ) : null}
          {errors.zoneIds ? (
            <p id={`${uid}-zones-error`} className="text-[0.8125rem] text-danger">
              {errors.zoneIds}
            </p>
          ) : null}
          {impact.sentence ? (
            <p className="text-[0.8125rem] font-medium text-ink-soft" aria-live="polite">
              {impact.sentence}
            </p>
          ) : null}
        </fieldset>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2">
          <Field label="Niveau d'urgence" required error={errors.urgencyLevel}>
            <Select
              value={values.urgencyLevel}
              onChange={(e) => set("urgencyLevel", e.target.value)}
            >
              {URGENCY_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {URGENCY_LEVEL[l].label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-col gap-2">
            <span
              id={`${uid}-priority-label`}
              className="font-label text-[0.8125rem] font-medium text-ink-soft"
            >
              Priorité
            </span>
            <div
              role="group"
              aria-labelledby={`${uid}-priority-label`}
              aria-describedby={`${uid}-priority-hint`}
              className="grid grid-cols-2 gap-1 rounded-control border border-line-strong bg-overlay-inset p-1"
            >
              {PRIORITY_OPTIONS.map((o) => {
                const pressed = values.priority === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => set("priority", o.value)}
                    className={cx(
                      "min-h-10 rounded-[9px] px-3 font-label text-[0.8125rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-text",
                      pressed
                        ? "bg-surface-3 text-ink-strong shadow-lift"
                        : "text-muted hover:text-ink",
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <p id={`${uid}-priority-hint`} className="text-[0.8125rem] leading-snug text-muted">
              Entre plusieurs messages en cours dans une zone, « Passe en premier » est diffusé
              avant les autres.
            </p>
            {errors.priority ? (
              <p className="text-[0.8125rem] text-danger">{errors.priority}</p>
            ) : null}
          </div>
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 font-label text-[0.8125rem] font-semibold text-ink-strong">
            Période de diffusion
          </legend>
          <DateRangeField
            id={`${uid}-period`}
            value={{ start: values.startDate, end: values.endDate }}
            onChange={(v) => {
              setValues((prev) => ({ ...prev, startDate: v.start, endDate: v.end }));
              if (errors.startDate || errors.endDate) {
                setErrors((e) => ({ ...e, startDate: undefined, endDate: undefined }));
              }
            }}
            startLabel="Date de début"
            endLabel="Date de fin"
            required
            presets={["1w", "2w"]}
            errors={{ start: errors.startDate, end: errors.endDate }}
          />
          <TimeRangeField
            id={`${uid}-hours`}
            value={{ start: fromApiTime(values.startTime), end: fromApiTime(values.endTime) }}
            onChange={(v) => {
              setValues((prev) => ({ ...prev, startTime: v.start, endTime: v.end }));
              if (errors.startTime || errors.endTime) {
                setErrors((e) => ({ ...e, startTime: undefined, endTime: undefined }));
              }
            }}
            startLabel="Heure de début (facultatif)"
            endLabel="Heure de fin (facultatif)"
            hint="Les lecteurs n'appliquent pas encore les heures : le message passe toute la journée sur sa période."
            errors={{ start: errors.startTime, end: errors.endTime }}
          />
          {values.startTime || values.endTime ? (
            <div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setValues((prev) => ({ ...prev, startTime: "", endTime: "" }))}
              >
                Effacer les heures
              </Button>
            </div>
          ) : null}
        </fieldset>

        <Field
          label="Durée d'affichage (secondes)"
          hint={`Facultatif, entre ${DURATION_MIN} et ${DURATION_MAX} s. Par défaut : 15 s par passage.`}
          error={errors.durationSeconds}
          className="sm:max-w-xs"
        >
          <Input
            type="number"
            min={DURATION_MIN}
            max={DURATION_MAX}
            step={1}
            inputMode="numeric"
            placeholder="15"
            value={values.durationSeconds}
            onChange={(e) => set("durationSeconds", e.target.value)}
          />
        </Field>
      </form>
    </DialogContent>
  );
}
