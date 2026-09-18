/**
 * Metric proportions of the procedural Porteur (pure, unit-tested).
 *
 * Ratios were measured on the reference renders `public/porteur/porteur-type-{a..d}.png` and the
 * corporate CSS model (porteur-sim): solar head at ~80 % of the height, energy sphere on top
 * (diameter ≈ 9 % H), slim tapered fluted mast, A band centred at ~35 % H, B panels on the lower
 * half, C panel at eye level (2,2–4 m). These are design-intention proportions for a preview, not
 * engineering drawings.
 *
 * Local frame: Y up, metres, origin at the base centre, main screen face towards −Z.
 */
import type { HotspotId, StudioPorteurType, Vec3Tuple } from "@/components/porteur3d/types";

export const DEFAULT_MAST_HEIGHT_M = 20;
export const MIN_MAST_HEIGHT_M = 8;
export const MAX_MAST_HEIGHT_M = 40;
/** Portrait panels (B, C) use a 9:16 display. */
export const PANEL_ASPECT = 9 / 16;

/** Null/invalid → 20 m; otherwise clamped to a plausible range (the backend allows 15/20/25/30). */
export function resolveMastHeight(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_MAST_HEIGHT_M;
  }
  return Math.min(MAX_MAST_HEIGHT_M, Math.max(MIN_MAST_HEIGHT_M, value));
}

/** Any number → [0, 360). Null/invalid → 0 (north). */
export function normalizeHeading(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const m = value % 360;
  return m < 0 ? m + 360 : m;
}

export interface PanelScreen {
  kind: "panel";
  /** 1 = heading side (−Z), 2 = opposite (+Z). */
  faces: readonly (1 | 2)[];
  width: number;
  height: number;
  centerY: number;
  /** Distance from the mast axis to the display surface. */
  offset: number;
  cabinetDepth: number;
}

export interface BandScreen {
  kind: "band";
  radius: number;
  height: number;
  centerY: number;
}

export interface PorteurDimensions {
  type: StudioPorteurType;
  heightM: number;
  plateRadius: number;
  plateHeight: number;
  plinthRadius: number;
  plinthHeight: number;
  mastBaseRadius: number;
  mastTopRadius: number;
  headY: number;
  collarRadius: number;
  collarHeight: number;
  upperMastRadius: number;
  sphereRadius: number;
  sphereY: number;
  wingCount: 2 | 4;
  wingSpan: number;
  wingWidth: number;
  wingTiltDeg: number;
  screen: PanelScreen | BandScreen | null;
  /** Ground-level cabinet of type D (weather, control), in front of the mast. */
  sensorCabinet: { width: number; height: number; depth: number; centerY: number } | null;
  /** Compact connectivity/sensor pod under the solar head (all types). */
  sensorPod: { width: number; height: number; depth: number; centerY: number };
  ledStrips: { centerY: number; length: number }[];
}

/** Mast outer radius (without flutes) at a given height. */
export function mastRadiusAt(
  d: Pick<PorteurDimensions, "mastBaseRadius" | "mastTopRadius" | "plinthHeight" | "headY">,
  y: number,
): number {
  const t = Math.min(
    1,
    Math.max(0, (y - d.plinthHeight) / Math.max(0.001, d.headY - d.plinthHeight)),
  );
  return d.mastBaseRadius + (d.mastTopRadius - d.mastBaseRadius) * t;
}

export function computePorteurDimensions(
  type: StudioPorteurType,
  mastHeightM?: number | null,
): PorteurDimensions {
  const H = resolveMastHeight(mastHeightM);
  const plinthHeight = type === "A" ? 0.9 : 0.7;
  const plinthRadius = Math.max(0.5, 0.034 * H);
  const mastBaseRadius = Math.max(0.2, 0.019 * H);
  const mastTopRadius = Math.max(0.14, 0.012 * H);
  const headY = 0.8 * H;
  const sphereRadius = 0.045 * H;

  const base = {
    mastBaseRadius,
    mastTopRadius,
    plinthHeight,
    headY,
  };

  let screen: PanelScreen | BandScreen | null = null;
  if (type === "A") {
    screen = { kind: "band", radius: 0.062 * H, height: 0.13 * H, centerY: 0.35 * H };
  } else if (type === "B") {
    const height = 0.21 * H;
    const centerY = 0.42 * H;
    const cabinetDepth = 0.22;
    screen = {
      kind: "panel",
      faces: [1, 2],
      height,
      width: height * PANEL_ASPECT,
      centerY,
      cabinetDepth,
      offset: mastRadiusAt(base, centerY) + 0.12 + cabinetDepth,
    };
  } else if (type === "C") {
    // Eye level, human scale: independent from the mast height.
    const height = 1.8;
    const centerY = 2.2 + height / 2;
    const cabinetDepth = 0.16;
    screen = {
      kind: "panel",
      faces: [1],
      height,
      width: height * PANEL_ASPECT,
      centerY,
      cabinetDepth,
      offset: mastRadiusAt(base, centerY) + 0.1 + cabinetDepth,
    };
  }

  const stripLength = Math.max(0.9, 0.06 * H);
  const stripStart = type === "A" ? 0.47 * H : type === "B" ? 0.58 * H : 0.3 * H;
  const ledStrips = [0, 1, 2].map((i) => ({
    centerY: stripStart + i * (stripLength * 1.9) + stripLength / 2,
    length: stripLength,
  }));

  return {
    type,
    heightM: H,
    plateRadius: plinthRadius * 1.3,
    plateHeight: 0.06,
    plinthRadius,
    plinthHeight,
    mastBaseRadius,
    mastTopRadius,
    headY,
    collarRadius: mastTopRadius * 1.9,
    collarHeight: Math.max(0.35, 0.028 * H),
    upperMastRadius: Math.max(0.08, 0.0065 * H),
    sphereRadius,
    sphereY: H - sphereRadius,
    wingCount: type === "B" || type === "D" ? 4 : 2,
    wingSpan: 0.15 * H,
    wingWidth: 0.055 * H,
    wingTiltDeg: 18,
    screen,
    sensorCabinet: type === "D" ? { width: 0.6, height: 0.9, depth: 0.32, centerY: 1.9 } : null,
    sensorPod: {
      width: Math.max(0.3, 0.018 * H),
      height: Math.max(0.45, 0.028 * H),
      depth: Math.max(0.22, 0.013 * H),
      centerY: headY - Math.max(1.1, 0.07 * H),
    },
    ledStrips,
  };
}

/**
 * Y rotations of the solar wings. A wing group rotated by φ extends along (cos φ, 0, −sin φ):
 * 2 wings sit left/right of the main face (±X), 4 wings form an X seen from above.
 */
export function wingAngles(count: 2 | 4): number[] {
  return count === 2
    ? [0, Math.PI]
    : [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
}

export interface HotspotAnchor {
  position: Vec3Tuple;
  /** Horizontal outward direction used to dim hotspots on the far side of the mast. */
  normal: Vec3Tuple;
}

/** Hotspot anchors in the local frame. `ecran` is absent for type D. */
export function computeHotspotAnchors(
  d: PorteurDimensions,
): Partial<Record<HotspotId, HotspotAnchor>> {
  const front: Vec3Tuple = [0, 0, -1];
  const anchors: Partial<Record<HotspotId, HotspotAnchor>> = {};

  // The screen point sits on the top edge of the display, never over the creative preview.
  if (d.screen?.kind === "band") {
    anchors.ecran = {
      position: [0, d.screen.centerY + d.screen.height * 0.5 + 0.12, -(d.screen.radius + 0.05)],
      normal: front,
    };
  } else if (d.screen?.kind === "panel") {
    anchors.ecran = {
      position: [0, d.screen.centerY + d.screen.height * 0.5 + 0.12, -(d.screen.offset + 0.05)],
      normal: front,
    };
  }

  const wingReach = d.mastTopRadius + d.wingSpan * 0.55;
  const phi = wingAngles(d.wingCount)[0] ?? 0;
  const dir: Vec3Tuple = [Math.cos(phi), 0, -Math.sin(phi)];
  anchors.solaire = {
    position: [dir[0] * wingReach, d.headY + 0.1, dir[2] * wingReach],
    normal: dir,
  };
  anchors.sphere = {
    position: [0, d.sphereY, -d.sphereRadius * 0.95],
    normal: front,
  };
  const mastY = d.screen?.kind === "band" ? 0.6 * d.heightM : 0.64 * d.heightM;
  anchors.mat = {
    position: [mastRadiusAt(d, mastY) + 0.02, mastY, 0],
    normal: [1, 0, 0],
  };
  anchors.base = {
    position: [0, d.plinthHeight * 0.6, -(d.plinthRadius + 0.02)],
    normal: front,
  };
  if (d.sensorCabinet) {
    anchors.capteurs = {
      position: [
        0,
        d.sensorCabinet.centerY + d.sensorCabinet.height * 0.2,
        -(mastRadiusAt(d, d.sensorCabinet.centerY) + d.sensorCabinet.depth + 0.04),
      ],
      normal: front,
    };
  } else {
    anchors.capteurs = {
      position: [
        mastRadiusAt(d, d.sensorPod.centerY) + d.sensorPod.depth + 0.04,
        d.sensorPod.centerY,
        0,
      ],
      normal: [1, 0, 0],
    };
  }
  return anchors;
}

/**
 * Flute profile of the mast cross-section: radius multiplier for polar angle `theta`.
 * `flutes` rounded grooves of relative depth `depth` (0.03 = 3 % of the radius).
 */
export function flutedRadiusFactor(theta: number, flutes: number, depth: number): number {
  const phase = ((((theta * flutes) / (2 * Math.PI)) % 1) + 1) % 1; // 0..1 inside one flute
  // Narrow groove centred on phase 0.5, smooth land elsewhere.
  const x = (phase - 0.5) / 0.22;
  const groove = Math.abs(x) >= 1 ? 0 : (1 + Math.cos(Math.PI * x)) / 2;
  return 1 - depth * groove;
}
