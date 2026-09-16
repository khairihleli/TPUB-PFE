"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

import { DESIGN_INTENTION_MENTION, type HotspotCopy } from "@/components/porteur3d/scene-config";
import type { HotspotId } from "@/components/porteur3d/types";
import { cx } from "@/lib/cx";

export interface HotspotLayerProps {
  hotspots: HotspotCopy[];
  activeId: HotspotId | null;
  cardId: string;
  onSelect: (id: HotspotId) => void;
  /** Ref callback per overlay key (`hotspot:<id>`), positioned by the engine. */
  registerOverlay: (key: string, el: HTMLElement | null) => void;
}

/**
 * Accessible DOM buttons over the canvas. The engine writes `transform` + data attributes
 * (`data-visible`, `data-hidden-side`) every frame; points behind the mast stay focusable but dimmed.
 */
export function HotspotLayer({
  hotspots,
  activeId,
  cardId,
  onSelect,
  registerOverlay,
}: HotspotLayerProps) {
  return (
    <ul
      aria-label="Points d'intérêt du Porteur"
      className="pointer-events-none absolute inset-0 z-10 m-0 list-none p-0"
    >
      {hotspots.map((h, i) => {
        const active = h.id === activeId;
        return (
          <li
            key={h.id}
            ref={(el) => registerOverlay(`hotspot:${h.id}`, el)}
            data-visible="false"
            className="absolute top-0 left-0 transition-opacity duration-300 data-[hidden-side=true]:opacity-45 data-[visible=false]:invisible"
            style={{ willChange: "transform" }}
          >
            <button
              type="button"
              aria-expanded={active}
              aria-controls={active ? cardId : undefined}
              onClick={() => onSelect(h.id)}
              className="group pointer-events-auto relative inline-flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text"
            >
              <span className="sr-only">
                {`Point d'intérêt ${i + 1} : ${h.label}`}
                {active ? " (fiche ouverte)" : ""}
              </span>
              <span
                aria-hidden="true"
                className={cx(
                  "absolute inset-3 rounded-full border transition-colors duration-200",
                  active
                    ? "border-blue-line bg-blue-soft"
                    : "border-line-strong bg-bg/35 group-hover:border-orange-line group-hover:bg-orange-soft",
                )}
              />
              <span
                aria-hidden="true"
                className={cx(
                  "pulse-dot relative size-2! ring-1 ring-bg/60 transition-transform duration-200 ease-spring group-hover:scale-125 group-focus-visible:scale-125",
                  active ? "text-brand-blue-text [animation:none]" : "text-brand-orange-text",
                )}
              />
              <span
                aria-hidden="true"
                className={cx(
                  "bg-surface-2 border border-line pointer-events-none absolute top-1/2 left-full ml-0.5 -translate-y-1/2 rounded-full px-2.5 py-1 font-label text-[0.75rem] font-semibold whitespace-nowrap text-ink-strong shadow-card transition-all duration-200 ease-smooth",
                  active
                    ? "translate-x-0 opacity-100"
                    : "-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100",
                )}
              >
                {h.label}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export interface HotspotCardProps {
  id: string;
  hotspot: HotspotCopy;
  index: number;
  total: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

/** Design-intention card for the focused hotspot (bottom sheet on mobile, floating panel ≥ sm). */
export function HotspotCard({
  id,
  hotspot,
  index,
  total,
  onClose,
  onPrevious,
  onNext,
}: HotspotCardProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [hotspot.id]);

  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="bg-surface-2 absolute inset-x-3 bottom-3 z-20 animate-panel-in rounded-card border border-line-strong p-4 shadow-lift sm:right-auto sm:bottom-16 sm:left-4 sm:w-[22rem]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow-plain font-label text-[0.75rem] font-bold text-brand-orange-text">
            Point {index + 1} / {total}
          </p>
          <h3
            ref={headingRef}
            id={`${id}-title`}
            tabIndex={-1}
            className="mt-1 font-display text-lg leading-tight font-semibold text-ink-strong outline-none"
          >
            {hotspot.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-blue-text"
        >
          <X aria-hidden="true" className="size-4" />
          <span className="sr-only">Fermer la fiche</span>
        </button>
      </div>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-ink-soft">{hotspot.body}</p>
      <p className="mt-3 border-t border-line pt-2.5 text-[0.75rem] leading-snug text-muted">
        {DESIGN_INTENTION_MENTION}
      </p>
      <div className="mt-3 flex justify-between gap-2">
        <button
          type="button"
          onClick={onPrevious}
          className="min-h-9 rounded-full px-3 font-label text-[0.75rem] font-semibold text-muted transition-colors hover:bg-surface-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-blue-text"
        >
          ← Précédent
        </button>
        <button
          type="button"
          onClick={onNext}
          className="min-h-9 rounded-full px-3 font-label text-[0.75rem] font-semibold text-brand-blue-text transition-colors hover:bg-blue-soft focus-visible:outline-2 focus-visible:outline-brand-blue-text"
        >
          Suivant →
        </button>
      </div>
    </section>
  );
}
