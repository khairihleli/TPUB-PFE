"use client";

import { ArrowLeft, Eraser, MapPin, Siren } from "lucide-react";
import { type FormEvent, useId, useMemo, useRef, useState } from "react";

import {
  activeSupportsInCircle,
  activeSupportsInPolygon,
  activeSupportsInZone,
  CONTENT_MAX,
  DURATION_MAX,
  DURATION_MIN,
  EMERGENCY_FIELDS,
  type EmergencyField,
  type EmergencyFormValues,
  emergencySchema,
  emptyEmergencyForm,
  isEmergencyFormDirty,
  normalizeEmergencyDraft,
  parsePolygonField,
  PRIORITY_MAX,
  priorityLabel,
  RADIUS_MAX_KM,
  RADIUS_MIN_KM,
  serializePolygonField,
  TITLE_MAX,
  TITLE_RECOMMENDED,
  URGENCY_LEVELS,
} from "@/components/admin/emergency-schema";
import {
  firstIssues,
  focusFirstInvalid,
  type FormErrors,
  parseDecimal,
  parseInteger,
  serverFieldErrors,
} from "@/components/admin/form-utils";
import { ZoneMapPicker } from "@/components/admin/zone-map-picker";
import { PolygonVertexEditor } from "@/components/map/polygon-vertex-editor";
import { urgencyTheme } from "@/components/player/urgency-theme";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { DraftRestoreNotice } from "@/components/ui/draft-restore-notice";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { emergencyCarteApi } from "@/lib/api/endpoints-carte";
import { ApiError, hasErrorCode, presentError } from "@/lib/api/errors";
import type {
  EmergencyResponse,
  SupportResponse,
  UrgencyLevel,
  ZoneResponse,
} from "@/lib/api/types";
import type { EmergencyRequestCarte } from "@/lib/api/types-carte";
import { URGENCY_LEVEL } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { formatDateTime, formatNumber } from "@/lib/format";
import { useFormDraft } from "@/lib/forms/form-draft";
import { partsToDraft, type PolygonDraft } from "@/lib/network/overlays";

export const EMERGENCY_DRAFT_KEY = "admin:emergency:new";
const DRAFT_VERSION = 3;

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
  /** Porteurs drawn on the map and counted inside the circle. */
  supports?: readonly SupportResponse[];
  onCreated: (message: EmergencyResponse) => void;
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

/** Simulated street screen, coloured by urgency level like the player takeover. */
export function EmergencyScreenPreview({
  title,
  content,
  level,
  place,
}: {
  title: string;
  content: string;
  level: UrgencyLevel;
  place: string | null;
}) {
  const theme = urgencyTheme(level);
  return (
    <figure className="flex flex-col gap-2">
      <div
        aria-hidden="true"
        className={cx(
          "@container relative aspect-video overflow-hidden rounded-card shadow-lift",
          theme.ground,
        )}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(70% 80% at 30% 35%, ${theme.glow}, transparent 70%)`,
          }}
        />
        <div
          className={cx(
            "absolute inset-[3cqw] rounded-[2cqw] border-[0.7cqw] opacity-90",
            theme.frame,
          )}
        />
        <div
          className={cx(
            "absolute inset-0 flex flex-col justify-between gap-[2cqw] p-[7cqw]",
            theme.ink,
          )}
        >
          <span className="inline-flex items-center gap-[2cqw] font-label text-[max(11px,3.4cqw)] font-bold tracking-[0.16em] uppercase">
            <span
              className={cx(
                "inline-flex size-[8cqw] items-center justify-center rounded-full",
                theme.disc,
              )}
            >
              <Siren className="size-[4.6cqw]" />
            </span>
            {theme.kicker}
          </span>
          <span className="flex min-h-0 flex-col gap-[1.5cqw]">
            <span className="line-clamp-2 font-display text-[8cqw] leading-[1.04] font-extrabold tracking-tight break-words">
              {title.trim() || "Titre du message"}
            </span>
            <span className="line-clamp-2 text-[max(11px,3.6cqw)] leading-snug font-medium break-words opacity-90">
              {content.trim() || "Contenu affiché sous le titre."}
            </span>
          </span>
          <span className="inline-flex items-center gap-[1.4cqw] text-[max(11px,3.2cqw)] font-semibold">
            <MapPin className="size-[3.6cqw]" />
            {place ?? "Zone ciblée"}
          </span>
        </div>
      </div>
      <figcaption className="text-xs leading-snug text-muted">
        Aperçu : titre et contenu sont affichés en plein écran sur les Porteurs ciblés.
      </figcaption>
    </figure>
  );
}

type Step = "edit" | "confirm";
type TargetKind = "ZONE" | "CERCLE" | "POLYGONE";

const TARGET_LABELS: Record<TargetKind, string> = {
  ZONE: "Zone ZELQANE",
  CERCLE: "Cercle",
  POLYGONE: "Polygone",
};

function EmergencyForm({
  zones,
  supports,
  onClose,
  onCreated,
}: {
  zones: readonly ZoneResponse[];
  supports: readonly SupportResponse[];
  onClose: () => void;
  onCreated: (message: EmergencyResponse) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<EmergencyFormValues>(() => emptyEmergencyForm());
  const [errors, setErrors] = useState<FormErrors<EmergencyField>>({});
  const [step, setStep] = useState<Step>("edit");
  const [body, setBody] = useState<EmergencyRequestCarte | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const dirty = isEmergencyFormDirty(values);
  const saved = useFormDraft<EmergencyFormValues>({
    key: EMERGENCY_DRAFT_KEY,
    version: DRAFT_VERSION,
    value: values,
    dirty,
    onRestore: (v) => setValues(normalizeEmergencyDraft(v)),
  });

  const sortedZones = useMemo(
    () => [...zones].sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [zones],
  );
  const zoneName = (id: number | null | undefined) =>
    id === null || id === undefined
      ? null
      : (zones.find((z) => z.id === id)?.name ?? `Zone n° ${id}`);

  const lat = parseDecimal(values.latitude);
  const lng = parseDecimal(values.longitude);
  const radius = parseDecimal(values.radiusKm);
  const zoneId = parseInteger(values.zoneId);
  const polygonVertices = useMemo(() => parsePolygonField(values.polygon), [values.polygon]);
  const hasPolygon = polygonVertices.length > 0;
  const hasPoint = lat !== null && lng !== null && !hasPolygon;
  const target: TargetKind = hasPolygon ? "POLYGONE" : hasPoint ? "CERCLE" : "ZONE";
  const inCircle = activeSupportsInCircle(supports, lat, lng, radius);
  const inZone = activeSupportsInZone(supports, zoneId);
  const inPolygon = activeSupportsInPolygon(supports, polygonVertices);
  const plural = (n: number) => (n > 1 ? "s" : "");
  const impact = hasPolygon
    ? polygonVertices.length < 3
      ? "Placez au moins 3 sommets pour délimiter le polygone."
      : `${formatNumber(inPolygon)} Porteur${plural(inPolygon)} actif${plural(inPolygon)} dans le polygone`
    : hasPoint
      ? `${formatNumber(inCircle)} Porteur${plural(inCircle)} actif${plural(inCircle)} dans le cercle`
      : zoneId !== null
        ? `${formatNumber(inZone)} Porteur${plural(inZone)} actif${plural(inZone)} dans la zone ${zoneName(zoneId)}`
        : "Choisissez une cible : zone ZELQANE, cercle ou polygone.";
  const place = hasPolygon
    ? `Polygone${zoneName(zoneId) ? ` · ${zoneName(zoneId)}` : ""}`
    : hasPoint
      ? `${zoneName(zoneId) ?? "Cercle"} · ${values.radiusKm || "?"} km`
      : zoneName(zoneId);

  const setTarget = (kind: TargetKind) => {
    setValues((v) => ({
      ...v,
      latitude: kind === "CERCLE" ? v.latitude : "",
      longitude: kind === "CERCLE" ? v.longitude : "",
      polygon: kind === "POLYGONE" ? v.polygon : "",
    }));
    setErrors((e) => ({ ...e, latitude: undefined, longitude: undefined, polygon: undefined }));
  };

  const setPolygonDraft = (draft: PolygonDraft) => {
    setValues((v) => ({ ...v, polygon: serializePolygonField(draft.vertices) }));
    setErrors((e) => ({ ...e, polygon: undefined }));
  };

  const set = <K extends EmergencyField>(key: K, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const setPoint = (la: number, ln: number) => {
    setValues((v) => ({ ...v, latitude: String(la), longitude: String(ln) }));
    setErrors((e) => ({ ...e, latitude: undefined, longitude: undefined }));
  };

  const reset = () => {
    setValues(emptyEmergencyForm());
    setErrors({});
  };

  const review = (e: FormEvent) => {
    e.preventDefault();
    const parsed = emergencySchema(new Date()).safeParse(values);
    if (!parsed.success) {
      setErrors(firstIssues(parsed.error, EMERGENCY_FIELDS));
      focusFirstInvalid(formRef.current);
      return;
    }
    setErrors({});
    setSendError(null);
    setBody(parsed.data);
    setStep("confirm");
  };

  const send = async () => {
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const created = await emergencyCarteApi.create(body);
      saved.clear();
      onCreated(created);
      onClose();
    } catch (err) {
      setSending(false);
      const mapped = serverFieldErrors(err, EMERGENCY_FIELDS);
      if (hasErrorCode(err, "EMERGENCY_TARGET_REQUIRED")) {
        mapped.latitude = presentError(err).message;
      } else if (hasErrorCode(err, "INVALID_EMERGENCY_WINDOW")) {
        mapped.endTime = presentError(err).message;
      }
      if (err instanceof ApiError && Object.keys(mapped).length > 0) {
        setErrors(mapped);
        setStep("edit");
        focusFirstInvalid(formRef.current);
        return;
      }
      setSendError(presentError(err).message);
    }
  };

  const formId = `${uid}-emergency-form`;
  const titleLength = values.title.trim().length;

  if (step === "confirm" && body) {
    const level = body.urgencyLevel ?? "HIGH";
    const bodyZone = zoneName(body.zoneId ?? null);
    const circle =
      "latitude" in body && typeof body.latitude === "number" && typeof body.radiusKm === "number";
    return (
      <DialogContent
        size="lg"
        title="Confirmer la diffusion"
        description="Vérifiez le message tel qu'il apparaîtra. Pendant sa période, il passe avant toute publicité sur les Porteurs ciblés."
        preventOutsideClose={sending}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setStep("edit")}
              disabled={sending}
              iconLeft={<ArrowLeft aria-hidden="true" />}
            >
              Modifier
            </Button>
            <Button
              variant="primary"
              loading={sending}
              loadingLabel="Diffusion en cours"
              iconLeft={<Siren aria-hidden="true" />}
              onClick={() => void send()}
            >
              Diffuser le message
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5 pb-2">
          {sendError ? <Alert tone="danger">{sendError}</Alert> : null}
          <EmergencyScreenPreview
            title={body.title}
            content={body.content}
            level={level}
            place={place}
          />
          <p className="text-sm font-medium text-ink-soft">{impact}.</p>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm min-[420px]:grid-cols-2">
            <div className="min-w-0 min-[420px]:col-span-2">
              <dt className="text-[0.8125rem] font-medium text-muted">Cible</dt>
              <dd className="mt-0.5 text-ink-strong">
                {"polygon" in body && body.polygon
                  ? `Polygone de ${polygonVertices.length} sommets${bodyZone ? ` · zone ${bodyZone}` : " · zone déterminée automatiquement"}`
                  : circle
                    ? `Cercle de ${body.radiusKm} km${bodyZone ? ` · zone ${bodyZone}` : " · zone déterminée automatiquement"}`
                    : `Zone ${bodyZone ?? "—"}`}
              </dd>
            </div>
            <div>
              <dt className="text-[0.8125rem] font-medium text-muted">Début</dt>
              <dd className="mt-0.5 text-ink-strong">
                {formatDateTime(`${body.startDate}T${body.startTime ?? "00:00:00"}`)}
              </dd>
            </div>
            <div>
              <dt className="text-[0.8125rem] font-medium text-muted">Fin (arrêt automatique)</dt>
              <dd className="mt-0.5 text-ink-strong">
                {formatDateTime(`${body.endDate}T${body.endTime ?? "23:59:59"}`)}
              </dd>
            </div>
            <div>
              <dt className="text-[0.8125rem] font-medium text-muted">Urgence</dt>
              <dd className="mt-0.5">
                <StatusPill type="urgency" level={level} size="sm" />
              </dd>
            </div>
            <div>
              <dt className="text-[0.8125rem] font-medium text-muted">Priorité · durée</dt>
              <dd className="mt-0.5 text-ink-soft">
                {priorityLabel(body.priority ?? 1)} · {body.durationSeconds ?? 15} s par passage
              </dd>
            </div>
          </dl>
        </div>
      </DialogContent>
    );
  }

  return (
    <DialogContent
      size="lg"
      title="Nouveau message prioritaire"
      description="Pendant sa période, un message passe avant toute publicité sur les Porteurs ciblés, puis s'arrête automatiquement. Réservé aux informations d'intérêt général."
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

        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
          <div className="flex flex-col gap-5">
            <Field
              label="Titre affiché"
              required
              id={`${uid}-title`}
              hint={`${TITLE_RECOMMENDED} caractères au plus pour rester lisible de loin.`}
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
            </p>
            <Field
              label="Contenu affiché"
              required
              hint="Une ou deux phrases affichées sous le titre."
              error={errors.content}
            >
              <Textarea
                value={values.content}
                maxLength={CONTENT_MAX}
                rows={3}
                onChange={(e) => set("content", e.target.value)}
              />
            </Field>
          </div>
          <EmergencyScreenPreview
            title={values.title}
            content={values.content}
            level={
              (URGENCY_LEVELS as readonly string[]).includes(values.urgencyLevel)
                ? (values.urgencyLevel as UrgencyLevel)
                : "HIGH"
            }
            place={place}
          />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-3">
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
          <Field label="Priorité" required hint="1 = passe en premier" error={errors.priority}>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={PRIORITY_MAX}
              step={1}
              value={values.priority}
              onChange={(e) => set("priority", e.target.value)}
            />
          </Field>
          <Field
            label="Durée d'affichage (s)"
            required
            hint={`Entre ${DURATION_MIN} et ${DURATION_MAX} s`}
            error={errors.durationSeconds}
          >
            <Input
              type="number"
              inputMode="numeric"
              min={DURATION_MIN}
              max={DURATION_MAX}
              step={1}
              value={values.durationSeconds}
              onChange={(e) => set("durationSeconds", e.target.value)}
            />
          </Field>
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 font-label text-[0.8125rem] font-semibold text-ink-strong">
            Période de diffusion (heure de Tunis)
          </legend>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Date de début" required error={errors.startDate}>
              <Input
                type="date"
                value={values.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
            </Field>
            <Field label="Heure de début" required error={errors.startTime}>
              <Input
                type="time"
                value={values.startTime}
                onChange={(e) => set("startTime", e.target.value)}
              />
            </Field>
            <Field label="Date de fin" required error={errors.endDate}>
              <Input
                type="date"
                value={values.endDate}
                min={values.startDate || undefined}
                onChange={(e) => set("endDate", e.target.value)}
              />
            </Field>
            <Field label="Heure de fin" required error={errors.endTime}>
              <Input
                type="time"
                value={values.endTime}
                onChange={(e) => set("endTime", e.target.value)}
              />
            </Field>
          </div>
          <p className="text-[0.8125rem] text-muted">
            Le message s&apos;arrête automatiquement à la fin de la période.
          </p>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 font-label text-[0.8125rem] font-semibold text-ink-strong">
            Zone ciblée
          </legend>
          <div
            role="group"
            aria-label="Type de cible"
            className="inline-flex self-start rounded-full border border-line-strong p-0.5"
          >
            {(["ZONE", "CERCLE", "POLYGONE"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={target === kind}
                onClick={() => setTarget(kind)}
                className={cx(
                  "min-h-8 cursor-pointer rounded-full px-3 text-[0.8125rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text",
                  target === kind
                    ? "bg-blue-soft text-ink-strong"
                    : "text-muted hover:text-ink-strong",
                )}
              >
                {TARGET_LABELS[kind]}
              </button>
            ))}
          </div>
          <ZoneMapPicker
            name={values.title.trim() || "Message prioritaire"}
            latitude={lat}
            longitude={lng}
            radiusKm={radius}
            otherZones={zones}
            supports={supports}
            height="16rem"
            ariaLabel="Carte : cible du message prioritaire"
            polygonDraft={target === "POLYGONE" ? partsToDraft([[polygonVertices]]) : null}
            onPolygonDraftChange={target === "POLYGONE" ? setPolygonDraft : undefined}
            hint={
              target === "POLYGONE"
                ? "Activez « Dessiner un polygone » dans les outils de la carte, puis cliquez pour placer les sommets."
                : hasPoint
                  ? "Cliquez sur la carte pour déplacer le point, glissez la poignée pour ajuster le rayon."
                  : "Cliquez sur la carte pour placer le centre du message."
            }
            onPick={setPoint}
            onRadius={(km) =>
              set("radiusKm", String(Math.min(RADIUS_MAX_KM, Math.max(RADIUS_MIN_KM, km))))
            }
          />
          <p
            className={cx(
              "text-[0.8125rem] font-medium",
              hasPoint || zoneId !== null ? "text-ink-soft" : "text-muted",
            )}
            aria-live="polite"
          >
            {impact}
          </p>
          {target === "POLYGONE" ? (
            <div className="flex flex-col gap-2">
              <PolygonVertexEditor
                draft={partsToDraft([[polygonVertices]])}
                label="Sommets du polygone ciblé"
                onChange={setPolygonDraft}
              />
              {errors.polygon ? (
                <p className="text-[0.8125rem] font-semibold text-danger">{errors.polygon}</p>
              ) : null}
            </div>
          ) : null}
          <div
            className={cx(
              "grid grid-cols-2 gap-4 sm:grid-cols-4",
              target === "POLYGONE" && "sm:grid-cols-1",
            )}
          >
            {target === "POLYGONE" ? null : (
              <>
            <Field label="Latitude" error={errors.latitude}>
              <Input
                inputMode="decimal"
                value={values.latitude}
                placeholder="36,8008"
                onChange={(e) => set("latitude", e.target.value)}
              />
            </Field>
            <Field label="Longitude" error={errors.longitude}>
              <Input
                inputMode="decimal"
                value={values.longitude}
                placeholder="10,1815"
                onChange={(e) => set("longitude", e.target.value)}
              />
            </Field>
            <Field label="Rayon (km)" error={errors.radiusKm}>
              <Input
                type="number"
                inputMode="decimal"
                min={RADIUS_MIN_KM}
                max={RADIUS_MAX_KM}
                step={0.1}
                value={values.radiusKm}
                onChange={(e) => set("radiusKm", e.target.value)}
              />
            </Field>
              </>
            )}
            <Field label="Zone (facultatif)" hint="Sans point : zone entière" error={errors.zoneId}>
              <Select value={values.zoneId} onChange={(e) => set("zoneId", e.target.value)}>
                <option value="">Automatique</option>
                {sortedZones.map((z) => (
                  <option key={z.id} value={String(z.id)}>
                    {z.name}
                    {z.isActive ? "" : " (inactive)"}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {hasPoint || hasPolygon ? (
            <div>
              <Button
                size="sm"
                variant="ghost"
                iconLeft={<Eraser aria-hidden="true" />}
                onClick={() => setTarget("ZONE")}
              >
                {hasPolygon
                  ? "Retirer le polygone (cibler la zone entière)"
                  : "Retirer le point (cibler la zone entière)"}
              </Button>
            </div>
          ) : null}
        </fieldset>
      </form>
    </DialogContent>
  );
}
