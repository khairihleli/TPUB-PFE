"use client";

import { Crosshair, Trash2, Undo2 } from "lucide-react";
import { useId } from "react";

import type { SupportResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { formatDistance, formatRadiusKm, polylineLength, type LngLat } from "@/lib/network/geo";
import { isBookable } from "@/lib/network/porteur";
import { supportsWithinRadius } from "@/lib/network/selection";

import {
  CATCHMENT_MAX_KM,
  CATCHMENT_MIN_KM,
  CATCHMENT_PRESETS_KM,
} from "@/components/map/map-ui-state";
import { MapPanel } from "@/components/map/map-panel";
import { PorteurList } from "@/components/map/porteur-list";

const SMALL_BTN =
  "inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-line-strong bg-surface-2 px-3 font-label text-xs font-semibold text-ink transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-3.5";

const SMALL_BTN_PRIMARY = SMALL_BTN.replace(
  "border-line-strong bg-surface-2 px-3 font-label text-xs font-semibold text-ink transition-colors hover:bg-surface-3",
  "border-brand-blue bg-brand-blue px-3 font-label text-xs font-semibold text-on-brand transition-colors hover:bg-brand-blue-600",
);

export interface MeasurePanelProps {
  points: LngLat[];
  finished: boolean;
  onAddCenter: () => void;
  onUndo: () => void;
  onClear: () => void;
  onFinish: () => void;
  onClose: () => void;
  /** False in the SVG fallback (no free camera): hides « point au centre ». */
  canAddCenter?: boolean;
}

export function MeasurePanel({
  points,
  finished,
  onAddCenter,
  onUndo,
  onClear,
  onFinish,
  onClose,
  canAddCenter = true,
}: MeasurePanelProps) {
  const total = polylineLength(points);
  const segments = Math.max(0, points.length - 1);
  return (
    <MapPanel
      title="Mesurer une distance"
      placement="bottom-left"
      focusOnOpen={false}
      onClose={onClose}
      description={
        finished
          ? "Mesure terminée. Cliquez sur la carte pour recommencer."
          : "Cliquez sur la carte pour ajouter des points. Échap ou double-clic pour terminer."
      }
    >
      <div className="flex items-end justify-between gap-3 rounded-card border border-line bg-bg/40 px-3.5 py-3">
        <div>
          <p className="font-label text-[0.75rem] text-muted-2">Distance totale</p>
          <p
            className="font-display text-2xl font-semibold text-ink-strong tabular"
            aria-live="polite"
          >
            {points.length < 2 ? "—" : formatDistance(total)}
          </p>
        </div>
        <p className="text-right text-xs text-muted tabular">
          {points.length === 0
            ? "Aucun point"
            : `${points.length} point${points.length > 1 ? "s" : ""} · ${segments} segment${segments > 1 ? "s" : ""}`}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {canAddCenter ? (
          <button type="button" className={SMALL_BTN} onClick={onAddCenter}>
            <Crosshair aria-hidden="true" />
            Point au centre
          </button>
        ) : null}
        <button type="button" className={SMALL_BTN} onClick={onUndo} disabled={points.length === 0}>
          <Undo2 aria-hidden="true" />
          Annuler le dernier
        </button>
        <button
          type="button"
          className={SMALL_BTN}
          onClick={onClear}
          disabled={points.length === 0}
        >
          <Trash2 aria-hidden="true" />
          Effacer
        </button>
        {!finished && points.length >= 2 ? (
          <button type="button" className={SMALL_BTN_PRIMARY} onClick={onFinish}>
            Terminer
          </button>
        ) : null}
      </div>
    </MapPanel>
  );
}

export interface CatchmentPanelProps {
  center: LngLat | null;
  radiusKm: number;
  supports: SupportResponse[];
  selectedIds: readonly number[];
  onRadiusChange: (km: number) => void;
  onUseCenter: () => void;
  onSelectBookable?: () => void;
  onLocate?: (supportId: number) => void;
  onOpen?: (supportId: number) => void;
  onClose: () => void;
  canUseCenter?: boolean;
}

export function CatchmentPanel({
  center,
  radiusKm,
  supports,
  selectedIds,
  onRadiusChange,
  onUseCenter,
  onSelectBookable,
  onLocate,
  onOpen,
  onClose,
  canUseCenter = true,
}: CatchmentPanelProps) {
  const sliderId = useId();
  const within = center ? supportsWithinRadius(center, radiusKm, supports) : [];
  const bookable = within.filter((d) => isBookable(d.support));
  const bookableNotSelected = bookable.filter((d) => !selectedIds.includes(d.support.id));

  return (
    <MapPanel
      title="Zone de chalandise"
      placement="bottom-left"
      focusOnOpen={false}
      onClose={onClose}
      description={
        center
          ? "Déplacez le centre ou ajustez le rayon."
          : "Cliquez sur la carte pour placer le centre de la zone de chalandise."
      }
      footer={
        onSelectBookable ? (
          <button
            type="button"
            onClick={onSelectBookable}
            disabled={bookableNotSelected.length === 0}
            className="inline-flex min-h-touch w-full cursor-pointer items-center justify-center rounded-control bg-brand-blue px-4 font-label text-[0.8125rem] font-semibold text-on-brand shadow-blue transition-colors hover:bg-brand-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text disabled:cursor-not-allowed disabled:opacity-45"
          >
            Sélectionner les Porteurs réservables dans ce rayon
            {bookableNotSelected.length > 0 ? ` (${bookableNotSelected.length})` : ""}
          </button>
        ) : undefined
      }
    >
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={sliderId} className="font-label text-xs font-semibold text-ink">
          Rayon
        </label>
        <span className="font-display text-lg font-semibold text-ink-strong tabular">
          {formatRadiusKm(radiusKm)}
        </span>
      </div>
      <input
        id={sliderId}
        type="range"
        min={CATCHMENT_MIN_KM}
        max={CATCHMENT_MAX_KM}
        step={0.1}
        value={radiusKm}
        aria-valuetext={formatRadiusKm(radiusKm)}
        onChange={(e) => onRadiusChange(Number(e.target.value))}
        className="mt-1 h-2 w-full cursor-pointer accent-brand-blue-text"
      />
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Rayons prédéfinis">
        {CATCHMENT_PRESETS_KM.map((km) => (
          <button
            key={km}
            type="button"
            aria-pressed={radiusKm === km}
            onClick={() => onRadiusChange(km)}
            className={cx(
              "min-h-8 cursor-pointer rounded-full border px-2.5 font-label text-[0.75rem] font-semibold tabular transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text",
              radiusKm === km
                ? "border-brand-blue-text bg-brand-blue/40 text-ink-strong"
                : "border-line-strong text-ink-soft hover:bg-overlay-hover",
            )}
          >
            {formatRadiusKm(km)}
          </button>
        ))}
      </div>
      {canUseCenter ? (
        <button type="button" className={cx(SMALL_BTN, "mt-3")} onClick={onUseCenter}>
          <Crosshair aria-hidden="true" />
          Centrer sur la vue actuelle
        </button>
      ) : null}

      {center ? (
        <div className="mt-4">
          <p className="mb-2 text-xs text-muted" aria-live="polite">
            {within.length === 0
              ? "Aucun Porteur dans ce rayon."
              : `${within.length} Porteur${within.length > 1 ? "s" : ""} dans ce rayon, dont ${bookable.length} réservable${bookable.length > 1 ? "s" : ""}.`}
          </p>
          <PorteurList
            dense
            label="Porteurs dans la zone de chalandise"
            items={within.map((d) => ({ support: d.support, distanceM: d.distanceM }))}
            selectedIds={selectedIds}
            onLocate={onLocate}
            onOpen={onOpen}
            emptyText="Agrandissez le rayon pour inclure des Porteurs."
          />
        </div>
      ) : null}
    </MapPanel>
  );
}
