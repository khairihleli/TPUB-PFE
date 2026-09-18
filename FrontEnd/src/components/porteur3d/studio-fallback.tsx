"use client";

import { MonitorOff } from "lucide-react";
import Image from "next/image";

import {
  DESIGN_INTENTION_MENTION,
  PORTEUR_TYPE_LABELS,
  getHotspots,
} from "@/components/porteur3d/scene-config";
import type { StudioCreative, StudioPorteurType } from "@/components/porteur3d/types";
import { cx } from "@/lib/cx";
import { useReducedMotion } from "@/lib/use-reduced-motion";

export interface PorteurStudioFallbackProps {
  type: StudioPorteurType;
  creative?: StudioCreative | null;
  supportName?: string;
  mastHeightM?: number | null;
  /** Why the 3D view is not available. */
  reason?: "webgl" | "context-lost" | "error";
  className?: string;
}

const REASON_COPY: Record<NonNullable<PorteurStudioFallbackProps["reason"]>, string> = {
  webgl: "Aperçu 3D indisponible sur cet appareil (WebGL désactivé ou non pris en charge).",
  "context-lost": "Le rendu 3D a été interrompu par le navigateur.",
  error: "Le studio 3D n'a pas pu démarrer.",
};

/** CSS screen mock-up showing the creative (local preview) or the default message. */
function FallbackScreen({
  creative,
  portrait,
}: {
  creative?: StudioCreative | null;
  portrait: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-[14px] border border-line-strong bg-black shadow-lift ring-4 ring-overlay-subtle",
        portrait ? "aspect-[9/16] w-24 sm:w-32" : "aspect-[21/9] w-44 sm:w-60",
      )}
    >
      {creative?.kind === "image" ? (
        // Local object URL: next/image cannot optimise blob: sources.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={creative.url}
          alt="Aperçu du visuel sur l'écran"
          className="absolute inset-0 size-full object-cover"
        />
      ) : creative?.kind === "video" ? (
        <video
          src={creative.url}
          className="absolute inset-0 size-full object-cover"
          muted
          loop
          playsInline
          autoPlay={!reduce}
          aria-label="Aperçu de la vidéo sur l'écran"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col justify-end gap-1 bg-[radial-gradient(90%_70%_at_85%_0%,color-mix(in_srgb,var(--color-brand-orange)_70%,transparent),transparent_60%),linear-gradient(155deg,var(--color-brand-red-600),var(--color-brand-red)_40%,var(--color-bg)_115%)] p-2.5">
          <span className="font-display text-[0.8125rem] leading-[1.02] font-extrabold tracking-tight text-white sm:text-base">
            VOTRE MESSAGE ICI
          </span>
        </div>
      )}
      <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-scrim px-1.5 py-0.5 font-label text-[0.75rem] font-bold text-white">
        <span aria-hidden="true" className="size-1 rounded-full bg-brand-blue-text" />
        Aperçu
      </span>
      <div
        aria-hidden="true"
        className="pixel-grid pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay"
      />
    </div>
  );
}

/**
 * Static fallback of the Studio 3D: the reference render of the Porteur type, the creative in a CSS
 * screen, a notice and the design-intention points as an accessible list.
 */
export function PorteurStudioFallback({
  type,
  creative,
  supportName,
  mastHeightM,
  reason = "webgl",
  className,
}: PorteurStudioFallbackProps) {
  const hotspots = getHotspots(type, mastHeightM);
  const label = PORTEUR_TYPE_LABELS[type];
  return (
    <div
      className={cx(
        "relative isolate flex flex-col overflow-hidden rounded-panel border border-line bg-bg",
        className,
      )}
    >
      <div className="relative aspect-[4/3] min-h-[280px] w-full sm:aspect-[16/10]">
        <Image
          src={`/porteur/porteur-type-${type.toLowerCase()}.png`}
          alt={`Rendu de référence d'un Porteur Type ${type} — ${label}`}
          fill
          sizes="(min-width: 1040px) 60vw, 100vw"
          className="object-cover"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,var(--color-bg)_100%)]"
        />
        {type !== "D" ? (
          <div className="absolute right-4 bottom-4">
            <FallbackScreen creative={creative} portrait={type !== "A"} />
          </div>
        ) : null}
        <div className="bg-surface-2 absolute top-3 left-3 max-w-[calc(100%-1.5rem)] rounded-card border border-line px-3 py-2">
          <p className="font-label text-[0.75rem] font-bold text-brand-orange-text">
            Type {type} · {label}
          </p>
          {supportName ? <p className="mt-0.5 truncate text-sm text-ink">{supportName}</p> : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-line p-4">
        <p role="status" className="flex items-start gap-2 text-sm text-ink-soft">
          <MonitorOff aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            {REASON_COPY[reason]} Image de référence affichée : le visuel est présenté dans un écran
            simulé.
          </span>
        </p>
        <details className="group rounded-card border border-line bg-surface/60 px-3 py-2">
          <summary className="cursor-pointer font-label text-sm font-semibold text-ink marker:text-muted">
            Points clés du Porteur
          </summary>
          <dl className="mt-2 grid gap-2.5">
            {hotspots.map((h) => (
              <div key={h.id}>
                <dt className="font-label text-[0.8125rem] font-semibold text-ink-strong">
                  {h.title}
                </dt>
                <dd className="text-[0.8125rem] leading-relaxed text-muted">{h.body}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted-2">{DESIGN_INTENTION_MENTION}</p>
        </details>
      </div>
    </div>
  );
}
