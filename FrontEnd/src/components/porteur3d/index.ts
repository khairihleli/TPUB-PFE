/**
 * Studio 3D public API. Light entry point: no three.js import here (the canvas is behind
 * `next/dynamic` in `PorteurStudio`).
 */
export { PorteurStudio } from "@/components/porteur3d/porteur-studio";
export { PorteurStudioSkeleton } from "@/components/porteur3d/studio-skeleton";
export {
  PorteurStudioFallback,
  type PorteurStudioFallbackProps,
} from "@/components/porteur3d/studio-fallback";
export { StudioControls, type StudioControlsProps } from "@/components/porteur3d/studio-controls";
export {
  CAMERA_PRESETS,
  CAMERA_PRESET_IDS,
  DESIGN_INTENTION_MENTION,
  PORTEUR_TYPE_LABELS,
  SCENE_CONFIG,
  bearingLong,
  bearingShort,
  effectiveFace,
  faceOptionsFor,
  getCameraPreset,
  getHotspots,
  glbCandidates,
  parseRepereParam,
  presetIdForKey,
  type CameraPreset,
  type FaceOption,
  type HotspotCopy,
} from "@/components/porteur3d/scene-config";
export {
  DEFAULT_MAST_HEIGHT_M,
  normalizeHeading,
  resolveMastHeight,
} from "@/components/porteur3d/porteur-dimensions";
export type {
  CameraPresetId,
  CameraReadout,
  HotspotId,
  ModelInfo,
  ModelSource,
  PorteurStudioProps,
  PorteurStudioSupport,
  StudioCreative,
  StudioFace,
  StudioPorteurType,
  TimeOfDay,
} from "@/components/porteur3d/types";
