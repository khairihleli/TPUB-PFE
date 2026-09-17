"use client";

import { Plus, Trash2 } from "lucide-react";
import { useId } from "react";

import { cx } from "@/lib/cx";
import { roundCoord, type LngLat } from "@/lib/network/geo";
import {
  addDraftVertex,
  closeDraft,
  draftStatus,
  edgeMidpoint,
  insertDraftVertex,
  moveDraftVertex,
  removeDraftVertex,
  type PolygonDraft,
} from "@/lib/network/overlays";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

/** Point used when the list is empty and « Ajouter un sommet » is pressed (centre of Tunis). */
const DEFAULT_VERTEX: LngLat = { lng: 10.18, lat: 36.8 };

/**
 * Keyboard and screen-reader equivalent of drawing a polygon on the map (docs/round2-contract.md
 * §4.8): every vertex is a latitude/longitude pair that can be edited, inserted or removed, and the
 * ring can be closed. It edits the same draft as the map.
 */
export function PolygonVertexEditor({
  draft,
  onChange,
  label = "Sommets du polygone",
  className,
  disabled = false,
}: {
  draft: PolygonDraft;
  onChange: (draft: PolygonDraft) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const status = draftStatus(draft);

  const update = (index: number, patch: Partial<LngLat>) => {
    const vertex = draft.vertices[index];
    if (!vertex) return;
    onChange(moveDraftVertex(draft, index, { ...vertex, ...patch }));
  };

  const addAfter = (index: number) => {
    const midpoint = edgeMidpoint(draft, index);
    const vertex = draft.vertices[index];
    const next =
      midpoint ??
      (vertex ? { lng: roundCoord(vertex.lng + 0.005), lat: roundCoord(vertex.lat + 0.005) } : null);
    onChange(next ? insertDraftVertex(draft, index, next) : addDraftVertex(draft, DEFAULT_VERTEX));
  };

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={`${id}-label`} className="font-label text-[0.8125rem] font-semibold text-ink-strong">
          {label}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() =>
              draft.vertices.length === 0
                ? onChange(addDraftVertex(draft, DEFAULT_VERTEX))
                : addAfter(draft.vertices.length - 1)
            }
          >
            <Plus aria-hidden="true" className="size-4" />
            Ajouter un sommet
          </Button>
          {!draft.closed && draft.vertices.length >= 3 ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => onChange(closeDraft(draft))}
            >
              Fermer le polygone
            </Button>
          ) : null}
        </div>
      </div>

      {draft.vertices.length === 0 ? (
        <p className="text-[0.8125rem] text-muted">
          Aucun sommet : dessinez le polygone sur la carte ou ajoutez des sommets par leurs
          coordonnées.
        </p>
      ) : (
        <ul aria-labelledby={`${id}-label`} className="flex flex-col gap-2">
          {draft.vertices.map((vertex, index) => (
            <li
              key={`${index}-${vertex.lat}-${vertex.lng}`}
              className="flex flex-wrap items-end gap-2 rounded-control border border-line bg-surface px-2 py-2"
            >
              <span className="min-w-14 font-label text-[0.75rem] font-semibold text-muted-2">
                Sommet {index + 1}
              </span>
              <label className="flex flex-col gap-1 text-[0.75rem] text-muted">
                <span>Latitude</span>
                <Input
                  type="number"
                  step="0.000001"
                  min={-90}
                  max={90}
                  disabled={disabled}
                  value={vertex.lat}
                  aria-label={`Latitude du sommet ${index + 1}`}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (Number.isFinite(value)) update(index, { lat: roundCoord(value) });
                  }}
                  className="w-32"
                />
              </label>
              <label className="flex flex-col gap-1 text-[0.75rem] text-muted">
                <span>Longitude</span>
                <Input
                  type="number"
                  step="0.000001"
                  min={-180}
                  max={180}
                  disabled={disabled}
                  value={vertex.lng}
                  aria-label={`Longitude du sommet ${index + 1}`}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (Number.isFinite(value)) update(index, { lng: roundCoord(value) });
                  }}
                  className="w-32"
                />
              </label>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  aria-label={`Ajouter un sommet après le sommet ${index + 1}`}
                  onClick={() => addAfter(index)}
                >
                  <Plus aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  aria-label={`Supprimer le sommet ${index + 1}`}
                  onClick={() => onChange(removeDraftVertex(draft, index))}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p
        aria-live="polite"
        className={cx(
          "text-[0.8125rem]",
          status.state === "invalid" ? "font-semibold text-warning" : "text-muted",
        )}
      >
        {status.message}
      </p>
    </div>
  );
}
