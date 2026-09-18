"use client";

import { Box, Check, Plus } from "lucide-react";

import { StatusPill } from "@/components/ui";
import type { SupportResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import {
  bookingBlockReason,
  formatMastHeight,
  INFERRED_TYPE_HINT,
  orientationLabel,
  PORTEUR_TYPES,
  resolvePorteurType,
} from "@/lib/network/porteur";

import { PorteurCoordinates } from "@/components/map/porteur-coordinates";
import { PORTEUR_ICONS, TONE_BG_SOFT, TONE_TEXT } from "@/components/map/porteur-visuals";

export interface PorteurCardProps {
  support: SupportResponse;
  selected?: boolean;
  /** Show « + Ajouter à la sélection » / « Retirer ». */
  canSelect?: boolean;
  onToggleSelect?: () => void;
  onOpen?: () => void;
  /** « Ouvrir le Studio 3D » label override (admin: « Voir le Porteur »). */
  openLabel?: string;
  className?: string;
  id?: string;
}

/** Compact Porteur summary used on hover/focus of a marker and in lists. */
export function PorteurCard({
  support,
  selected = false,
  canSelect = false,
  onToggleSelect,
  onOpen,
  openLabel = "Ouvrir le Studio 3D",
  className,
  id,
}: PorteurCardProps) {
  const { type, inferred } = resolvePorteurType(support);
  const meta = PORTEUR_TYPES[type];
  const Icon = PORTEUR_ICONS[meta.icon];
  const blockReason = bookingBlockReason(support);
  const height = formatMastHeight(support.mastHeightM);
  const orientation = orientationLabel(support.headingDeg, type);

  return (
    <div
      id={id}
      role="group"
      aria-label={`Aperçu : ${support.name}`}
      className={cx(
        "zelqane-map-surface w-[17rem] animate-fade-in rounded-card p-3.5 text-left text-ink",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cx(
            "grid size-9 shrink-0 place-items-center rounded-[10px] border",
            TONE_BG_SOFT[meta.tone],
            TONE_TEXT[meta.tone],
          )}
        >
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[0.9375rem] leading-snug font-semibold text-ink-strong">
            {support.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {support.address || support.zoneName}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span
          className={cx(
            "inline-flex items-center rounded-full border px-2 py-0.5 font-label text-[0.75rem] font-semibold",
            TONE_BG_SOFT[meta.tone],
            TONE_TEXT[meta.tone],
          )}
        >
          Type {type} · {meta.name}
        </span>
        {inferred ? (
          <span
            title={INFERRED_TYPE_HINT}
            className="inline-flex items-center rounded-full border border-dashed border-line-strong px-2 py-0.5 font-label text-[0.75rem] text-muted"
          >
            Typologie estimée
          </span>
        ) : null}
        <StatusPill type="support" status={support.technicalStatus} size="sm" />
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-2">Zone</dt>
        <dd className="truncate text-ink-soft">{support.zoneName}</dd>
        <dt className="text-muted-2">Hauteur</dt>
        <dd className="text-ink-soft">{height ?? "Non déclarée"}</dd>
        <dt className="text-muted-2">Orientation</dt>
        <dd className="text-ink-soft">
          {type === "D" ? "Sans écran" : (orientation ?? "Non déclarée")}
        </dd>
      </dl>

      <PorteurCoordinates
        variant="card"
        latitude={support.latitude}
        longitude={support.longitude}
        name={support.name}
        className="mt-2.5 border-t border-line pt-2.5"
      />

      {blockReason ? (
        <p className="mt-2.5 text-[0.75rem] leading-snug text-warning">{blockReason}</p>
      ) : null}

      {onOpen || (canSelect && onToggleSelect) ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
          {onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-control bg-brand-blue px-3 font-label text-xs font-semibold text-on-brand transition-colors hover:bg-brand-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text"
            >
              <Box aria-hidden="true" className="size-3.5" />
              {openLabel}
            </button>
          ) : null}
          {canSelect && onToggleSelect ? (
            <button
              type="button"
              onClick={onToggleSelect}
              disabled={!selected && blockReason !== null}
              aria-pressed={selected}
              className={cx(
                "inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-control border px-3 font-label text-xs font-semibold text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "border-brand-blue-text/60 bg-blue-soft text-ink-strong"
                  : "border-line-strong bg-surface-2 hover:bg-surface-3",
              )}
            >
              {/* Stable label, state carried by aria-pressed and the check (FFA-22). */}
              {selected ? (
                <Check aria-hidden="true" className="size-3.5 text-brand-blue-text" />
              ) : (
                <Plus aria-hidden="true" className="size-3.5" />
              )}
              Ajouter à la sélection
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
