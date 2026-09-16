/**
 * Local types of the Studio 3D. Intentionally independent from `src/lib/network` so the studio can
 * be integrated anywhere: a backend `SupportResponse` is structurally assignable to
 * `PorteurStudioSupport`.
 */

export type StudioPorteurType = "A" | "B" | "C" | "D";

/** Camera viewpoints (keyboard 1–5 in this order). */
export type CameraPresetId = "orbite" | "pieton" | "conducteur" | "drone" | "face";

/** Points of interest shown as DOM buttons over the canvas. */
export type HotspotId = "ecran" | "solaire" | "sphere" | "mat" | "base" | "capteurs";

export type TimeOfDay = "jour" | "nuit";

/** B: both faces, face 1 (heading side) or face 2 (opposite). A/C always behave as "all". */
export type StudioFace = "all" | 1 | 2;

export type Vec3Tuple = readonly [number, number, number];

export interface StudioCreative {
  /** Object URL (local preview) or same-origin URL. */
  url: string;
  kind: "image" | "video";
}

/** Minimal Porteur record the studio needs. `SupportResponse` satisfies it. */
export interface PorteurStudioSupport {
  id?: number;
  name: string;
  zoneName?: string | null;
  technicalStatus?: string | null;
  status?: string | null;
  /** Declared mast height in metres (15/20/25/30); null → default 20 m. */
  mastHeightM?: number | null;
  /** Direction the main screen face points to, 0 = north, clockwise; null → 0. */
  headingDeg?: number | null;
}

export interface PorteurStudioProps {
  support: PorteurStudioSupport;
  type: StudioPorteurType;
  creative?: StudioCreative | null;
  face?: StudioFace;
  timeOfDay: TimeOfDay;
  view: CameraPresetId;
  /** Calibration overlay (axes, grid, bbox, anchors, camera readout). Pages enable it with `?repere=1`. */
  repere?: boolean;
  /**
   * Increment to re-apply the current `view` preset (« Réinitialiser la vue » placed outside the
   * studio, e.g. in `StudioControls`).
   */
  viewRequest?: number;
  onHotspot?: (id: HotspotId) => void;
  /** Keyboard shortcuts 1–5 inside the studio ask the parent to change `view`. */
  onViewChange?: (view: CameraPresetId) => void;
  onReady?: () => void;
  className?: string;
}

/** Where the rendered model comes from. */
export type ModelSource = { kind: "procedural" } | { kind: "glb"; path: string };

export interface ModelInfo {
  source: ModelSource;
  triangles: number;
  /** Bounding box size in metres (x = width, y = height, z = depth), heading not applied. */
  size: Vec3Tuple;
  /** Hotspot anchors in the Porteur local frame (metres). */
  anchors: Partial<Record<HotspotId, Vec3Tuple>>;
  warnings: string[];
}

export interface CameraReadout {
  position: Vec3Tuple;
  target: Vec3Tuple;
  /** Same values with the Porteur heading removed (the frame used by presets). */
  localPosition: Vec3Tuple;
  localTarget: Vec3Tuple;
}
