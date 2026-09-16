"use client";

import { MapPinned } from "lucide-react";
import { type FormEvent, useMemo, useRef, useState } from "react";

import {
  firstIssues,
  focusFirstInvalid,
  type FormErrors,
  mergeDraft,
  parseDecimal,
  sameValues,
  serverFieldErrors,
} from "@/components/admin/form-utils";
import {
  ADDRESS_MAX,
  CAPACITY_MAX,
  SUPPORT_FIELDS,
  SUPPORT_TYPES,
  type SupportField,
  type SupportFormValues,
  supportFormFrom,
  supportSchema,
  TECHNICAL_STATUSES,
} from "@/components/admin/network-schemas";
import { PorteurFields } from "@/components/admin/porteur-fields";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { DraftRestoreNotice } from "@/components/ui/draft-restore-notice";
import { Field, Input, Select } from "@/components/ui/field";
import { supportsApi } from "@/lib/api/endpoints";
import { presentError } from "@/lib/api/errors";
import type { SupportResponse, ZoneResponse } from "@/lib/api/types";
import { SUPPORT_TYPE_LABEL, TECHNICAL_STATUS } from "@/lib/campaign-status";
import { useFormDraft } from "@/lib/forms/form-draft";
import { formatDistance, haversineDistance, suggestZoneForPoint } from "@/lib/network/geo";

export function SupportFormDialog({
  open,
  onOpenChange,
  support,
  zones,
  onSaved,
  initialValues = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create. */
  support: SupportResponse | null;
  zones: readonly ZoneResponse[];
  onSaved: (support: SupportResponse, created: boolean) => void;
  /** Create only: prefilled values (« Placer un Porteur » on the map). */
  initialValues?: SupportFormValues | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <SupportForm
          key={
            support?.id ??
            (initialValues
              ? `nouveau-${initialValues.latitude}-${initialValues.longitude}`
              : "nouveau")
          }
          support={support}
          zones={zones}
          initialValues={support ? null : initialValues}
          onSaved={(s) => {
            onSaved(s, support === null);
            onOpenChange(false);
          }}
        />
      ) : null}
    </Dialog>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="flex items-center gap-3 font-label text-[0.8125rem] font-semibold text-ink-soft after:h-px after:flex-1 after:bg-line">
      {children}
    </h3>
  );
}

function SupportForm({
  support,
  zones,
  initialValues,
  onSaved,
}: {
  support: SupportResponse | null;
  zones: readonly ZoneResponse[];
  initialValues: SupportFormValues | null;
  onSaved: (support: SupportResponse) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [initial] = useState<SupportFormValues>(() => initialValues ?? supportFormFrom(support));
  const [values, setValues] = useState<SupportFormValues>(initial);
  const dirty = !sameValues(values, initial);
  // A point placed on the map wins over an older local draft (no restore in that case).
  const draft = useFormDraft<SupportFormValues>({
    key: `admin:support:${support?.id ?? "new"}`,
    value: values,
    dirty,
    enabled: !initialValues,
    onRestore: (v) => setValues(mergeDraft(initial, v)),
  });
  const [errors, setErrors] = useState<FormErrors<SupportField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: SupportField, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  /** Pre-fill the coordinates with the zone centre when they are still empty. */
  const pickZone = (zoneId: string) => {
    set("zoneId", zoneId);
    const z = zones.find((zz) => String(zz.id) === zoneId);
    if (z && !values.latitude.trim() && !values.longitude.trim()) {
      setValues((v) => ({
        ...v,
        zoneId,
        latitude: String(z.latitude),
        longitude: String(z.longitude),
      }));
    }
  };

  // Zone suggestion from the typed/placed coordinates (nearest zone whose radius contains them).
  const point = useMemo(() => {
    const lat = parseDecimal(values.latitude);
    const lng = parseDecimal(values.longitude);
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  }, [values.latitude, values.longitude]);
  const suggested = point ? suggestZoneForPoint(point, zones) : null;
  const chosenZone = zones.find((z) => String(z.id) === values.zoneId) ?? null;
  const outsideChosen =
    point && chosenZone && chosenZone.radiusKm !== null && chosenZone.radiusKm > 0
      ? haversineDistance(point, { lng: chosenZone.longitude, lat: chosenZone.latitude })
      : null;
  const isOutside =
    outsideChosen !== null &&
    chosenZone?.radiusKm != null &&
    outsideChosen > chosenZone.radiusKm * 1000;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    const parsed = supportSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(firstIssues(parsed.error, SUPPORT_FIELDS));
      focusFirstInvalid(formRef.current);
      return;
    }
    setSaving(true);
    try {
      const saved = support
        ? await supportsApi.update(support.id, parsed.data)
        : await supportsApi.create(parsed.data);
      draft.clear();
      onSaved(saved);
    } catch (err) {
      setSaving(false);
      setErrors(serverFieldErrors(err, SUPPORT_FIELDS));
      setFormError(presentError(err).message);
      focusFirstInvalid(formRef.current);
    }
  };

  const formId = support ? `support-form-${support.id}` : "support-form-nouveau";
  const sortedZones = [...zones].sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return (
    <DialogContent
      size="lg"
      className="sm:max-w-3xl"
      title={support ? `Modifier le Porteur « ${support.name} »` : "Nouveau Porteur"}
      description="Les Porteurs ne peuvent pas être supprimés : passez-les « Inactif » ou « Hors ligne » pour les retirer des réservations."
      preventOutsideClose={saving}
      dirty={dirty && !saving}
      onDiscard={draft.discard}
      footer={
        <>
          <DialogClose asChild>
            <Button variant="ghost" disabled={saving}>
              Annuler
            </Button>
          </DialogClose>
          <Button type="submit" form={formId} variant="primary" loading={saving}>
            {support ? "Enregistrer" : "Créer le Porteur"}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        ref={formRef}
        noValidate
        onSubmit={(e) => void submit(e)}
        className="flex flex-col gap-5"
      >
        {draft.restoredAt ? (
          <DraftRestoreNotice
            restoredAt={draft.restoredAt}
            onDiscard={() => {
              draft.discard();
              setValues(initial);
              setErrors({});
            }}
          />
        ) : null}

        {formError ? <Alert tone="danger">{formError}</Alert> : null}

        {zones.length === 0 ? (
          <Alert tone="info" title="Aucune zone" live="none">
            Créez d&apos;abord une zone : chaque Porteur y est rattaché.
          </Alert>
        ) : null}

        {initialValues && !support ? (
          <Alert tone="info" live="none" icon={<MapPinned />}>
            Position reprise du point choisi sur la carte
            {suggested
              ? ` — zone suggérée : « ${suggested.name} »`
              : " — aucune zone ne contient ce point"}
            .
          </Alert>
        ) : null}

        <SectionTitle>Identité</SectionTitle>

        <Field label="Nom du Porteur" required error={errors.name}>
          <Input
            value={values.name}
            maxLength={150}
            autoComplete="off"
            placeholder="Ex. : Rond-point de l'avenue principale"
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2">
          <Field
            label="Zone"
            required
            error={errors.zoneId}
            hint={
              isOutside && outsideChosen !== null && chosenZone
                ? `Position à ${formatDistance(outsideChosen)} du centre, hors du rayon de la zone.`
                : undefined
            }
          >
            <Select
              value={values.zoneId}
              placeholder="Choisir une zone…"
              onChange={(e) => pickZone(e.target.value)}
            >
              {sortedZones.map((z) => (
                <option key={z.id} value={String(z.id)}>
                  {z.name}
                  {z.isActive ? "" : " (inactive)"}
                  {suggested?.id === z.id ? " — suggérée" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type de support" required error={errors.supportType}>
            <Select value={values.supportType} onChange={(e) => set("supportType", e.target.value)}>
              {SUPPORT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SUPPORT_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {suggested && String(suggested.id) !== values.zoneId ? (
          <p className="-mt-2 flex flex-wrap items-center gap-2 text-[0.8125rem] text-muted">
            Zone qui contient cette position : « {suggested.name} ».
            <button
              type="button"
              onClick={() => set("zoneId", String(suggested.id))}
              className="inline-flex min-h-9 items-center rounded-full px-2 font-label font-semibold text-brand-blue-text hover:underline focus-visible:outline-2 focus-visible:outline-brand-blue-text"
            >
              Rattacher à cette zone
            </button>
          </p>
        ) : null}

        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2">
          <Field
            label="État technique"
            required
            hint="Seuls les Porteurs « Actif » (hors type D) sont réservables."
            error={errors.technicalStatus}
          >
            <Select
              value={values.technicalStatus}
              onChange={(e) => set("technicalStatus", e.target.value)}
            >
              {TECHNICAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TECHNICAL_STATUS[s].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Capacité de diffusion"
            hint={`Nombre entier entre 1 et ${CAPACITY_MAX} (1 par défaut).`}
            error={errors.diffusionCapacity}
          >
            <Input
              value={values.diffusionCapacity}
              inputMode="numeric"
              autoComplete="off"
              placeholder="1"
              onChange={(e) => set("diffusionCapacity", e.target.value)}
            />
          </Field>
        </div>

        <SectionTitle>Position</SectionTitle>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2">
          <Field
            label="Latitude"
            required
            hint="Degrés décimaux (centre de la zone proposé)"
            error={errors.latitude}
          >
            <Input
              value={values.latitude}
              inputMode="decimal"
              autoComplete="off"
              placeholder="36.7998"
              onChange={(e) => set("latitude", e.target.value)}
            />
          </Field>
          <Field label="Longitude" required hint="Degrés décimaux" error={errors.longitude}>
            <Input
              value={values.longitude}
              inputMode="decimal"
              autoComplete="off"
              placeholder="10.1817"
              onChange={(e) => set("longitude", e.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Adresse"
          hint={
            support?.address
              ? "Laisser vide efface l'adresse enregistrée."
              : `Facultatif, ${ADDRESS_MAX} caractères maximum. Lieu ou repère, sans numéro inventé.`
          }
          error={errors.address}
        >
          <Input
            value={values.address}
            maxLength={ADDRESS_MAX}
            autoComplete="off"
            placeholder="Ex. : Rond-point de la place principale"
            onChange={(e) => set("address", e.target.value)}
          />
        </Field>

        <SectionTitle>Porteur</SectionTitle>

        <PorteurFields
          idPrefix={formId}
          values={values}
          errors={errors}
          onChange={set}
          typeLocked={support?.porteurType != null}
          heightLocked={support?.mastHeightM != null}
          headingLocked={support?.headingDeg != null}
        />
      </form>
    </DialogContent>
  );
}
