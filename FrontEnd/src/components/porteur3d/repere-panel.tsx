"use client";

import { Check, ClipboardCopy, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  buildPresetSnippet,
  describeSource,
  formatDims,
  formatTriangles,
  formatVec,
} from "@/components/porteur3d/repere-format";
import type {
  CameraPresetId,
  CameraReadout,
  HotspotId,
  ModelInfo,
} from "@/components/porteur3d/types";
import { cx } from "@/lib/cx";

export interface ReperePanelProps {
  info: ModelInfo | null;
  readout: CameraReadout | null;
  heightM: number;
  view: CameraPresetId;
  headingDeg: number;
}

/** Calibration readouts (repère mode): model source, triangles, bbox, anchors, live camera, copy. */
export function ReperePanel({ info, readout, heightM, view, headingDeg }: ReperePanelProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  const [snippet, setSnippet] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    if (!readout) return;
    const text = buildPresetSnippet(view, readout.localPosition, readout.localTarget, heightM);
    setSnippet(text);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopyState((s) => (s === "copied" ? "idle" : s)), 2400);
  };

  return (
    <section
      aria-label="Repère de calibration"
      className="bg-surface-2 absolute top-3 right-3 z-20 max-h-[calc(100%-1.5rem)] w-[min(20rem,calc(100%-1.5rem))] overflow-y-auto rounded-card border border-line-strong p-3 font-sans text-[0.75rem] text-ink-soft shadow-lift"
    >
      <p className="font-label text-[0.75rem] font-bold text-brand-orange-text">
        Repère · calibration
      </p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 tabular">
        <dt className="text-muted">Source</dt>
        <dd className="min-w-0 break-words text-ink">
          {info ? describeSource(info.source) : "Chargement…"}
        </dd>
        <dt className="text-muted">Géométrie</dt>
        <dd className="text-ink">{info ? formatTriangles(info.triangles) : "—"}</dd>
        <dt className="text-muted">Boîte</dt>
        <dd className="text-ink">{info ? formatDims(info.size) : "—"}</dd>
        <dt className="text-muted">Orientation</dt>
        <dd className="text-ink">{`${Math.round(headingDeg)}° (face principale vers −Z local)`}</dd>
      </dl>

      {info && Object.keys(info.anchors).length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer font-label font-semibold text-ink">
            Ancres (repère local)
          </summary>
          <ul className="mt-1 grid gap-0.5 tabular">
            {(Object.entries(info.anchors) as [HotspotId, [number, number, number]][]).map(
              ([id, p]) => (
                <li key={id} className="flex justify-between gap-2">
                  <span className="text-muted">{id}</span>
                  <span className="text-ink">{formatVec(p)}</span>
                </li>
              ),
            )}
          </ul>
        </details>
      ) : null}

      <div className="mt-2 border-t border-line pt-2">
        <p className="font-label font-semibold text-ink">Caméra (repère local)</p>
        <p className="mt-0.5 tabular">
          <span className="text-muted">Position </span>
          <span className="text-ink">{readout ? formatVec(readout.localPosition) : "—"}</span>
        </p>
        <p className="tabular">
          <span className="text-muted">Cible </span>
          <span className="text-ink">{readout ? formatVec(readout.localTarget) : "—"}</span>
        </p>
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!readout}
          className={cx(
            "mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-full border border-blue-line bg-blue-soft px-3 font-label text-[0.75rem] font-semibold text-brand-blue-text transition-colors hover:bg-brand-blue hover:text-on-brand focus-visible:outline-2 focus-visible:outline-brand-blue-text disabled:opacity-50",
          )}
        >
          {copyState === "copied" ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <ClipboardCopy aria-hidden="true" className="size-4" />
          )}
          Copier la vue
        </button>
        <p role="status" className="mt-1 min-h-4 text-[0.75rem] text-muted">
          {copyState === "copied"
            ? "Preset copié : collez-le dans CAMERA_PRESETS (scene-config.ts)."
            : copyState === "manual"
              ? "Copie automatique refusée : sélectionnez le texte ci-dessous."
              : ""}
        </p>
        {copyState === "manual" ? (
          <textarea
            readOnly
            aria-label="Preset de caméra au format JSON"
            value={snippet}
            rows={8}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-1 w-full rounded-[10px] border border-line bg-bg p-2 font-mono text-[0.75rem] text-ink"
          />
        ) : null}
      </div>

      {info && info.warnings.length > 0 ? (
        <ul className="mt-2 grid gap-1 border-t border-line pt-2">
          {info.warnings.map((w) => (
            <li key={w} className="flex gap-1.5 text-warning">
              <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Axis / bbox / anchor labels positioned by the engine (`axis:x`, `bbox:top`, `anchor:<id>`). */
export function RepereLabels({
  info,
  registerOverlay,
}: {
  info: ModelInfo | null;
  registerOverlay: (key: string, el: HTMLElement | null) => void;
}) {
  const axis: { key: string; label: string; className: string }[] = [
    { key: "axis:x", label: "X", className: "text-brand-red-text" },
    { key: "axis:y", label: "Y", className: "text-success" },
    { key: "axis:z", label: "Z", className: "text-brand-blue-text" },
    { key: "axis:front", label: "−Z · face principale", className: "text-brand-blue-text" },
  ];
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[5] font-label text-[0.75rem] font-bold"
    >
      {axis.map((a) => (
        <span
          key={a.key}
          ref={(el) => registerOverlay(a.key, el)}
          data-visible="false"
          className={cx("absolute top-0 left-0 data-[visible=false]:hidden", a.className)}
        >
          <span className="block -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg/80 px-1.5 py-0.5 whitespace-nowrap">
            {a.label}
          </span>
        </span>
      ))}
      {info ? (
        <span
          ref={(el) => registerOverlay("bbox:top", el)}
          data-visible="false"
          className="absolute top-0 left-0 text-brand-orange-text data-[visible=false]:hidden"
        >
          <span className="block -translate-y-full rounded-full bg-bg/80 px-1.5 py-0.5 whitespace-nowrap tabular">
            {formatDims(info.size)}
          </span>
        </span>
      ) : null}
      {info
        ? (Object.entries(info.anchors) as [HotspotId, [number, number, number]][]).map(
            ([id, p]) => (
              <span
                key={id}
                ref={(el) => registerOverlay(`anchor:${id}`, el)}
                data-visible="false"
                className="absolute top-0 left-0 font-sans font-medium text-ink data-[visible=false]:hidden"
              >
                <span className="block translate-x-3 translate-y-2 rounded-[6px] bg-bg/80 px-1.5 py-0.5 text-[0.75rem] whitespace-nowrap tabular">
                  {id} · {formatVec(p)}
                </span>
              </span>
            ),
          )
        : null}
    </div>
  );
}
