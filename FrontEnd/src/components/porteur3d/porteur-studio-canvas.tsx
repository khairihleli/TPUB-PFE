"use client";

import {
  Compass,
  Keyboard,
  LoaderCircle,
  Moon,
  RotateCcw,
  Sun,
  TriangleAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { normalizeHeading, resolveMastHeight } from "@/components/porteur3d/porteur-dimensions";
import { ReperePanel, RepereLabels } from "@/components/porteur3d/repere-panel";
import {
  PORTEUR_TYPE_LABELS,
  bearingLong,
  bearingShort,
  formatMetresShort,
  getCameraPreset,
  getHotspots,
  presetIdForKey,
} from "@/components/porteur3d/scene-config";
import { StudioEngine } from "@/components/porteur3d/studio-engine";
import { PorteurStudioFallback } from "@/components/porteur3d/studio-fallback";
import { HotspotCard, HotspotLayer } from "@/components/porteur3d/studio-hotspots";
import type {
  CameraPresetId,
  CameraReadout,
  HotspotId,
  ModelInfo,
  PorteurStudioProps,
} from "@/components/porteur3d/types";
import { hasWebGL } from "@/components/porteur3d/webgl-support";
import { Tooltip } from "@/components/ui/tooltip";
import { cx } from "@/lib/cx";
import { useReducedMotion } from "@/lib/use-reduced-motion";

type Status = "init" | "ready" | "fallback";

const SHORTCUTS: [string, string][] = [
  ["1 – 5", "Points de vue"],
  ["← ↑ → ↓", "Tourner autour du Porteur"],
  ["+ / −", "Zoomer / dézoomer"],
  ["R", "Réinitialiser la vue"],
  ["Échap", "Fermer la fiche"],
];

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Studio 3D client component (loaded through `PorteurStudio`, next/dynamic ssr:false).
 * Controlled by props; keyboard 1–5 calls `onViewChange` (and switches locally if the parent does
 * not control the view).
 */
export function PorteurStudioCanvas({
  support,
  type,
  creative = null,
  face = "all",
  timeOfDay,
  view,
  repere = false,
  viewRequest,
  onHotspot,
  onViewChange,
  onReady,
  className,
}: PorteurStudioProps) {
  const reduce = useReducedMotion();
  const uid = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<StudioEngine | null>(null);
  const overlayEls = useRef(new Map<string, HTMLElement>());
  const lastHotspotButton = useRef<HotspotId | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => undefined);

  const [status, setStatus] = useState<Status>("init");
  const [fallbackReason, setFallbackReason] = useState<"webgl" | "context-lost" | "error">("webgl");
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [readout, setReadout] = useState<CameraReadout | null>(null);
  const [activeView, setActiveView] = useState<CameraPresetId>(view);
  const [activeHotspot, setActiveHotspot] = useState<HotspotId | null>(null);
  const [creativeError, setCreativeError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // Keyboard shortcuts anywhere inside the studio (stage, hotspot buttons, cards).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const listener = (event: KeyboardEvent) => keyHandlerRef.current(event);
    root.addEventListener("keydown", listener);
    return () => root.removeEventListener("keydown", listener);
  }, [status]);

  const heightM = resolveMastHeight(support.mastHeightM);
  const headingDeg = normalizeHeading(support.headingDeg);
  const hotspots = useMemo(
    () => getHotspots(type, support.mastHeightM),
    [type, support.mastHeightM],
  );
  const creativeUrl = creative?.url ?? null;
  const creativeKind = creative?.kind ?? null;

  // Latest callbacks without re-creating the engine.
  const callbacks = useRef({ onReady, onHotspot, onViewChange });
  useEffect(() => {
    callbacks.current = { onReady, onHotspot, onViewChange };
  }, [onReady, onHotspot, onViewChange]);

  // Initial props snapshot for the engine constructor.
  const initialRef = useRef({
    type,
    heightInput: support.mastHeightM,
    headingDeg,
    timeOfDay,
    face,
    creativeUrl,
    creativeKind,
    view,
    repere,
    reduce,
  });

  // Controlled view → local state.
  useEffect(() => {
    setActiveView(view);
  }, [view]);

  const registerOverlay = useCallback((key: string, el: HTMLElement | null) => {
    if (el) overlayEls.current.set(key, el);
    else overlayEls.current.delete(key);
    engineRef.current?.registerOverlay(key, el);
  }, []);

  // Engine lifecycle.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!hasWebGL()) {
      setFallbackReason("webgl");
      setStatus("fallback");
      return;
    }
    const init = initialRef.current;
    let engine: StudioEngine;
    try {
      engine = new StudioEngine(
        host,
        {
          type: init.type,
          mastHeightM: init.heightInput,
          headingDeg: init.headingDeg,
          timeOfDay: init.timeOfDay,
          face: init.face,
          creative:
            init.creativeUrl && init.creativeKind
              ? { url: init.creativeUrl, kind: init.creativeKind }
              : null,
          view: init.view,
          repere: init.repere,
          reducedMotion: init.reduce,
        },
        {
          onLoadingChange: setLoading,
          onModelReady: setInfo,
          onFirstFrame: () => {
            setStatus("ready");
            callbacks.current.onReady?.();
          },
          onCameraReadout: setReadout,
          onCreativeError: setCreativeError,
          onContextLost: () => {
            setFallbackReason("context-lost");
            setStatus("fallback");
          },
        },
      );
    } catch {
      setFallbackReason("error");
      setStatus("fallback");
      return;
    }
    engineRef.current = engine;
    for (const [key, el] of overlayEls.current) engine.registerOverlay(key, el);
    return () => {
      engineRef.current = null;
      engine.dispose();
    };
  }, []);

  // Props → engine.
  useEffect(() => {
    engineRef.current?.update({
      type,
      mastHeightM: support.mastHeightM,
      headingDeg,
      timeOfDay,
      face,
      creative: creativeUrl && creativeKind ? { url: creativeUrl, kind: creativeKind } : null,
      view: activeView,
      repere,
      reducedMotion: reduce,
    });
  }, [
    type,
    support.mastHeightM,
    headingDeg,
    timeOfDay,
    face,
    creativeUrl,
    creativeKind,
    activeView,
    repere,
    reduce,
  ]);

  // Reset request from outside (StudioControls « Réinitialiser la vue »).
  useEffect(() => {
    if (viewRequest === undefined) return;
    engineRef.current?.goToView(activeView);
    // Only the request counter should trigger a reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewRequest]);

  useEffect(() => {
    setCreativeError(null);
  }, [creativeUrl]);

  // Close the card when the type changes (hotspot list differs).
  useEffect(() => {
    setActiveHotspot(null);
  }, [type]);

  // Announce view / ambience changes for screen readers.
  useEffect(() => {
    const preset = getCameraPreset(activeView);
    setAnnouncement(`Point de vue : ${preset.label}. ${preset.description}`);
  }, [activeView]);
  useEffect(() => {
    setAnnouncement(timeOfDay === "nuit" ? "Ambiance de nuit." : "Ambiance de jour.");
  }, [timeOfDay]);

  const selectView = (id: CameraPresetId) => {
    if (id === activeView) engineRef.current?.goToView(id);
    setActiveView(id);
    callbacks.current.onViewChange?.(id);
  };

  const openHotspot = (id: HotspotId) => {
    if (activeHotspot === id) {
      setActiveHotspot(null);
      return;
    }
    lastHotspotButton.current = id;
    setActiveHotspot(id);
    engineRef.current?.focusHotspot(id);
    callbacks.current.onHotspot?.(id);
  };

  const closeHotspot = () => {
    const id = activeHotspot;
    setActiveHotspot(null);
    if (id) {
      const button = overlayEls.current.get(`hotspot:${id}`)?.querySelector("button");
      button?.focus({ preventScroll: true });
    }
  };

  const stepHotspot = (delta: number) => {
    const i = hotspots.findIndex((h) => h.id === activeHotspot);
    const next = hotspots[(i + delta + hotspots.length) % hotspots.length];
    if (!next) return;
    setActiveHotspot(next.id);
    engineRef.current?.focusHotspot(next.id);
    callbacks.current.onHotspot?.(next.id);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      isEditableTarget(event.target)
    )
      return;
    const engine = engineRef.current;
    const presetId = presetIdForKey(event.key);
    if (presetId) {
      event.preventDefault();
      selectView(presetId);
      return;
    }
    switch (event.key) {
      case "Escape":
        if (activeHotspot) {
          event.preventDefault();
          closeHotspot();
        }
        return;
      case "r":
      case "R":
        event.preventDefault();
        selectView(activeView);
        return;
      case "+":
      case "=":
        event.preventDefault();
        engine?.zoomBy(0.8);
        return;
      case "-":
      case "_":
        event.preventDefault();
        engine?.zoomBy(1.25);
        return;
    }
    // Arrow keys orbit only when the stage itself has focus (buttons keep native behaviour).
    if (event.target !== hostRef.current) return;
    const step = event.shiftKey ? 30 : 10;
    if (event.key === "ArrowLeft") engine?.orbitBy(-step, 0);
    else if (event.key === "ArrowRight") engine?.orbitBy(step, 0);
    else if (event.key === "ArrowUp") engine?.orbitBy(0, -step / 2);
    else if (event.key === "ArrowDown") engine?.orbitBy(0, step / 2);
    else return;
    event.preventDefault();
  };

  keyHandlerRef.current = onKeyDown;

  if (status === "fallback") {
    return (
      <PorteurStudioFallback
        type={type}
        creative={creative}
        supportName={support.name}
        mastHeightM={support.mastHeightM}
        reason={fallbackReason}
        className={className}
      />
    );
  }

  const preset = getCameraPreset(activeView);
  const activeCopy = hotspots.find((h) => h.id === activeHotspot) ?? null;
  const activeIndex = activeCopy ? hotspots.indexOf(activeCopy) : -1;
  const cardId = `${uid}-hotspot-card`;
  const descriptionId = `${uid}-description`;
  const heightLabel = formatMetresShort(heightM);
  const declaredHeight = typeof support.mastHeightM === "number";

  return (
    <div
      ref={rootRef}
      className={cx(
        "relative isolate aspect-[4/3] min-h-[320px] w-full overflow-hidden rounded-panel border border-line bg-bg text-ink sm:aspect-[16/10]",
        className,
      )}
    >
      <div
        ref={hostRef}
        role="application"
        // The 3D viewport is interactive (orbit, zoom, presets via keyboard): role=application.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        aria-roledescription="visionneuse 3D"
        aria-label={`Studio 3D — Porteur Type ${type}, ${support.name}`}
        aria-describedby={descriptionId}
        aria-keyshortcuts="1 2 3 4 5 R ArrowLeft ArrowRight ArrowUp ArrowDown"
        className="absolute inset-0 cursor-grab outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-text focus-visible:ring-inset active:cursor-grabbing"
      />

      <p id={descriptionId} className="sr-only">
        {`Maquette 3D indicative d'un Porteur Type ${type} (${PORTEUR_TYPE_LABELS[type]}), mât de ${heightLabel}${declaredHeight ? "" : " par défaut"}, écran principal orienté ${bearingLong(headingDeg)}. `}
        Faites glisser pour tourner, molette ou pincement pour zoomer. Touches 1 à 5 : points de vue
        ; flèches : tourner ; plus et moins : zoom ; R : réinitialiser. Les points d&apos;intérêt
        sont listés sous forme de boutons.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* Cinematic vignette + brand hairline */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(120%_90%_at_50%_45%,transparent_55%,color-mix(in_srgb,var(--color-bg)_70%,transparent)_100%)]"
      />
      <div
        aria-hidden="true"
        className="hairline-tricolor pointer-events-none absolute inset-x-0 top-0 z-[2] opacity-80"
      />

      {repere ? <RepereLabels info={info} registerOverlay={registerOverlay} /> : null}

      <HotspotLayer
        hotspots={hotspots}
        activeId={activeHotspot}
        cardId={cardId}
        onSelect={openHotspot}
        registerOverlay={registerOverlay}
      />

      {/* Identity chip */}
      {/* Hidden on phones: the sheet header already names the Porteur and the chip would cover the model. */}
      <div className="bg-surface-2 border border-line pointer-events-none absolute top-3 left-3 z-20 max-w-[min(20rem,calc(100%-1.5rem))] rounded-card px-3 py-2 shadow-card max-sm:hidden">
        <p className="flex items-center gap-2 font-label text-[0.75rem] font-bold text-brand-orange-text">
          <span>Type {type}</span>
          <span aria-hidden="true" className="h-3 w-px bg-line-strong" />
          <span className="inline-flex items-center gap-1 text-ink-soft">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-brand-blue-text" />
            Aperçu 3D
          </span>
        </p>
        <p className="mt-0.5 truncate font-display text-sm font-semibold text-ink-strong">
          {support.name}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.75rem] text-muted tabular">
          <span>
            Mât {heightLabel}
            {declaredHeight ? "" : " (défaut)"}
          </span>
          {type !== "D" ? (
            <span className="inline-flex items-center gap-1">
              <Compass
                aria-hidden="true"
                className="size-3"
                style={{ transform: `rotate(${headingDeg}deg)` }}
              />
              Écran {bearingShort(headingDeg)}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            {timeOfDay === "nuit" ? (
              <Moon aria-hidden="true" className="size-3" />
            ) : (
              <Sun aria-hidden="true" className="size-3" />
            )}
            {timeOfDay === "nuit" ? "Nuit" : "Jour"}
          </span>
        </p>
      </div>

      {repere ? (
        <ReperePanel
          info={info}
          readout={readout}
          heightM={heightM}
          view={activeView}
          headingDeg={headingDeg}
        />
      ) : null}

      {creativeError ? (
        <div
          role="alert"
          className="bg-surface-2 border absolute top-3 left-1/2 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 rounded-full border-warning/40 py-1.5 pr-1.5 pl-3 text-[0.75rem] text-ink shadow-card"
        >
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-warning" />
          <span>{creativeError}</span>
          <button
            type="button"
            onClick={() => setCreativeError(null)}
            className="inline-flex size-7 items-center justify-center rounded-full text-muted hover:bg-surface-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-blue-text"
          >
            <X aria-hidden="true" className="size-3.5" />
            <span className="sr-only">Masquer l&apos;alerte</span>
          </button>
        </div>
      ) : null}

      {loading || status === "init" ? (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
        >
          <span className="bg-surface-2 border border-line inline-flex items-center gap-2 rounded-full px-4 py-2 font-label text-[0.75rem] font-semibold text-ink-soft shadow-card">
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin text-brand-orange-text motion-reduce:animate-none"
            />
            Chargement du Porteur…
          </span>
        </div>
      ) : null}

      {activeCopy ? (
        <HotspotCard
          id={cardId}
          hotspot={activeCopy}
          index={activeIndex}
          total={hotspots.length}
          onClose={closeHotspot}
          onPrevious={() => stepHotspot(-1)}
          onNext={() => stepHotspot(1)}
        />
      ) : null}

      {/* View readout + tools */}
      <div
        className={cx(
          "pointer-events-none absolute inset-x-3 bottom-3 z-20 flex items-end justify-between gap-2",
          activeCopy && "max-sm:hidden",
        )}
      >
        <div className="bg-surface-2 border border-line pointer-events-auto flex min-w-0 items-center gap-2 rounded-full py-1 pr-1 pl-3 shadow-card">
          <span className="min-w-0 truncate font-label text-[0.75rem] font-semibold text-ink-strong">
            <span className="text-muted-2">Vue · </span>
            {preset.label}
          </span>
          <Tooltip
            content={
              <span className="grid gap-1">
                {SHORTCUTS.map(([keys, label]) => (
                  <span key={keys} className="flex justify-between gap-4">
                    <kbd className="font-label text-ink-strong">{keys}</kbd>
                    <span>{label}</span>
                  </span>
                ))}
              </span>
            }
          >
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-blue-text"
            >
              <Keyboard aria-hidden="true" className="size-4" />
              <span className="sr-only">Raccourcis clavier</span>
            </button>
          </Tooltip>
        </div>
        <button
          type="button"
          onClick={() => selectView(activeView)}
          className="bg-surface-2 border border-line pointer-events-auto inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 font-label text-[0.75rem] font-semibold text-ink shadow-card transition-colors hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-brand-blue-text"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          <span className="max-sm:sr-only">Réinitialiser la vue</span>
        </button>
      </div>
    </div>
  );
}
