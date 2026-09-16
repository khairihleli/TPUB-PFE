"use client";

import { Ban, MapPin } from "lucide-react";

import { PorteurCoordinates } from "@/components/map/porteur-coordinates";
import { Fact, PorteurTypeBadges } from "@/components/network/network-ui";
import { StatusPill } from "@/components/ui/status-pill";
import type { SupportResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { normalizeHeading } from "@/lib/network/geo";
import {
  bookingBlockReason,
  DESIGN_INTENTION_NOTICE,
  formatMastHeight,
  mastHeightMeta,
  orientationLabel,
  orientationSpoken,
  PORTEUR_TYPES,
  resolvePorteurType,
} from "@/lib/network/porteur";

/** Mini compass: the needle points where the main screen face looks. */
function CompassDial({ headingDeg }: { headingDeg: number }) {
  const deg = Math.round(normalizeHeading(headingDeg));
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className="size-10 shrink-0 text-muted-2">
      <circle
        cx="20"
        cy="20"
        r="18"
        className="fill-overlay-inset stroke-current"
        strokeWidth="1"
      />
      {[0, 90, 180, 270].map((a) => (
        <line
          key={a}
          x1="20"
          y1="3.5"
          x2="20"
          y2="6.5"
          className="stroke-current"
          strokeWidth="1"
          transform={`rotate(${a} 20 20)`}
        />
      ))}
      {/* North marker (a glyph would be under 12 px at this size; the text label says it). */}
      <path d="M20 0.5 L22.5 4 L17.5 4 Z" className="fill-ink-soft" />
      <g transform={`rotate(${deg} 20 20)`}>
        <path d="M20 7 L23.5 20 L20 18 L16.5 20 Z" className="fill-brand-orange-text" />
        <path d="M20 33 L23.5 20 L20 22 L16.5 20 Z" className="fill-surface-3" />
      </g>
      <circle cx="20" cy="20" r="1.6" className="fill-ink" />
    </svg>
  );
}

/** Configurator §1 — who is this Porteur and can it be booked. */
export function ConfiguratorIdentity({ support }: { support: SupportResponse }) {
  const { type } = resolvePorteurType(support);
  const meta = PORTEUR_TYPES[type];
  const height = formatMastHeight(support.mastHeightM);
  const heightMeta = mastHeightMeta(support.mastHeightM);
  const orientation = orientationLabel(support.headingDeg, type);
  const spoken = orientationSpoken(support.headingDeg);
  const block = bookingBlockReason(support);
  const hasHeading = typeof support.headingDeg === "number" && Number.isFinite(support.headingDeg);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <PorteurTypeBadges support={support} />
        <StatusPill type="support" status={support.technicalStatus} size="sm" />
      </div>

      <p className="text-[0.8125rem] leading-relaxed text-ink-soft">{meta.description}</p>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-card border border-line bg-overlay-inset p-4">
        <Fact label="Zone">
          <span className="inline-flex items-center gap-1.5">
            <MapPin aria-hidden="true" className="size-3.5 text-brand-orange-text" />
            {support.zoneName}
          </span>
        </Fact>
        <Fact label="Écran">{meta.screen}</Fact>
        <Fact label="Hauteur de mât">
          {height ?? "Non déclarée"}
          {heightMeta ? (
            <span className="mt-0.5 block text-[0.75rem] text-muted">{heightMeta.description}</span>
          ) : null}
        </Fact>
        <Fact label="Orientation">
          {type === "D" ? (
            "Sans écran"
          ) : orientation && hasHeading ? (
            <span className="flex items-center gap-2.5">
              <CompassDial headingDeg={support.headingDeg ?? 0} />
              <span>
                {orientation}
                {spoken ? <span className="sr-only"> ({spoken})</span> : null}
              </span>
            </span>
          ) : (
            "Non déclarée"
          )}
        </Fact>
        <Fact label="Adresse" className="col-span-2">
          {support.address || "Adresse non renseignée"}
        </Fact>
        <Fact label="Position exacte" className="col-span-2">
          <PorteurCoordinates
            latitude={support.latitude}
            longitude={support.longitude}
            name={support.name}
            className="mt-0.5"
          />
        </Fact>
        <Fact label="Public visé" className="col-span-2">
          {meta.context} · {meta.flow}
        </Fact>
      </dl>

      {block ? (
        <div
          role="note"
          className={cx(
            "flex items-start gap-2.5 rounded-card border px-3.5 py-3 text-[0.8125rem] leading-snug",
            type === "D"
              ? "border-line-strong bg-overlay-subtle text-ink-soft"
              : "border-warning/35 bg-warning/8 text-ink-soft",
          )}
        >
          <Ban
            aria-hidden="true"
            className={cx("mt-0.5 size-4 shrink-0", type === "D" ? "text-muted" : "text-warning")}
          />
          <span>
            <span className="font-semibold text-ink-strong">Réservation indisponible. </span>
            {block}
          </span>
        </div>
      ) : null}

      <p className="text-[0.75rem] leading-relaxed text-muted-2">{DESIGN_INTENTION_NOTICE}</p>
    </div>
  );
}
