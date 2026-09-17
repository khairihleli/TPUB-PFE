"use client";

import { RectangleHorizontal, RectangleVertical } from "lucide-react";

import { cx } from "@/lib/cx";
import { useReducedMotion } from "@/lib/use-reduced-motion";

export type ScreenOrientation = "landscape" | "portrait";

/** A visual to preview: an uploaded media (/uploads URL) or a local object URL. */
export interface PreviewCreative {
  url: string;
  kind: "image" | "video";
  name: string;
}

export interface ScreenMockupProps {
  creative: PreviewCreative | null;
  orientation: ScreenOrientation;
  /** Used for the typographic placeholder when no visual is available. */
  campaignName: string;
  objective?: string | null;
  /** Zone or screen name printed on the bezel. */
  location?: string;
  className?: string;
}

/**
 * A DOOH screen frame previewing the creative (uploaded media) or, without one, a typographic
 * mock-up of the campaign. Labelled « Aperçu » — never "live". Portrait = street totem with a foot.
 */
export function ScreenMockup({
  creative,
  orientation,
  campaignName,
  objective,
  location,
  className,
}: ScreenMockupProps) {
  const reduce = useReducedMotion();
  const portrait = orientation === "portrait";

  return (
    <figure
      className={cx("relative mx-auto w-full", portrait ? "max-w-[260px]" : "max-w-xl", className)}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-8 -z-10 rounded-[48px] bg-[radial-gradient(50%_50%_at_50%_45%,var(--color-blue-soft),transparent_70%)]"
      />
      <div className="relative overflow-hidden rounded-[22px] border border-line-strong bg-black shadow-card ring-[6px] ring-white/[0.03]">
        {/* Bezel */}
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <span className="inline-flex items-center gap-1.5 font-label text-[0.75rem] font-bold tracking-[0.12em] text-ink-soft uppercase">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-brand-blue-text" />
            Aperçu
          </span>
          <span className="min-w-0 truncate font-label text-[0.75rem] font-semibold tracking-[0.06em] text-muted uppercase">
            {location ?? (portrait ? "Totem 9:16" : "Écran 16:9")}
          </span>
        </div>

        {/* Stage */}
        <div
          className={cx(
            // Size container: the placeholder type scales with the frame, not the viewport
            // (the frame is ~300 px wide in the detail sidebar, ~560 px in the wizard).
            "@container relative overflow-hidden bg-bg",
            portrait ? "aspect-[9/16]" : "aspect-video",
          )}
        >
          {creative?.kind === "image" ? (
            // Same-origin /uploads media (or a blob: URL): shown as-is, never optimised.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={creative.url}
              alt={`Aperçu du visuel « ${creative.name} »`}
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
              controls={reduce}
              aria-label={`Aperçu de la vidéo « ${creative.name} »`}
            />
          ) : (
            <div
              className={cx(
                "absolute inset-0 flex flex-col justify-end bg-[radial-gradient(90%_70%_at_85%_0%,color-mix(in_srgb,var(--color-brand-orange)_70%,transparent),transparent_60%),linear-gradient(155deg,var(--color-brand-red-600),var(--color-brand-red)_40%,var(--color-bg)_115%)]",
                portrait
                  ? "gap-2 p-5"
                  : "gap-[clamp(0.25rem,1.6cqi,0.625rem)] p-[clamp(0.875rem,5.5cqi,1.75rem)]",
              )}
            >
              <span className="relative font-label text-[0.75rem] font-bold tracking-[0.16em] text-white/80 uppercase">
                Maquette indicative
              </span>
              <span
                className={cx(
                  "relative font-display leading-[1.05] font-bold tracking-tight break-words text-white",
                  portrait
                    ? "line-clamp-3 text-[1.6rem]"
                    : "line-clamp-2 pb-[0.08em] text-[clamp(1.125rem,7cqi,2rem)]",
                )}
              >
                {campaignName || "Votre campagne"}
              </span>
              {objective ? (
                <span
                  className={cx(
                    "relative text-[0.75rem] leading-snug font-medium text-white/80",
                    portrait ? "line-clamp-3" : "line-clamp-1 @md:line-clamp-2",
                  )}
                >
                  {objective}
                </span>
              ) : null}
            </div>
          )}
          <div
            aria-hidden="true"
            className="pixel-grid pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,color-mix(in_srgb,var(--color-white)_6%,transparent),transparent_38%)]"
          />
        </div>

        <div aria-hidden="true" className="h-2.5" />
      </div>

      {/* Foot / mount */}
      <div aria-hidden="true" className="flex flex-col items-center">
        {portrait ? (
          <>
            <span className="h-10 w-5 bg-[linear-gradient(90deg,var(--color-surface-2),var(--color-surface-3),var(--color-surface-2))]" />
            <span className="h-2 w-28 rounded-full bg-surface-3" />
          </>
        ) : (
          <>
            <span className="h-5 w-3 bg-surface-3" />
            <span className="h-1.5 w-24 rounded-full bg-surface-3" />
          </>
        )}
      </div>

      <figcaption className="mt-3 text-center text-[0.75rem] leading-snug text-muted">
        {creative
          ? "Rendu indicatif : le cadrage final dépend du Porteur."
          : "Maquette générée à partir du nom de la campagne."}
      </figcaption>
    </figure>
  );
}

/** Two-state toggle 16:9 / 9:16 (pressed buttons). */
export function OrientationToggle({
  value,
  onChange,
  className,
}: {
  value: ScreenOrientation;
  onChange: (next: ScreenOrientation) => void;
  className?: string;
}) {
  const options = [
    { value: "landscape" as const, label: "Paysage 16:9", Icon: RectangleHorizontal },
    { value: "portrait" as const, label: "Portrait 9:16", Icon: RectangleVertical },
  ];
  return (
    <div
      role="group"
      aria-label="Format de l'aperçu"
      className={cx("inline-flex rounded-full border border-line bg-surface/70 p-1", className)}
    >
      {options.map(({ value: v, label, Icon }) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(v)}
            className={cx(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 font-label text-[0.75rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-text",
              active ? "bg-surface-3 text-ink-strong shadow-lift" : "text-muted hover:text-ink",
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
