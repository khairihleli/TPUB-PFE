import Image from "next/image";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export type ImageRatio = "16/9" | "21/9" | "4/5" | "4/3" | "3/2" | "1/1" | "3/4" | "fill";

export interface ImageFrameProps {
  /** Local path under /public, e.g. "/images/screen-street.jpg". */
  src: string;
  /** French alt text; "" only if purely decorative. */
  alt: string;
  /** Aspect ratio of the frame, or "fill" to fill a positioned parent. */
  ratio?: ImageRatio;
  /** next/image sizes (REQUIRED for good performance), e.g. "(min-width: 1040px) 50vw, 100vw". */
  sizes: string;
  priority?: boolean;
  /**
   * none · soft (light vertical) · bottom (dark at bottom for captions) ·
   * side (110° directional, dark left) · full (hero scrim + red glow)
   */
  scrim?: "none" | "soft" | "bottom" | "side" | "full";
  /** LED pixel dot grid overlay. */
  pixelGrid?: boolean;
  /** Slow ambient zoom (disabled under reduced motion). */
  kenBurns?: boolean;
  /** Zoom on hover. */
  hoverZoom?: boolean;
  radius?: "none" | "card" | "panel";
  /** Small chip in the top-left corner, e.g. « Illustration ». */
  label?: string;
  /** Caption rendered inside the frame at the bottom. */
  caption?: ReactNode;
  /** Object position, e.g. "center 30%". */
  objectPosition?: string;
  /** Overlay content (positioned inside the frame). */
  children?: ReactNode;
  className?: string;
}

const RATIO: Record<Exclude<ImageRatio, "fill">, string> = {
  "16/9": "aspect-video",
  "21/9": "aspect-[21/9]",
  "4/5": "aspect-[4/5]",
  "4/3": "aspect-[4/3]",
  "3/2": "aspect-[3/2]",
  "1/1": "aspect-square",
  "3/4": "aspect-[3/4]",
};

const SCRIM = {
  none: "",
  soft: "bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-bg)_25%,transparent),color-mix(in_srgb,var(--color-bg)_55%,transparent))]",
  bottom:
    "bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-bg)_8%,transparent)_0%,color-mix(in_srgb,var(--color-bg)_45%,transparent)_50%,color-mix(in_srgb,var(--color-bg)_94%,transparent)_100%)]",
  side: "bg-scrim-side",
  full: "bg-scrim-v",
} as const;

const RADIUS = { none: "", card: "rounded-card", panel: "rounded-panel" } as const;

export function ImageFrame({
  src,
  alt,
  ratio = "16/9",
  sizes,
  priority = false,
  scrim = "soft",
  pixelGrid = true,
  kenBurns = false,
  hoverZoom = true,
  radius = "panel",
  label,
  caption,
  objectPosition,
  children,
  className,
}: ImageFrameProps) {
  return (
    <figure
      className={cx(
        hoverZoom ? "image-frame" : "isolate overflow-hidden border border-line bg-surface",
        ratio === "fill" ? "absolute inset-0" : cx("relative w-full", RATIO[ratio]),
        RADIUS[radius],
        className,
      )}
    >
      <div className={cx("absolute inset-0", kenBurns && "ken-burns")}>
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
          style={objectPosition ? { objectPosition } : undefined}
        />
      </div>
      {scrim !== "none" ? (
        <div aria-hidden="true" className={cx("absolute inset-0", SCRIM[scrim])} />
      ) : null}
      {pixelGrid ? (
        <div
          aria-hidden="true"
          className="pixel-grid absolute inset-0 opacity-50 mix-blend-overlay"
        />
      ) : null}
      {label ? (
        <span className="absolute top-3 left-3 z-[2] rounded-full border border-line-strong bg-black/45 px-2.5 py-1 font-label text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-soft uppercase backdrop-blur-md">
          {label}
        </span>
      ) : null}
      {children ? <div className="absolute inset-0 z-[2]">{children}</div> : null}
      {caption ? (
        <figcaption className="absolute inset-x-0 bottom-0 z-[2] p-4 text-sm text-ink-soft sm:p-5">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
