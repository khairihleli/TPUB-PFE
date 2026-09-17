import { Check } from "lucide-react";
import type { ReactNode } from "react";

import type { AvailabilityStatus, TechnicalStatus } from "@/lib/api/types";
import { AVAILABILITY_STATUS, AVAILABILITY_STATUS_ORDER } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { TECHNICAL_STATUS_CODES } from "@/lib/network/filters";
import { heatmapGradientCss } from "@/lib/network/overlays";
import {
  DESIGN_INTENTION_NOTICE,
  PORTEUR_TYPE_CODES,
  PORTEUR_TYPES,
  technicalStatusLabel,
} from "@/lib/network/porteur";

import {
  AVAILABILITY_RING,
  STATUS_RING,
  TONE_BG_SOFT,
  TONE_TEXT,
} from "@/components/map/porteur-visuals";

function Row({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <li className="flex min-h-8 items-center gap-3 text-xs text-ink-soft">
      <span aria-hidden="true" className="grid w-8 shrink-0 place-items-center">
        {swatch}
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-3 mb-1 font-label text-[0.75rem] font-semibold text-muted-2 first:mt-0">
      {children}
    </h3>
  );
}

export interface MapLegendProps {
  /** Show selection & catchment entries (select mode). */
  showSelection?: boolean;
  /** Show the 3D column entry. */
  show3d?: boolean;
  /** Show the count bubble entry (« Regrouper les Porteurs proches » on). */
  showClusters?: boolean;
  /** Title of the density layer when a heatmap is displayed (round 2 §4.8). */
  heatmapLabel?: string | null;
  className?: string;
}

/** Legend of the network map. Static content: can be rendered in a map panel or a page aside. */
export function MapLegend({
  showSelection = true,
  show3d = false,
  showClusters = false,
  heatmapLabel = null,
  className,
}: MapLegendProps) {
  return (
    <div className={cx("text-ink", className)}>
      <Heading>Typologies de Porteur</Heading>
      <ul>
        {PORTEUR_TYPE_CODES.map((code) => {
          const meta = PORTEUR_TYPES[code];
          return (
            <Row
              key={code}
              swatch={
                <span
                  className={cx(
                    "grid size-6 place-items-center rounded-full border font-display text-[0.75rem] font-bold",
                    TONE_BG_SOFT[meta.tone],
                    TONE_TEXT[meta.tone],
                    code === "D" && "border-dashed",
                  )}
                >
                  {code}
                </span>
              }
            >
              <span className="font-semibold text-ink">
                Type {code} · {meta.name}
              </span>
              <span className="block text-[0.75rem] text-muted">{meta.context}</span>
            </Row>
          );
        })}
        <Row
          swatch={
            <span className="font-display text-xs font-bold text-muted">
              A<span className="align-super text-[0.75rem]">~</span>
            </span>
          }
        >
          Typologie estimée (type non déclaré)
        </Row>
      </ul>

      <Heading>État technique (anneau)</Heading>
      <ul className="grid grid-cols-2">
        {TECHNICAL_STATUS_CODES.map((status: TechnicalStatus) => (
          <Row
            key={status}
            swatch={
              <span className={cx("size-5 rounded-full border-2 bg-bg", STATUS_RING[status])} />
            }
          >
            {technicalStatusLabel(status)}
          </Row>
        ))}
      </ul>

      <Heading>Carte</Heading>
      <ul>
        <Row
          swatch={
            <span className="block size-6 rounded-full border border-dashed border-brand-orange-text/70 bg-brand-orange/12" />
          }
        >
          Zone de diffusion (centre et rayon)
        </Row>
        <Row
          swatch={
            <span className="block h-3 w-6 bg-brand-orange-text/35 [clip-path:polygon(0_50%,100%_0,100%_100%)]" />
          }
        >
          Orientation de l&apos;écran principal
        </Row>
        <Row
          swatch={
            <span className="block size-4 rounded-full border-2 border-success bg-brand-orange-text shadow-lift" />
          }
        >
          Porteur en vue d&apos;ensemble (couleur du type, anneau d&apos;état ; lettre dès le zoom
          9)
        </Row>
        <Row
          swatch={
            <svg viewBox="0 0 32 24" className="h-6 w-8 overflow-visible">
              <line
                x1="16"
                y1="18"
                x2="6"
                y2="6"
                strokeWidth="1.25"
                className="stroke-ink-strong/70"
              />
              <line
                x1="16"
                y1="18"
                x2="26"
                y2="6"
                strokeWidth="1.25"
                className="stroke-ink-strong/70"
              />
              <circle cx="16" cy="18" r="2.5" className="fill-ink-strong stroke-bg" />
              <circle cx="6" cy="6" r="4.5" strokeWidth="2" className="fill-bg stroke-success" />
              <circle cx="26" cy="6" r="4.5" strokeWidth="2" className="fill-bg stroke-warning" />
            </svg>
          }
        >
          Porteurs proches écartés : le point relié par un trait est leur position exacte
        </Row>
        {showClusters ? (
          <Row
            swatch={
              <span className="grid size-6 place-items-center rounded-full border-2 border-brand-orange-text/80 bg-bg font-display text-[0.75rem] font-bold">
                5
              </span>
            }
          >
            Groupe de Porteurs (zoomer pour détailler)
          </Row>
        ) : null}
        {showSelection ? (
          <>
            <Row
              swatch={
                <span className="relative grid size-6 place-items-center rounded-full border-2 border-success bg-bg ring-2 ring-brand-blue-text ring-offset-1 ring-offset-bg">
                  <Check className="size-3 text-brand-blue-text" strokeWidth={3} />
                </span>
              }
            >
              Porteur ou zone sélectionné
            </Row>
            <Row
              swatch={
                <span className="block size-6 rounded-full border-2 border-dashed border-brand-blue-text bg-brand-blue-text/10" />
              }
            >
              Zone de chalandise
            </Row>
          </>
        ) : null}
        {show3d ? (
          <Row
            swatch={
              <span className="block h-6 w-2 rounded-t-sm bg-linear-to-t from-success/40 to-success" />
            }
          >
            Colonne 3D proportionnelle à la hauteur de mât (échelle exagérée)
          </Row>
        ) : null}
      </ul>
      {heatmapLabel ? (
        <>
          <Heading>{heatmapLabel}</Heading>
          <HeatmapLegend className="mt-1" />
        </>
      ) : null}
      <p className="mt-3 border-t border-line pt-2.5 text-[0.75rem] leading-snug text-muted-2">
        {DESIGN_INTENTION_NOTICE}
      </p>
    </div>
  );
}

/**
 * Gradient legend of a heatmap layer (round 2 §4.8): « Faible » → « Forte ». The gradient uses the
 * same colour ramp as the MapLibre layer and the SVG fallback circles.
 */
export function HeatmapLegend({
  label,
  className,
}: {
  /** Optional title above the gradient. */
  label?: string;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      {label ? (
        <p className="font-label text-[0.75rem] font-semibold text-muted-2">{label}</p>
      ) : null}
      <span
        aria-hidden="true"
        className="block h-2 w-full rounded-full border border-line"
        style={{ backgroundImage: heatmapGradientCss() }}
      />
      <p className="flex items-center justify-between text-[0.75rem] text-muted">
        <span>Faible</span>
        <span>Forte</span>
      </p>
    </div>
  );
}

/** Legend of the availability rings (campaign zone step): the 5 statuses of contract §2.7. */
export function AvailabilityLegend({
  counts,
  className,
}: {
  /** Optional count per status, shown after each label. */
  counts?: Partial<Record<AvailabilityStatus, number>>;
  className?: string;
}) {
  return (
    <ul
      aria-label="Légende des disponibilités"
      className={cx("flex flex-wrap gap-x-4 gap-y-1.5 text-[0.8125rem] text-ink-soft", className)}
    >
      {AVAILABILITY_STATUS_ORDER.map((status) => (
        <li key={status} className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cx("size-3 shrink-0 rounded-full border-2 bg-bg", AVAILABILITY_RING[status])}
          />
          {AVAILABILITY_STATUS[status].label}
          {counts && counts[status] !== undefined ? (
            <span className="text-muted tabular">{counts[status]}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
