"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, type FocusEvent, type ReactNode } from "react";

import type { AvailabilityStatus, SupportResponse, ZoneResponse } from "@/lib/api/types";
import { AVAILABILITY_STATUS } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { formatRadiusKm } from "@/lib/network/geo";
import { PORTEUR_TYPES, porteurAriaLabel, resolvePorteurType } from "@/lib/network/porteur";

import { PorteurCard } from "@/components/map/porteur-card";
import {
  AVAILABILITY_RING,
  STATUS_RING,
  TONE_BG,
  TONE_TEXT,
} from "@/components/map/porteur-visuals";

export interface PorteurMarkerProps {
  support: SupportResponse;
  selected: boolean;
  highlighted?: boolean;
  pulse?: boolean;
  cardOpen: boolean;
  /** Card opens below the marker (marker near the top edge). */
  cardBelow?: boolean;
  canSelect: boolean;
  openLabel?: string;
  /** Size variant: "sm" for the dense SVG fallback. */
  size?: "md" | "sm";
  /**
   * Compact dot (country-scale zooms): 16 px type-colour dot with its status ring inside a 24 px
   * target, letter hidden. Same accessible name, focus and hover/focus mini card.
   */
  compact?: boolean;
  /** Campaign-window availability: replaces the technical status ring and label. */
  availability?: AvailabilityStatus;
  onActivate: () => void;
  onToggleSelect: () => void;
  onOpen?: () => void;
  onCardChange: (open: boolean) => void;
}

/**
 * Accessible Porteur marker: a real button (aria-label « Porteur Type A — Nom — Actif »),
 * status ring colour, type letter, selection check, focus pulse, and a hover/focus mini card.
 */
export function PorteurMarker({
  support,
  selected,
  highlighted = false,
  pulse = false,
  cardOpen,
  cardBelow = false,
  canSelect,
  openLabel,
  size = "md",
  compact = false,
  availability,
  onActivate,
  onToggleSelect,
  onOpen,
  onCardChange,
}: PorteurMarkerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { type, inferred } = resolvePorteurType(support);
  const meta = PORTEUR_TYPES[type];
  const cardId = `porteur-card-${support.id}`;
  const ring = availability
    ? AVAILABILITY_RING[availability]
    : STATUS_RING[support.technicalStatus];
  const dimmed = availability ? availability !== "DISPONIBLE" : support.technicalStatus !== "ACTIF";
  const ariaLabel = availability
    ? `${porteurAriaLabel(support, { selected })} — ${AVAILABILITY_STATUS[availability].label} sur la période`
    : porteurAriaLabel(support, { selected });

  const handleBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!rootRef.current?.contains(e.relatedTarget)) onCardChange(false);
  };
  const cardChange = useRef(onCardChange);
  cardChange.current = onCardChange;
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !cardOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      cardChange.current(false);
      root.querySelector<HTMLButtonElement>("button")?.focus();
    };
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, [cardOpen]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={() => onCardChange(true)}
      onMouseLeave={() => onCardChange(false)}
      onFocus={() => onCardChange(true)}
      onBlur={handleBlur}
    >
      {pulse ? (
        <span
          aria-hidden="true"
          className="tpub-map-pulse pointer-events-none absolute inset-0 rounded-full bg-brand-blue-text/50"
        />
      ) : null}
      {compact ? (
        <button
          type="button"
          data-support-id={support.id}
          data-marker-variant="compact"
          aria-label={ariaLabel}
          aria-describedby={cardOpen ? cardId : undefined}
          onClick={onActivate}
          className={cx(
            "group/dot relative grid size-6 cursor-pointer place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text",
            (highlighted || cardOpen) && "scale-125",
            "transition-transform duration-200 ease-smooth hover:scale-125 focus-visible:scale-125 motion-reduce:transition-none",
          )}
        >
          <span
            aria-hidden="true"
            className={cx(
              "block size-4 rounded-full border-2 shadow-lift",
              TONE_BG[meta.tone],
              ring,
              type === "D" && "border-dashed",
              selected && "ring-2 ring-brand-blue-text ring-offset-1 ring-offset-bg",
              highlighted && !selected && "ring-2 ring-ink-strong/70 ring-offset-1 ring-offset-bg",
              dimmed && "opacity-90",
            )}
          />
        </button>
      ) : (
        <button
          type="button"
          data-support-id={support.id}
          data-marker-variant="full"
          aria-label={ariaLabel}
          aria-describedby={cardOpen ? cardId : undefined}
          onClick={onActivate}
          className={cx(
            "relative grid cursor-pointer place-items-center rounded-full border-2 bg-bg shadow-lift transition-[transform,box-shadow] duration-200 ease-smooth hover:scale-110 focus-visible:scale-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue-text motion-reduce:transition-none",
            size === "sm" ? "size-7" : "size-9",
            ring,
            type === "D" && "border-dashed",
            selected && "ring-2 ring-brand-blue-text ring-offset-2 ring-offset-bg",
            highlighted && !selected && "ring-2 ring-ink-strong/70 ring-offset-2 ring-offset-bg",
            (highlighted || cardOpen) && "scale-110",
            dimmed && "opacity-85",
          )}
        >
          <span
            aria-hidden="true"
            className={cx(
              "font-display leading-none font-bold",
              size === "sm" ? "text-xs" : "text-sm",
              TONE_TEXT[meta.tone],
            )}
          >
            {type}
            {inferred ? <span className="align-super text-[0.75rem] text-muted">~</span> : null}
          </span>
          {selected ? (
            <span
              aria-hidden="true"
              className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-brand-blue-text text-bg shadow-card"
            >
              <Check className="size-3" strokeWidth={3} />
            </span>
          ) : null}
        </button>
      )}
      {cardOpen ? (
        <div
          className={cx(
            "absolute left-1/2 z-10 -translate-x-1/2",
            cardBelow ? "top-full pt-2.5" : "bottom-full pb-2.5",
          )}
        >
          <PorteurCard
            id={cardId}
            support={support}
            selected={selected}
            canSelect={canSelect}
            onToggleSelect={onToggleSelect}
            onOpen={onOpen}
            openLabel={openLabel}
          />
        </div>
      ) : null}
    </div>
  );
}

export interface ClusterMarkerProps {
  count: number;
  selectedCount: number;
  label: string;
  onActivate: () => void;
  size?: "md" | "sm";
}

/** Count bubble for grouped Porteurs. */
export function ClusterMarker({
  count,
  selectedCount,
  label,
  onActivate,
  size = "md",
}: ClusterMarkerProps) {
  const dim =
    size === "sm" ? "size-8 text-xs" : count >= 10 ? "size-12 text-sm" : "size-10 text-sm";
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onActivate}
      className={cx(
        "group/cluster relative grid cursor-pointer place-items-center rounded-full font-display font-bold text-ink-strong tabular transition-transform duration-200 ease-smooth hover:scale-110 focus-visible:scale-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue-text motion-reduce:transition-none",
        dim,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full border border-brand-orange-text/40 bg-orange-soft"
      />
      <span
        aria-hidden="true"
        className="absolute inset-1.5 rounded-full border-2 border-brand-orange-text/80 bg-bg shadow-brand"
      />
      <span aria-hidden="true" className="relative">
        {count}
      </span>
      {selectedCount > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-brand-blue-text px-1 text-[0.75rem] leading-4 text-bg"
        >
          {selectedCount}
        </span>
      ) : null}
    </button>
  );
}

export interface ZoneLabelProps {
  zone: ZoneResponse;
  supportCount: number;
  selected: boolean;
  focused?: boolean;
  /** Button action label for screen readers, e.g. « sélectionner ». */
  actionHint: string;
  /** Toggle button semantics (select mode). */
  toggles?: boolean;
  onActivate: () => void;
}

/** Zone name chip sitting on top of the zone circle. */
export function ZoneLabel({
  zone,
  supportCount,
  selected,
  focused = false,
  actionHint,
  toggles = false,
  onActivate,
}: ZoneLabelProps) {
  const count =
    supportCount === 0
      ? "aucun Porteur"
      : supportCount === 1
        ? "1 Porteur"
        : `${supportCount} Porteurs`;
  return (
    <button
      type="button"
      aria-label={`Zone ${zone.name} — ${count}${zone.radiusKm ? `, rayon ${formatRadiusKm(zone.radiusKm)}` : ""}${zone.isActive ? "" : " — inactive"}${selected && !toggles ? " — sélectionnée" : ""} — ${actionHint}`}
      aria-pressed={toggles ? selected : undefined}
      onClick={onActivate}
      className={cx(
        "inline-flex max-w-[14rem] cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 font-label text-[0.75rem] font-semibold whitespace-nowrap shadow-lift transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text",
        selected
          ? "border-brand-blue-text/60 bg-brand-blue text-on-brand"
          : zone.isActive
            ? "border-orange-line bg-bg text-ink hover:border-brand-orange-text/70"
            : "border-line-strong bg-bg text-muted",
        focused && "ring-2 ring-brand-blue-text/60",
      )}
    >
      {selected ? <Check aria-hidden="true" className="size-3" strokeWidth={3} /> : null}
      <span className="truncate">{zone.name}</span>
      <span
        aria-hidden="true"
        className={cx("tabular", selected ? "text-on-brand/80" : "text-muted-2")}
      >
        {supportCount}
      </span>
    </button>
  );
}

export interface SpiderLegProps {
  /** Offset (px) from the exact position to the fanned marker centre. */
  dx: number;
  dy: number;
  highlighted?: boolean;
}

/**
 * Exact-position dot + thin leader line to a fanned-out marker. Its centre is the exact point
 * (render it in a marker anchored on the Porteur's true coordinates). Decorative: aria-hidden.
 */
export function SpiderLeg({ dx, dy, highlighted = false }: SpiderLegProps) {
  return (
    <span
      aria-hidden="true"
      data-spider-leg=""
      className="pointer-events-none relative block size-2"
    >
      <svg
        width="1"
        height="1"
        focusable="false"
        className="absolute top-1/2 left-1/2 overflow-visible"
      >
        <line
          x1={0}
          y1={0}
          x2={dx}
          y2={dy}
          strokeWidth={highlighted ? 2 : 1.25}
          strokeLinecap="round"
          className={cx(highlighted ? "stroke-brand-blue-text" : "stroke-ink-strong/70")}
        />
      </svg>
      <span
        className={cx(
          "absolute inset-0 rounded-full border shadow-lift",
          highlighted ? "border-bg bg-brand-blue-text" : "border-bg bg-ink-strong",
        )}
      />
    </span>
  );
}

export interface SpiderFanProps {
  dx: number;
  dy: number;
  /** Fan group key (null = marker at its exact position). */
  group: string | null;
  reducedMotion: boolean;
  children: ReactNode;
}

/**
 * Wraps a marker's content and animates it out of / back into its exact position when its fan
 * group changes (the placement itself is the MapLibre offset or the SVG position, never this
 * animation). Instant with reduced motion. Keeps the content box unchanged (anchor stays exact).
 */
export function SpiderFan({ dx, dy, group, reducedMotion, children }: SpiderFanProps) {
  const ref = useRef<HTMLDivElement>(null);
  const previousGroup = useRef<string | null | undefined>(undefined);
  const latest = useRef({ dx, dy, reducedMotion });
  latest.current = { dx, dy, reducedMotion };
  // last slot while fanned out, to animate back to the exact position
  const lastSlot = useRef({ dx: 0, dy: 0 });
  if (group !== null) lastSlot.current = { dx, dy };

  useEffect(() => {
    const el = ref.current;
    const prev = previousGroup.current;
    const now = latest.current;
    const slot = lastSlot.current;
    previousGroup.current = group;
    // no animation on mount, on an unchanged group or with reduced motion
    if (!el || prev === undefined || prev === group || now.reducedMotion) return;
    if (typeof el.animate !== "function") return;
    // entering a fan: come from the exact point; leaving: come from the previous slot
    const from = group !== null ? { x: -now.dx, y: -now.dy } : { x: slot.dx, y: slot.dy };
    if (Math.hypot(from.x, from.y) < 1) return;
    el.animate(
      [
        { transform: `translate(${from.x}px, ${from.y}px) scale(0.6)`, opacity: 0.5 },
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
      ],
      { duration: 260, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
  }, [group]);

  return (
    <div ref={ref} data-spider-group={group ?? undefined}>
      {children}
    </div>
  );
}
