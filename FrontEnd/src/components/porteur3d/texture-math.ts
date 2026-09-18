/**
 * UV / aspect helpers for mapping creatives on screens (pure, unit-tested).
 */
import type { Vec3Tuple } from "@/components/porteur3d/types";

export interface UvTransform {
  repeatX: number;
  repeatY: number;
  offsetX: number;
  offsetY: number;
}

export const IDENTITY_UV: UvTransform = { repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0 };

/**
 * `object-fit: cover` in UV space: crop the content (aspect w/h) to fill a surface (aspect w/h),
 * centred.
 */
export function coverUv(contentAspect: number, surfaceAspect: number): UvTransform {
  if (!(contentAspect > 0) || !(surfaceAspect > 0)) return IDENTITY_UV;
  if (contentAspect > surfaceAspect) {
    const repeatX = surfaceAspect / contentAspect;
    return { repeatX, repeatY: 1, offsetX: (1 - repeatX) / 2, offsetY: 0 };
  }
  const repeatY = contentAspect / surfaceAspect;
  return { repeatX: 1, repeatY, offsetX: 0, offsetY: (1 - repeatY) / 2 };
}

/**
 * Wrap a creative around a 360° band: tile it `copies` times horizontally (at least once) so each
 * copy stays close to its aspect; content taller than a copy is cover-cropped vertically, content
 * wider is slightly squeezed (`stretchX` < 1). One copy is centred on the front (u = 0.5 → −Z).
 * Requires `wrapS = RepeatWrapping` on the texture.
 */
export function wrapBandUv(
  contentAspect: number,
  bandAspect: number,
): UvTransform & { copies: number; stretchX: number } {
  if (!(contentAspect > 0) || !(bandAspect > 0)) return { ...IDENTITY_UV, copies: 1, stretchX: 1 };
  const copies = Math.max(1, Math.round(bandAspect / contentAspect));
  const perCopyAspect = bandAspect / copies;
  let repeatY = 1;
  let offsetY = 0;
  let stretchX = 1;
  if (contentAspect < perCopyAspect) {
    repeatY = contentAspect / perCopyAspect;
    offsetY = (1 - repeatY) / 2;
  } else {
    stretchX = perCopyAspect / contentAspect;
  }
  return {
    copies,
    stretchX,
    repeatX: copies,
    repeatY,
    offsetX: copies % 2 === 0 ? 0.5 : 0,
    offsetY,
  };
}

/** Unrolled aspect of a cylindrical band: circumference / height (optionally a partial arc). */
export function bandAspect(radius: number, height: number, arcRadians = Math.PI * 2): number {
  return height > 0 ? (radius * arcRadians) / height : 1;
}

/**
 * Aspect of a screen mesh from its bounding-box size (GLB screens). A 360° band unrolls to its
 * circumference; a flat panel uses its largest horizontal extent.
 */
export function estimateScreenAspect(size: Vec3Tuple, face: 1 | 2 | "360" | null): number {
  const [x, y, z] = size;
  if (!(y > 0)) return 1;
  if (face === "360") return (Math.PI * Math.max(x, z)) / y;
  return Math.max(x, z) / y;
}

/** Canvas size for a surface aspect with the longest side capped (power-of-two friendly). */
export function canvasSizeForAspect(
  aspect: number,
  maxSide = 1024,
): { width: number; height: number } {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  if (a >= 1) {
    return { width: maxSide, height: Math.max(16, Math.round(maxSide / a)) };
  }
  return { width: Math.max(16, Math.round(maxSide * a)), height: maxSide };
}
