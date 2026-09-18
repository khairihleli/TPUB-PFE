"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";

import { formatCoordinates } from "@/components/admin/network-schemas";
import {
  parseRepereParam,
  PorteurStudio,
  StudioControls,
  type CameraPresetId,
  type StudioFace,
  type TimeOfDay,
} from "@/components/porteur3d";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { StatusPill } from "@/components/ui/status-pill";
import type { SupportResponse } from "@/lib/api/types";
import { SUPPORT_TYPE_LABEL } from "@/lib/campaign-status";
import {
  DESIGN_INTENTION_NOTICE,
  formatMastHeight,
  INFERRED_TYPE_HINT,
  orientationLabel,
  PORTEUR_TYPES,
  resolvePorteurType,
} from "@/lib/network/porteur";

function initialRepere(): boolean {
  if (typeof window === "undefined") return false;
  return parseRepereParam(new URLSearchParams(window.location.search).get("repere"));
}

/**
 * « Voir en 3D » for staff: read-only Studio 3D of a Porteur with the calibration « Repère »
 * toggle (also enabled by `?repere=1`). No booking here.
 */
export function Porteur3dDialog({
  support,
  onOpenChange,
  onEdit,
}: {
  /** null = closed. */
  support: SupportResponse | null;
  onOpenChange: (open: boolean) => void;
  /** Shown for ADMINISTRATEUR only. */
  onEdit?: (support: SupportResponse) => void;
}) {
  return (
    <Dialog open={support !== null} onOpenChange={onOpenChange}>
      {support ? <Porteur3dContent key={support.id} support={support} onEdit={onEdit} /> : null}
    </Dialog>
  );
}

function Porteur3dContent({
  support,
  onEdit,
}: {
  support: SupportResponse;
  onEdit?: (support: SupportResponse) => void;
}) {
  const { type, inferred } = resolvePorteurType(support);
  const meta = PORTEUR_TYPES[type];
  const [view, setView] = useState<CameraPresetId>("orbite");
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("jour");
  const [face, setFace] = useState<StudioFace>("all");
  const [repere, setRepere] = useState(initialRepere);
  const [viewRequest, setViewRequest] = useState(0);

  const facts: { label: string; value: string }[] = [
    { label: "Zone", value: support.zoneName },
    { label: "Type de support", value: SUPPORT_TYPE_LABEL[support.supportType] },
    {
      label: "Hauteur de mât",
      value: formatMastHeight(support.mastHeightM) ?? "Non déclarée (20 m affichés)",
    },
    {
      label: "Orientation",
      value:
        type === "D"
          ? "Sans écran"
          : (orientationLabel(support.headingDeg, type) ?? "Non déclarée"),
    },
    { label: "Adresse", value: support.address || "Non renseignée" },
    { label: "Position", value: formatCoordinates(support.latitude, support.longitude) },
  ];

  return (
    <DialogContent
      size="lg"
      className="sm:max-w-6xl"
      title={`Studio 3D — ${support.name}`}
      description="Aperçu en lecture seule. Le mode « Repère » affiche axes, grille, dimensions et points d'ancrage pour caler un futur modèle GLB."
      footer={
        onEdit ? (
          <Button
            variant="primary"
            iconLeft={<Pencil aria-hidden="true" />}
            onClick={() => onEdit(support)}
          >
            Modifier le Porteur
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <PorteurStudio
            support={support}
            type={type}
            face={face}
            timeOfDay={timeOfDay}
            view={view}
            repere={repere}
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
            repere={repere}
            onRepereChange={setRepere}
            onResetView={() => setViewRequest((n) => n + 1)}
          />
        </div>
        <aside aria-label="Fiche du Porteur" className="flex flex-col gap-4">
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
          <p className="text-[0.8125rem] leading-relaxed text-muted">{meta.description}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[0.8125rem]">
            {facts.map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-muted-2">{f.label}</dt>
                <dd className="min-w-0 break-words text-ink-soft">{f.value}</dd>
              </div>
            ))}
          </dl>
          <p className="rounded-control border border-line bg-overlay-inset px-3 py-2 text-xs leading-relaxed text-muted-2">
            {DESIGN_INTENTION_NOTICE}
          </p>
        </aside>
      </div>
    </DialogContent>
  );
}
