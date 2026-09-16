"use client";

import { CalendarRange, Check, CircleAlert, ImageIcon, Lock, Plus } from "lucide-react";
import { useState } from "react";

import { AvailabilityStrip } from "@/components/campaign/availability-strip";
import { useLocalCreative } from "@/components/campaign/creative-store";
import {
  PorteurStudio,
  StudioControls,
  type CameraPresetId,
  type StudioFace,
  type TimeOfDay,
} from "@/components/porteur3d";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { supportsApi } from "@/lib/api/endpoints";
import { presentError } from "@/lib/api/errors";
import type { CampaignResponse, SupportResponse } from "@/lib/api/types";
import { formatDateRange, formatTimeRange } from "@/lib/format";
import { addDaysISO, availabilityMessage } from "@/lib/network/availability";
import {
  bookingBlockReason,
  DESIGN_INTENTION_NOTICE,
  formatMastHeight,
  INFERRED_TYPE_HINT,
  orientationLabel,
  PORTEUR_TYPES,
  resolvePorteurType,
} from "@/lib/network/porteur";
import { useResource } from "@/lib/use-resource";

export interface WizardPorteurDialogProps {
  /** null = closed. */
  support: SupportResponse | null;
  campaign: CampaignResponse;
  today: string;
  booked: boolean;
  selected: boolean;
  /** Last booking error for this Porteur (conflict or other). */
  outcomeMessage?: string | null;
  /** Campaign schedule complete and not in the past. */
  canBook: boolean;
  booking: boolean;
  onOpenChange: (open: boolean) => void;
  /** « Ajouter à la sélection » (aria-pressed). Booking happens on the step's sticky bar. */
  onToggleSelect: (support: SupportResponse) => void;
}

/**
 * Wizard step 2 « Carte »: Studio 3D of a Porteur with a read-only créneau (the campaign's dates
 * and times), its availability, and « Ajouter à la sélection ». Nothing is booked from here:
 * « Réserver N Porteurs et continuer » books the whole selection (FFA-02).
 */
export function WizardPorteurDialog(props: WizardPorteurDialogProps) {
  const { support, onOpenChange } = props;
  return (
    <Dialog open={support !== null} onOpenChange={onOpenChange}>
      {support ? <DialogBody key={support.id} {...props} support={support} /> : null}
    </Dialog>
  );
}

function DialogBody({
  support,
  campaign,
  today,
  booked,
  selected,
  outcomeMessage,
  canBook,
  booking,
  onToggleSelect,
}: WizardPorteurDialogProps & { support: SupportResponse }) {
  const { type, inferred } = resolvePorteurType(support);
  const meta = PORTEUR_TYPES[type];
  const creative = useLocalCreative(campaign.id);
  const [view, setView] = useState<CameraPresetId>("pieton");
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("jour");
  const [face, setFace] = useState<StudioFace>("all");
  const [viewRequest, setViewRequest] = useState(0);

  const start = campaign.startDate;
  const end = campaign.endDate;
  const windowEnd = end && end > addDaysISO(today, 59) ? end : addDaysISO(today, 59);
  const availability = useResource(
    type === "D" ? null : `wizard-availability:${support.id}:${today}:${windowEnd}`,
    (signal) => supportsApi.availability(support.id, { from: today, to: windowEnd }, { signal }),
  );
  const slots = availability.data ?? [];
  const conflict =
    start && end && availability.data ? availabilityMessage(slots, start, end) : null;
  const blockReason = bookingBlockReason(support);

  const disabledReason = booked
    ? "Ce Porteur est déjà bloqué pour cette campagne."
    : blockReason
      ? blockReason
      : !canBook
        ? "Complétez ou mettez à jour la période de la campagne à l'étape Détails."
        : booking
          ? "Réservation en cours."
          : availability.loading && !availability.data
            ? "Vérification de la disponibilité en cours."
            : // A selected Porteur can always be removed from the selection.
              selected
              ? null
              : conflict;

  const orientation =
    type === "D" ? "Sans écran" : (orientationLabel(support.headingDeg, type) ?? "Non déclarée");

  return (
    <DialogContent
      size="lg"
      className="sm:max-w-6xl"
      title={support.name}
      description={`${meta.label} · ${support.zoneName}`}
      preventOutsideClose={booking}
      footer={
        <>
          {booked ? (
            <span className="inline-flex min-h-touch items-center gap-1.5 text-[0.875rem] text-success">
              <Lock aria-hidden="true" className="size-4" />
              Bloqué · en attente de décision TPUB
            </span>
          ) : (
            <Button
              variant="secondary"
              disabledReason={disabledReason}
              onClick={() => onToggleSelect(support)}
              iconLeft={selected ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
              aria-pressed={selected}
            >
              Ajouter à la sélection
            </Button>
          )}
        </>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <PorteurStudio
            support={support}
            type={type}
            creative={creative ? { url: creative.url, kind: creative.kind } : null}
            face={face}
            timeOfDay={timeOfDay}
            view={view}
            viewRequest={viewRequest}
            onViewChange={setView}
          />
          <StudioControls
            type={type}
            view={view}
            onViewChange={setView}
            timeOfDay={timeOfDay}
            onTimeOfDayChange={setTimeOfDay}
            face={face}
            onFaceChange={setFace}
            onResetView={() => setViewRequest((n) => n + 1)}
          />
        </div>

        <div className="flex flex-col gap-5">
          {/* 1. Identité */}
          <section aria-labelledby="studio-identite" className="flex flex-col gap-3">
            <h3
              id="studio-identite"
              className="font-label text-[0.8125rem] font-semibold text-ink-soft"
            >
              Identité
            </h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={meta.tone}>
                Type {type} · {meta.name}
              </Badge>
              {inferred ? (
                <Badge tone="neutral" title={INFERRED_TYPE_HINT}>
                  Typologie estimée
                </Badge>
              ) : null}
              <StatusPill type="support" status={support.technicalStatus} size="sm" />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[0.8125rem]">
              <dt className="text-muted-2">Zone</dt>
              <dd className="text-ink-soft">{support.zoneName}</dd>
              <dt className="text-muted-2">Hauteur de mât</dt>
              <dd className="text-ink-soft">
                {formatMastHeight(support.mastHeightM) ?? "Non déclarée"}
              </dd>
              <dt className="text-muted-2">Orientation</dt>
              <dd className="text-ink-soft">{orientation}</dd>
              {support.address ? (
                <>
                  <dt className="text-muted-2">Adresse</dt>
                  <dd className="break-words text-ink-soft">{support.address}</dd>
                </>
              ) : null}
            </dl>
            {blockReason ? (
              <Alert tone="warning" live="none">
                {blockReason}
              </Alert>
            ) : null}
          </section>

          {/* 2. Aperçu */}
          <section aria-labelledby="studio-apercu" className="flex flex-col gap-2">
            <h3
              id="studio-apercu"
              className="font-label text-[0.8125rem] font-semibold text-ink-soft"
            >
              Aperçu
            </h3>
            <p className="flex gap-2 text-[0.8125rem] leading-snug text-muted">
              <ImageIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-brand-orange-text"
              />
              {creative
                ? `Votre visuel « ${creative.name} » est affiché sur l'écran (aperçu local, rien n'est envoyé).`
                : "Aucun visuel pour l'instant : l'écran affiche un message d'exemple. Vous pourrez prévisualiser votre visuel à l'étape Vérification."}
            </p>
          </section>

          {/* 3. Créneau (lecture seule) */}
          <section aria-labelledby="studio-creneau" className="flex flex-col gap-3">
            <h3
              id="studio-creneau"
              className="font-label text-[0.8125rem] font-semibold text-ink-soft"
            >
              Créneau de la campagne
            </h3>
            <div className="flex flex-col gap-1 rounded-card border border-line bg-overlay-inset px-3.5 py-2.5 text-[0.8125rem]">
              <span className="inline-flex items-center gap-2 text-ink-soft tabular">
                <CalendarRange aria-hidden="true" className="size-4 text-brand-orange-text" />
                {formatDateRange(campaign.startDate, campaign.endDate, "medium")}
              </span>
              <span className="pl-6 text-ink-soft tabular">
                {formatTimeRange(campaign.startTime, campaign.endTime)}
              </span>
              <span className="pl-6 text-[0.75rem] text-muted">
                Définie à l&apos;étape Détails, identique pour tous les Porteurs de la campagne.
              </span>
            </div>
            {type === "D" ? null : availability.error && !availability.data ? (
              <Alert
                tone="warning"
                live="none"
                action={
                  <Button size="sm" variant="secondary" onClick={availability.reload}>
                    Réessayer
                  </Button>
                }
              >
                Disponibilités indisponibles : {presentError(availability.error).message}
              </Alert>
            ) : availability.loading && !availability.data ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <AvailabilityStrip
                slots={slots}
                from={today}
                highlight={start && end ? { start, end } : null}
              />
            )}
            {conflict && !booked ? (
              <p className="flex gap-1.5 text-[0.8125rem] leading-snug text-warning">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {conflict}
              </p>
            ) : null}
            {outcomeMessage && !conflict ? (
              <p className="flex gap-1.5 text-[0.8125rem] leading-snug text-danger">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {outcomeMessage}
              </p>
            ) : null}
            {disabledReason && disabledReason !== conflict && !blockReason && !booked ? (
              <p className="text-[0.8125rem] text-muted">{disabledReason}</p>
            ) : null}
            <p className="text-[0.75rem] leading-relaxed text-muted">
              {selected && !booked
                ? "Sélectionné : le créneau sera bloqué quand vous cliquerez « Réserver … et continuer »."
                : "Un créneau bloqué reste retenu jusqu'à la décision de TPUB. La réservation porte sur l'écran complet du Porteur."}
            </p>
          </section>

          <p className="text-[0.75rem] leading-relaxed text-muted">{DESIGN_INTENTION_NOTICE}</p>
        </div>
      </div>
    </DialogContent>
  );
}
