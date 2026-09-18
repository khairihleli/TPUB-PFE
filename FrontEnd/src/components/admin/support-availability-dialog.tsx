"use client";

import { CalendarOff, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";

import { FactList } from "@/components/admin/admin-ui";
import { firstIssues, focusFirstInvalid, type FormErrors } from "@/components/admin/form-utils";
import { addDaysISO } from "@/components/admin/stats-model";
import {
  BLOCK_FIELDS,
  BLOCK_MAX_DAYS,
  BLOCK_REASON_MAX,
  BLOCK_STATUSES,
  type BlockField,
  type BlockFormValues,
  blockSchema,
  buildCalendar,
  CALENDAR_DAYS,
  type CalendarDay,
  calendarSummary,
  emptyBlockForm,
} from "@/components/admin/support-blocks-model";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { supportsApi } from "@/lib/api/endpoints";
import { presentError } from "@/lib/api/errors";
import type { SupportResponse } from "@/lib/api/types";
import { SUPPORT_BLOCK_STATUS, SUPPORT_TYPE_LABEL } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { formatDate, formatNumber, fromApiTime, todayISO } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

/** « Disponibilités » of one Porteur: technical facts, 14-day calendar, unavailability blocks. */
export function SupportAvailabilityDialog({
  support,
  open,
  onOpenChange,
  canAct,
}: {
  support: SupportResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canAct: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && support ? (
        <AvailabilityContent key={support.id} support={support} canAct={canAct} />
      ) : null}
    </Dialog>
  );
}

async function loadCalendar(supportId: number, from: string, signal: AbortSignal) {
  const to = addDaysISO(from, CALENDAR_DAYS - 1);
  const [blocks, slots] = await Promise.all([
    supportsApi.blocks(supportId, { from, to }, { signal }),
    supportsApi.availability(supportId, { from, to }, { signal }),
  ]);
  return { blocks, slots };
}

function AvailabilityContent({ support, canAct }: { support: SupportResponse; canAct: boolean }) {
  const { toast } = useToast();
  const today = todayISO();
  const [from, setFrom] = useState(today);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const calendar = useResource(`admin:support:${support.id}:calendar:${from}`, (signal) =>
    loadCalendar(support.id, from, signal),
  );
  const days: CalendarDay[] | null = calendar.data
    ? buildCalendar(from, CALENDAR_DAYS, calendar.data.blocks, calendar.data.slots)
    : null;

  const removeBlock = async (blockId: number) => {
    if (deleting !== null) return;
    setDeleting(blockId);
    setDeleteError(null);
    try {
      await supportsApi.removeBlock(support.id, blockId);
      calendar.setData((prev) => ({
        blocks: (prev?.blocks ?? []).filter((b) => b.id !== blockId),
        slots: prev?.slots ?? [],
      }));
      toast({ title: "Indisponibilité supprimée", variant: "success" });
    } catch (e) {
      setDeleteError(presentError(e).message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <DialogContent
      size="lg"
      title={`Disponibilités · ${support.name}`}
      description="Réservations et indisponibilités du Porteur, jour par jour. Une indisponibilité n'annule pas les réservations existantes."
    >
      <div className="flex flex-col gap-6">
        <FactList
          columns={3}
          items={[
            {
              label: "État technique",
              value: <StatusPill type="support" status={support.technicalStatus} size="sm" />,
            },
            { label: "Type", value: SUPPORT_TYPE_LABEL[support.supportType] },
            { label: "Zone", value: support.zoneName },
            {
              label: "Capacité de diffusion",
              value: `${formatNumber(support.diffusionCapacity)} campagne${support.diffusionCapacity > 1 ? "s" : ""} simultanée${support.diffusionCapacity > 1 ? "s" : ""}`,
            },
            {
              label: "Score de visibilité",
              value:
                support.visibilityScore != null
                  ? `${formatNumber(support.visibilityScore)} / 100`
                  : "Standard (non renseigné)",
            },
          ]}
        />

        {canAct ? (
          creating ? (
            <BlockForm
              supportId={support.id}
              today={today}
              onCancel={() => setCreating(false)}
              onCreated={(created) => {
                setCreating(false);
                calendar.setData((prev) => ({
                  blocks: [...(prev?.blocks ?? []), ...created],
                  slots: prev?.slots ?? [],
                }));
                toast({
                  title: `Indisponibilité ajoutée (${created.length} jour${created.length > 1 ? "s" : ""})`,
                  variant: "success",
                });
              }}
            />
          ) : (
            <div>
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<Plus aria-hidden="true" />}
                onClick={() => setCreating(true)}
              >
                Ajouter une indisponibilité
              </Button>
            </div>
          )
        ) : null}

        <section aria-labelledby={`calendrier-${support.id}`} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3
              id={`calendrier-${support.id}`}
              className="font-display text-base font-semibold text-ink-strong"
            >
              Du {formatDate(from, "medium")} au{" "}
              {formatDate(addDaysISO(from, CALENDAR_DAYS - 1), "medium")}
            </h3>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                iconLeft={<ChevronLeft aria-hidden="true" />}
                disabled={from <= today}
                onClick={() =>
                  setFrom((f) =>
                    addDaysISO(f, -CALENDAR_DAYS) < today ? today : addDaysISO(f, -CALENDAR_DAYS),
                  )
                }
              >
                Période précédente
              </Button>
              <Button
                size="sm"
                variant="ghost"
                iconRight={<ChevronRight aria-hidden="true" />}
                onClick={() => setFrom((f) => addDaysISO(f, CALENDAR_DAYS))}
              >
                Période suivante
              </Button>
            </div>
          </div>
          {deleteError ? <Alert tone="danger">{deleteError}</Alert> : null}
          {days ? (
            <>
              <p className="text-[0.8125rem] text-muted" aria-live="polite">
                {calendarSummary(days)}
              </p>
              <ol className="divide-y divide-line overflow-hidden rounded-card border border-line">
                {days.map((d) => (
                  <li
                    key={d.date}
                    className={cx(
                      "flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-start sm:gap-4",
                      d.blocked ? "bg-warning/5" : "bg-surface",
                    )}
                  >
                    <p className="w-32 shrink-0 font-label text-[0.8125rem] font-semibold text-ink-soft capitalize tabular">
                      {formatDate(d.date, "medium")}
                    </p>
                    {d.entries.length === 0 ? (
                      <p className="text-[0.8125rem] text-muted">Disponible toute la journée</p>
                    ) : (
                      <ul className="flex min-w-0 flex-1 flex-wrap gap-2">
                        {d.entries.map((entry) => (
                          <li key={entry.key} className="inline-flex items-center gap-1.5">
                            <Badge tone={entry.tone} size="sm">
                              {entry.label} · {fromApiTime(entry.startTime)}–
                              {fromApiTime(entry.endTime)}
                            </Badge>
                            {entry.detail ? (
                              <span className="text-[0.75rem] text-muted">{entry.detail}</span>
                            ) : null}
                            {canAct && entry.blockId !== null ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Supprimer l'indisponibilité du ${formatDate(d.date, "medium")} (${entry.label})`}
                                loading={deleting === entry.blockId}
                                loadingLabel="Suppression"
                                onClick={() => void removeBlock(entry.blockId as number)}
                              >
                                <Trash2 aria-hidden="true" />
                              </Button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </>
          ) : calendar.error ? (
            <ErrorState error={calendar.error} onRetry={calendar.reload} scope="section" />
          ) : (
            <LoadingRegion label="Chargement du calendrier…" className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </LoadingRegion>
          )}
        </section>
      </div>
    </DialogContent>
  );
}

function BlockForm({
  supportId,
  today,
  onCancel,
  onCreated,
}: {
  supportId: number;
  today: string;
  onCancel: () => void;
  onCreated: (blocks: Awaited<ReturnType<typeof supportsApi.createBlock>>) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<BlockFormValues>(() => emptyBlockForm(today));
  const [errors, setErrors] = useState<FormErrors<BlockField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: BlockField, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    const parsed = blockSchema(today).safeParse(values);
    if (!parsed.success) {
      setErrors(firstIssues(parsed.error, BLOCK_FIELDS));
      focusFirstInvalid(formRef.current);
      return;
    }
    setSaving(true);
    try {
      onCreated(await supportsApi.createBlock(supportId, parsed.data));
    } catch (err) {
      setFormError(presentError(err).message);
      setSaving(false);
    }
  };

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={submit}
      aria-label="Nouvelle indisponibilité"
      className="flex flex-col gap-4 rounded-card border border-line bg-overlay-inset p-4"
    >
      <p className="flex items-center gap-2 font-label text-[0.9375rem] font-semibold text-ink-strong">
        <CalendarOff aria-hidden="true" className="size-4.5 text-warning" />
        Nouvelle indisponibilité
      </p>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
        <Field label="Du" required error={errors.startDate}>
          <Input
            type="date"
            min={today}
            value={values.startDate}
            onChange={(e) => set("startDate", e.target.value)}
          />
        </Field>
        <Field label="Au" required error={errors.endDate} hint={`${BLOCK_MAX_DAYS} jours maximum.`}>
          <Input
            type="date"
            min={values.startDate || today}
            value={values.endDate}
            onChange={(e) => set("endDate", e.target.value)}
          />
        </Field>
        <Field label="De" required error={errors.startTime}>
          <Input
            type="time"
            value={values.startTime}
            onChange={(e) => set("startTime", e.target.value)}
          />
        </Field>
        <Field label="À" required error={errors.endTime}>
          <Input
            type="time"
            value={values.endTime}
            onChange={(e) => set("endTime", e.target.value)}
          />
        </Field>
        <Field label="Motif" required error={errors.availabilityStatus}>
          <Select
            value={values.availabilityStatus}
            onChange={(e) => set("availabilityStatus", e.target.value)}
          >
            {BLOCK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SUPPORT_BLOCK_STATUS[s].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Précision"
          error={errors.reason}
          hint={`${BLOCK_REASON_MAX} caractères maximum.`}
        >
          <Textarea
            rows={2}
            className="min-h-11"
            maxLength={BLOCK_REASON_MAX}
            value={values.reason}
            placeholder="Ex. : remplacement de la dalle LED"
            onChange={(e) => set("reason", e.target.value)}
          />
        </Field>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" loading={saving} loadingLabel="Enregistrement">
          Enregistrer l&apos;indisponibilité
        </Button>
      </div>
    </form>
  );
}
