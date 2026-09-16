"use client";

import { ExternalLink } from "lucide-react";
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
  RADIUS_MAX_KM,
  ZONE_FIELDS,
  type ZoneField,
  type ZoneFormValues,
  zoneFormFrom,
  zoneSchema,
} from "@/components/admin/network-schemas";
import { ZoneMapPicker } from "@/components/admin/zone-map-picker";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { DraftRestoreNotice } from "@/components/ui/draft-restore-notice";
import { Field, Input } from "@/components/ui/field";
import { zonesApi } from "@/lib/api/endpoints";
import { presentError } from "@/lib/api/errors";
import type { SupportResponse, ZoneResponse } from "@/lib/api/types";
import { useFormDraft } from "@/lib/forms/form-draft";

export function ZoneFormDialog({
  open,
  onOpenChange,
  zone,
  onSaved,
  initialValues = null,
  contextZones = [],
  contextSupports = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create. */
  zone: ZoneResponse | null;
  onSaved: (zone: ZoneResponse, created: boolean) => void;
  /** Create only: prefilled values (« Créer une zone » on the map). */
  initialValues?: ZoneFormValues | null;
  /** Other zones and Porteurs drawn on the mini-map for context. */
  contextZones?: readonly ZoneResponse[];
  contextSupports?: readonly SupportResponse[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <ZoneForm
          key={
            zone?.id ??
            (initialValues
              ? `nouvelle-${initialValues.latitude}-${initialValues.longitude}`
              : "nouvelle")
          }
          zone={zone}
          initialValues={zone ? null : initialValues}
          contextZones={contextZones}
          contextSupports={contextSupports}
          onSaved={(z) => {
            onSaved(z, zone === null);
            onOpenChange(false);
          }}
        />
      ) : null}
    </Dialog>
  );
}

function osmLink(lat: string, lng: string): string | null {
  const la = parseDecimal(lat);
  const lo = parseDecimal(lng);
  if (la === null || lo === null || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=14/${la}/${lo}`;
}

function ZoneForm({
  zone,
  initialValues,
  contextZones,
  contextSupports,
  onSaved,
}: {
  zone: ZoneResponse | null;
  initialValues: ZoneFormValues | null;
  contextZones: readonly ZoneResponse[];
  contextSupports: readonly SupportResponse[];
  onSaved: (zone: ZoneResponse) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [initial] = useState<ZoneFormValues>(() => initialValues ?? zoneFormFrom(zone));
  const [values, setValues] = useState<ZoneFormValues>(initial);
  const dirty = !sameValues(values, initial);
  // A point picked on the map wins over an older local draft (no restore in that case).
  const draft = useFormDraft<ZoneFormValues>({
    key: `admin:zone:${zone?.id ?? "new"}`,
    value: values,
    dirty,
    enabled: !initialValues,
    onRestore: (v) => setValues(mergeDraft(initial, v)),
  });
  const otherZones = useMemo(
    () => contextZones.filter((z) => z.id !== zone?.id),
    [contextZones, zone],
  );
  const lat = parseDecimal(values.latitude);
  const lng = parseDecimal(values.longitude);
  const validPoint = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const radius = parseDecimal(values.radiusKm);
  const [errors, setErrors] = useState<FormErrors<ZoneField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ZoneFormValues>(key: K, value: ZoneFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    const parsed = zoneSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(firstIssues(parsed.error, ZONE_FIELDS));
      focusFirstInvalid(formRef.current);
      return;
    }
    setSaving(true);
    try {
      const saved = zone
        ? await zonesApi.update(zone.id, parsed.data)
        : await zonesApi.create(parsed.data);
      draft.clear();
      onSaved(saved);
    } catch (err) {
      setSaving(false);
      const fields = serverFieldErrors(err, ZONE_FIELDS);
      setErrors(fields);
      setFormError(presentError(err).message);
      focusFirstInvalid(formRef.current);
    }
  };

  const map = osmLink(values.latitude, values.longitude);
  const pick = (la: number, lo: number) => {
    setValues((v) => ({ ...v, latitude: String(la), longitude: String(lo) }));
    setErrors((e) => ({ ...e, latitude: undefined, longitude: undefined }));
  };
  const formId = zone ? `zone-form-${zone.id}` : "zone-form-nouvelle";

  return (
    <DialogContent
      size="lg"
      title={zone ? `Modifier la zone « ${zone.name} »` : "Nouvelle zone"}
      description="Une zone regroupe des Porteurs autour d'un point central. Coordonnées en degrés décimaux (WGS 84)."
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
            {zone ? "Enregistrer" : "Créer la zone"}
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

        <Field label="Nom de la zone" required error={errors.name}>
          <Input
            value={values.name}
            maxLength={150}
            autoComplete="off"
            placeholder="Ex. : Tunis Centre"
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2">
          <Field label="Latitude" required hint="Entre -90 et 90" error={errors.latitude}>
            <Input
              value={values.latitude}
              inputMode="decimal"
              autoComplete="off"
              placeholder="36.8008"
              onChange={(e) => set("latitude", e.target.value)}
            />
          </Field>
          <Field label="Longitude" required hint="Entre -180 et 180" error={errors.longitude}>
            <Input
              value={values.longitude}
              inputMode="decimal"
              autoComplete="off"
              placeholder="10.1800"
              onChange={(e) => set("longitude", e.target.value)}
            />
          </Field>
        </div>

        <ZoneMapPicker
          name={values.name}
          latitude={validPoint ? lat : null}
          longitude={validPoint ? lng : null}
          radiusKm={radius !== null && radius > 0 ? radius : null}
          otherZones={otherZones}
          supports={contextSupports}
          onPick={pick}
          onRadius={(km) => set("radiusKm", String(km))}
        />

        {map ? (
          <a
            href={map}
            target="_blank"
            rel="noopener noreferrer"
            className="-mt-2 inline-flex w-fit items-center gap-1.5 text-[0.8125rem] text-brand-blue-text hover:underline"
          >
            Vérifier ce point sur OpenStreetMap
            <ExternalLink aria-hidden="true" className="size-3.5" />
            <span className="sr-only">(nouvel onglet)</span>
          </a>
        ) : null}

        <Field
          label="Rayon (km)"
          hint={`Facultatif. Strictement positif, ${RADIUS_MAX_KM} km maximum.`}
          error={errors.radiusKm}
        >
          <Input
            value={values.radiusKm}
            inputMode="decimal"
            autoComplete="off"
            placeholder="3"
            onChange={(e) => set("radiusKm", e.target.value)}
          />
        </Field>

        <Checkbox
          label="Zone active"
          description="Seules les zones actives sont proposées aux annonceurs lors de la réservation."
          checked={values.isActive}
          onChange={(e) => set("isActive", e.target.checked)}
        />
      </form>
    </DialogContent>
  );
}
