"use client";

import { Check } from "lucide-react";

import { Checkbox } from "@/components/ui";
import type { TechnicalStatus } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import {
  countActiveFilters,
  displayedCountLabel,
  TECHNICAL_STATUS_CODES,
  toggleStatusFilter,
  toggleTypeFilter,
  type SupportFilters,
} from "@/lib/network/filters";
import {
  BASEMAPS,
  CARTO_API_KEY,
  LAYER_TOGGLE_LABELS,
  type BasemapId,
  type MapLayerToggles,
} from "@/lib/network/map-style";
import { PORTEUR_TYPE_CODES, PORTEUR_TYPES, technicalStatusLabel } from "@/lib/network/porteur";

import { MapPanel } from "@/components/map/map-panel";
import { STATUS_DOT, TONE_BG_SOFT, TONE_TEXT } from "@/components/map/porteur-visuals";

/** Decorative token-based swatch per basemap (no remote image). */
const BASEMAP_SWATCH: Record<BasemapId, string> = {
  sombre:
    "bg-bg [background-image:linear-gradient(135deg,var(--surface-3)_0_12%,transparent_12%_48%,var(--surface-2)_48%_52%,transparent_52%)]",
  clair:
    "bg-ink [background-image:linear-gradient(135deg,var(--muted)_0_10%,transparent_10%_48%,var(--ink-soft)_48%_53%,transparent_53%)]",
  satellite:
    "bg-surface-2 [background-image:radial-gradient(circle_at_30%_35%,var(--success)_0_18%,transparent_19%),radial-gradient(circle_at_70%_70%,var(--blue)_0_24%,transparent_25%)]",
};

export function BasemapPanel({
  value,
  onChange,
  onClose,
}: {
  value: BasemapId;
  onChange: (basemap: BasemapId) => void;
  onClose: () => void;
}) {
  return (
    <MapPanel title="Fond de carte" onClose={onClose}>
      <fieldset>
        <legend className="sr-only">Choisir le fond de carte</legend>
        <div className="grid grid-cols-3 gap-2">
          {BASEMAPS.map((b) => {
            const checked = b.id === value;
            return (
              <label
                key={b.id}
                className={cx(
                  "group/bm relative flex cursor-pointer flex-col gap-1.5 rounded-card border p-1.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-blue-text",
                  checked
                    ? "border-brand-blue-text bg-brand-blue/20"
                    : "border-line hover:border-line-strong",
                )}
              >
                <input
                  type="radio"
                  name="tpub-map-basemap"
                  value={b.id}
                  checked={checked}
                  onChange={() => onChange(b.id)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={cx(
                    "block aspect-[4/3] rounded-[10px] border border-line",
                    BASEMAP_SWATCH[b.id],
                  )}
                />
                <span className="flex items-center justify-between gap-1 px-0.5 font-label text-xs font-semibold text-ink">
                  {b.label}
                  {checked ? (
                    <Check aria-hidden="true" className="size-3.5 text-brand-blue-text" />
                  ) : null}
                </span>
                <span className="sr-only">{b.description}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <p className="mt-3 text-[0.75rem] leading-snug text-muted-2">
        {CARTO_API_KEY
          ? "Fonds © OpenStreetMap contributors, © CARTO, imagerie © Esri."
          : "Fonds © Esri, HERE, Garmin, © OpenStreetMap contributors, imagerie © Esri."}{" "}
        Les zones et Porteurs TPUB restent affichés même si le fond ne se charge pas.
      </p>
    </MapPanel>
  );
}

export function LayersPanel({
  value,
  onToggle,
  clusterPorteurs,
  onClusterPorteursChange,
  onClose,
}: {
  value: MapLayerToggles;
  onToggle: (layer: keyof MapLayerToggles) => void;
  /** « Regrouper les Porteurs proches » (opt-in). Hidden when no handler is given. */
  clusterPorteurs?: boolean;
  onClusterPorteursChange?: (value: boolean) => void;
  onClose: () => void;
}) {
  const keys = Object.keys(LAYER_TOGGLE_LABELS) as (keyof MapLayerToggles)[];
  return (
    <MapPanel
      title="Couches"
      description="Affichez ou masquez les éléments de la carte."
      onClose={onClose}
    >
      <div className="flex flex-col">
        {keys.map((key) => (
          <Checkbox
            key={key}
            label={LAYER_TOGGLE_LABELS[key]}
            checked={value[key]}
            onChange={() => onToggle(key)}
          />
        ))}
      </div>
      {onClusterPorteursChange ? (
        <div className="mt-2 border-t border-line pt-1">
          <Checkbox
            label="Regrouper les Porteurs proches"
            description="Désactivé par défaut : chaque Porteur est affiché à sa position exacte, les Porteurs qui se chevauchent sont écartés avec un trait vers leur position."
            checked={clusterPorteurs === true}
            disabled={!value.porteurs}
            onChange={(e) => onClusterPorteursChange(e.target.checked)}
          />
        </div>
      ) : null}
    </MapPanel>
  );
}

export function FiltersPanel({
  value,
  onChange,
  onReset,
  onClose,
  displayedCount,
  totalCount,
  counts,
}: {
  value: SupportFilters;
  onChange: (filters: SupportFilters) => void;
  onReset: () => void;
  onClose: () => void;
  displayedCount: number;
  /** Porteurs in the dataset (« n Porteurs affichés sur total »). */
  totalCount?: number;
  /** Counts per type and status over the whole dataset (for chips). */
  counts?: { types: Record<string, number>; statuses: Record<string, number> };
}) {
  const active = countActiveFilters(value);
  return (
    <MapPanel
      title="Filtres"
      description={
        <span aria-live="polite">{displayedCountLabel(displayedCount, totalCount)}</span>
      }
      onClose={onClose}
      placement="left"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted">
            {active === 0
              ? "Aucun filtre actif"
              : active === 1
                ? "1 filtre actif"
                : `${active} filtres actifs`}
          </span>
          <button
            type="button"
            onClick={onReset}
            disabled={active === 0}
            className="min-h-9 cursor-pointer rounded-control px-3 font-label text-xs font-semibold text-brand-blue-text hover:bg-overlay-hover focus-visible:outline-2 focus-visible:outline-brand-blue-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            Réinitialiser
          </button>
        </div>
      }
    >
      <fieldset>
        <legend className="mb-2 font-label text-[0.75rem] font-semibold text-muted-2">
          Type de Porteur
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {PORTEUR_TYPE_CODES.map((code) => {
            const meta = PORTEUR_TYPES[code];
            const pressed = value.types.includes(code);
            return (
              <button
                key={code}
                type="button"
                aria-pressed={pressed}
                onClick={() => onChange(toggleTypeFilter(value, code))}
                className={cx(
                  "flex min-h-touch cursor-pointer items-center gap-2 rounded-control border px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text",
                  pressed
                    ? "border-brand-blue-text bg-brand-blue/25"
                    : "border-line hover:border-line-strong",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    "grid size-7 shrink-0 place-items-center rounded-full border font-display text-xs font-bold",
                    TONE_BG_SOFT[meta.tone],
                    TONE_TEXT[meta.tone],
                  )}
                >
                  {code}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-label text-xs font-semibold text-ink">
                    {meta.name}
                  </span>
                  {counts ? (
                    <span className="block text-[0.75rem] text-muted-2 tabular">
                      {counts.types[code] ?? 0}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="mb-1 font-label text-[0.75rem] font-semibold text-muted-2">
          État technique
        </legend>
        <div className="flex flex-col">
          {TECHNICAL_STATUS_CODES.map((status: TechnicalStatus) => (
            <Checkbox
              key={status}
              checked={value.statuses.includes(status)}
              onChange={() => onChange(toggleStatusFilter(value, status))}
              label={
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cx("size-2 rounded-full", STATUS_DOT[status])}
                  />
                  {technicalStatusLabel(status)}
                  {counts ? (
                    <span className="text-muted-2 tabular">({counts.statuses[status] ?? 0})</span>
                  ) : null}
                </span>
              }
            />
          ))}
        </div>
      </fieldset>

      <div className="mt-2 border-t border-line pt-1">
        <Checkbox
          label="Réservables uniquement"
          description="Porteurs actifs équipés d'un écran (hors type D)."
          checked={value.bookableOnly}
          onChange={(e) => onChange({ ...value, bookableOnly: e.target.checked })}
        />
      </div>
    </MapPanel>
  );
}
