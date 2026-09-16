/**
 * Studio 3D configuration: renderer/controls settings, GLB options, camera presets and hotspot
 * copy. Pure module (no three.js import) — safe to import from pages and from the controls bar.
 *
 * Frames: the Porteur LOCAL frame is Y up, metres, origin at the base centre, main face towards −Z.
 * The WORLD frame is the local frame rotated around Y by the heading (scene north = −Z, clockwise).
 */
import {
  computePorteurDimensions,
  normalizeHeading,
  resolveMastHeight,
  type PorteurDimensions,
} from "@/components/porteur3d/porteur-dimensions";
import type {
  CameraPresetId,
  HotspotId,
  StudioFace,
  StudioPorteurType,
  Vec3Tuple,
} from "@/components/porteur3d/types";

export const SCENE_CONFIG = {
  renderer: {
    maxPixelRatio: 2,
    /** Ambient animation (sphere, default creative, video) is throttled to this rate. */
    ambientFps: 30,
    shadowMapSize: 2048,
    exposureDay: 1.0,
    exposureNight: 1.2,
  },
  camera: { fovDeg: 38, near: 0.1, far: 2500 },
  controls: {
    dampingFactor: 0.08,
    minDistance: 2.5,
    /** max distance = max(maxDistanceMin, heightM × maxDistanceFactor). */
    maxDistanceMin: 95,
    maxDistanceFactor: 5,
    /** Never look from under the ground plane. */
    maxPolarAngleDeg: 88,
    minCameraY: 0.35,
    /** How far the orbit target may be panned away from the mast axis (m). */
    maxTargetRadius: 30,
  },
  tween: { durationMs: 1150, minDurationMs: 550, arcLift: 0.12 },
  timeOfDay: { durationMs: 900 },
  glb: {
    /** Scale the GLB so its height equals the declared mast height. */
    autoScale: true,
    basePath: "/models",
    headTimeoutMs: 4000,
    dracoDecoderPath: "/draco/",
    /** Budgets documented in docs/PORTEUR-3D.md (warnings in repère mode). */
    maxTriangles: 150_000,
  },
  sphere: { radiansPerSecond: 0.9 },
} as const;

/** Candidate GLB files, in order. */
export function glbCandidates(type: StudioPorteurType): string[] {
  return [
    `${SCENE_CONFIG.glb.basePath}/porteur-type-${type.toLowerCase()}.glb`,
    `${SCENE_CONFIG.glb.basePath}/porteur.glb`,
  ];
}

/** `?repere=1` / `true` / `oui` enables the calibration mode. */
export function parseRepereParam(value: string | string[] | null | undefined): boolean {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && ["1", "true", "oui", "on"].includes(v.trim().toLowerCase());
}

// ---------------------------------------------------------------------------------------------
// Heading helpers

const DEG = Math.PI / 180;

/** Y rotation applied to the Porteur so its −Z face points to `headingDeg` (0 = N = −Z, 90 = E = +X). */
export function headingToRotationY(headingDeg: number | null | undefined): number {
  return -normalizeHeading(headingDeg) * DEG;
}

/** Local → world (rotation around Y by the heading). */
export function localToWorld(v: Vec3Tuple, headingDeg: number | null | undefined): Vec3Tuple {
  const a = headingToRotationY(headingDeg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

/** World → local (inverse rotation). */
export function worldToLocal(v: Vec3Tuple, headingDeg: number | null | undefined): Vec3Tuple {
  return localToWorld(v, -normalizeHeading(headingDeg));
}

/** Unit vector of the main face direction in world space. */
export function headingDirection(headingDeg: number | null | undefined): Vec3Tuple {
  return localToWorld([0, 0, -1], headingDeg);
}

const BEARINGS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"] as const;
const BEARING_NAMES = [
  "nord",
  "nord-est",
  "est",
  "sud-est",
  "sud",
  "sud-ouest",
  "ouest",
  "nord-ouest",
] as const;

/** 44° → « NE » (French compass, O = ouest). */
export function bearingShort(headingDeg: number | null | undefined): string {
  return BEARINGS[Math.round(normalizeHeading(headingDeg) / 45) % 8] ?? "N";
}

export function bearingLong(headingDeg: number | null | undefined): string {
  return BEARING_NAMES[Math.round(normalizeHeading(headingDeg) / 45) % 8] ?? "nord";
}

// ---------------------------------------------------------------------------------------------
// Camera presets

/** Metres, or a factor of the mast height. */
export type Length = number | { h: number };
export type PresetTarget = "screen" | "sphere" | "mast" | { y: Length };

export interface OrbitPresetDef {
  kind: "orbit";
  /** 0 = in front of the main face, positive = towards the viewer's right (+X side). */
  azimuthDeg: number;
  /** Horizontal distance from the target; "fit-screen" frames the display. */
  distance: Length | "fit-screen";
  /** Camera height; "target" = same height as the target. */
  height: Length | "target";
  target: PresetTarget;
  /** Sideways offset of the camera (m), e.g. the driver sits in a lane. */
  lateral?: number;
}

/** Output of « Copier la vue »: exact local coordinates, scaled with the mast height. */
export interface FixedPresetDef {
  kind: "fixed";
  position: Vec3Tuple;
  target: Vec3Tuple;
  referenceHeightM: number;
}

export type CameraPresetDef = OrbitPresetDef | FixedPresetDef;

export interface CameraPreset {
  id: CameraPresetId;
  label: string;
  description: string;
  /** Keyboard shortcut. */
  key: "1" | "2" | "3" | "4" | "5";
  icon: "orbit" | "pedestrian" | "car" | "drone" | "face";
  def: CameraPresetDef;
}

export const CAMERA_PRESETS: readonly CameraPreset[] = [
  {
    id: "orbite",
    label: "Orbite",
    description: "Vue de trois quarts sur l'ensemble du Porteur.",
    key: "1",
    icon: "orbit",
    def: {
      kind: "orbit",
      azimuthDeg: 38,
      // Headroom above the energy sphere so overlays never cover the top of the Porteur.
      distance: { h: 1.95 },
      height: { h: 0.3 },
      target: { y: { h: 0.5 } },
    },
  },
  {
    id: "pieton",
    label: "Piéton",
    description: "À hauteur des yeux (1,7 m), à 25 m, face à l'écran.",
    key: "2",
    icon: "pedestrian",
    def: { kind: "orbit", azimuthDeg: 0, distance: 25, height: 1.7, target: "screen" },
  },
  {
    id: "conducteur",
    label: "Conducteur",
    description: "Depuis un véhicule (1,2 m), à 60 m, légèrement décalé.",
    key: "3",
    icon: "car",
    def: { kind: "orbit", azimuthDeg: 0, distance: 60, height: 1.2, target: "screen", lateral: 4 },
  },
  {
    id: "drone",
    label: "Drone",
    description: "Vue aérienne oblique du Porteur et de son environnement.",
    key: "4",
    icon: "drone",
    def: {
      kind: "orbit",
      azimuthDeg: 52,
      distance: { h: 1.9 },
      height: { h: 1.45 },
      target: { y: { h: 0.38 } },
    },
  },
  {
    id: "face",
    label: "Face écran",
    description: "Vue frontale cadrée sur l'écran.",
    key: "5",
    icon: "face",
    def: {
      kind: "orbit",
      azimuthDeg: 0,
      distance: "fit-screen",
      height: "target",
      target: "screen",
    },
  },
];

export const CAMERA_PRESET_IDS: readonly CameraPresetId[] = CAMERA_PRESETS.map((p) => p.id);

export function getCameraPreset(id: CameraPresetId): CameraPreset {
  return CAMERA_PRESETS.find((p) => p.id === id) ?? (CAMERA_PRESETS[0] as CameraPreset);
}

/** Keyboard shortcut → preset id ("1"…"5", also numpad via `event.key`). */
export function presetIdForKey(key: string): CameraPresetId | null {
  return CAMERA_PRESETS.find((p) => p.key === key)?.id ?? null;
}

export interface PresetFrame {
  dims: PorteurDimensions;
  headingDeg: number | null | undefined;
  face?: StudioFace;
  fovDeg?: number;
  /** Viewport width / height (used by "fit-screen"). */
  viewAspect?: number;
  /** Local screen centre from a GLB Hotspot_ecran, overrides the procedural value. */
  screenCenter?: Vec3Tuple | null;
}

export interface ResolvedView {
  position: Vec3Tuple;
  target: Vec3Tuple;
}

function length(value: Length, heightM: number): number {
  return typeof value === "number" ? value : value.h * heightM;
}

/** Local centre of the main display (or of the equipment for type D). */
export function screenFocus(dims: PorteurDimensions): {
  center: Vec3Tuple;
  width: number;
  height: number;
} {
  const s = dims.screen;
  if (s?.kind === "band") {
    return { center: [0, s.centerY, -s.radius], width: s.radius * 2, height: s.height };
  }
  if (s?.kind === "panel") {
    return { center: [0, s.centerY, -s.offset], width: s.width, height: s.height };
  }
  const cab = dims.sensorCabinet;
  if (cab) {
    return {
      center: [0, cab.centerY, -(dims.mastBaseRadius + cab.depth)],
      width: 2.4,
      height: 3.2,
    };
  }
  return { center: [0, dims.heightM * 0.4, 0], width: 3, height: 4 };
}

function resolveLocal(def: CameraPresetDef, frame: PresetFrame): ResolvedView {
  const { dims } = frame;
  const H = dims.heightM;
  if (def.kind === "fixed") {
    const k = def.referenceHeightM > 0 ? H / def.referenceHeightM : 1;
    return {
      position: [def.position[0] * k, def.position[1] * k, def.position[2] * k],
      target: [def.target[0] * k, def.target[1] * k, def.target[2] * k],
    };
  }

  const focus = screenFocus(dims);
  const screenCenter = frame.screenCenter ?? focus.center;
  let target: Vec3Tuple;
  if (def.target === "screen") target = screenCenter;
  else if (def.target === "sphere") target = [0, dims.sphereY, 0];
  else if (def.target === "mast") target = [0, H * 0.5, 0];
  else target = [0, length(def.target.y, H), 0];

  let distance: number;
  if (def.distance === "fit-screen") {
    const fov = (frame.fovDeg ?? SCENE_CONFIG.camera.fovDeg) * DEG;
    const aspect = frame.viewAspect && frame.viewAspect > 0 ? frame.viewAspect : 16 / 10;
    const needH = Math.max(focus.height, focus.width / aspect) * 1.6;
    distance = needH / 2 / Math.tan(fov / 2);
  } else {
    distance = length(def.distance, H);
  }

  const y = def.height === "target" ? target[1] : length(def.height, H);
  const az = def.azimuthDeg * DEG;
  // Azimuth 0 = in front of the −Z face; positive azimuth moves the camera to the viewer's right,
  // which is −X for a viewer looking at the −Z face.
  const lateral = def.lateral ?? 0;
  const position: Vec3Tuple = [
    target[0] - Math.sin(az) * distance - lateral,
    Math.max(SCENE_CONFIG.controls.minCameraY, y),
    target[2] - Math.cos(az) * distance,
  ];
  return { position, target };
}

/** Resolve a preset to world-space camera position/target (heading and selected face applied). */
export function resolveCameraPreset(
  preset: CameraPresetId | CameraPresetDef,
  frame: PresetFrame,
): ResolvedView {
  const def = typeof preset === "string" ? getCameraPreset(preset).def : preset;
  const local = resolveLocal(def, frame);
  // Face 2 of a double-face Porteur is the opposite side: rotate the local view by 180°.
  const flip =
    frame.face === 2 && frame.dims.screen?.kind === "panel" && frame.dims.screen.faces.length > 1;
  const f = (v: Vec3Tuple): Vec3Tuple => (flip ? [-v[0], v[1], -v[2]] : v);
  return {
    position: localToWorld(f(local.position), frame.headingDeg),
    target: localToWorld(f(local.target), frame.headingDeg),
  };
}

/** Convenience for callers that only know the Porteur record. */
export function resolvePresetFor(
  id: CameraPresetId,
  type: StudioPorteurType,
  mastHeightM: number | null | undefined,
  headingDeg: number | null | undefined,
  face: StudioFace = "all",
): ResolvedView {
  return resolveCameraPreset(id, {
    dims: computePorteurDimensions(type, resolveMastHeight(mastHeightM)),
    headingDeg,
    face,
  });
}

// ---------------------------------------------------------------------------------------------
// Faces

export interface FaceOption {
  value: StudioFace;
  label: string;
}

/** Face choices shown by the controls, per type (A: 360°, B: les deux / 1 / 2, C: unique, D: none). */
export function faceOptionsFor(type: StudioPorteurType): FaceOption[] {
  switch (type) {
    case "A":
      return [{ value: "all", label: "360°" }];
    case "B":
      return [
        { value: "all", label: "Les deux" },
        { value: 1, label: "Face 1" },
        { value: 2, label: "Face 2" },
      ];
    case "C":
      return [{ value: "all", label: "Face unique" }];
    case "D":
      return [];
  }
}

/** Normalises a requested face for a type (only B honours 1/2). */
export function effectiveFace(type: StudioPorteurType, face: StudioFace | undefined): StudioFace {
  return type === "B" && (face === 1 || face === 2) ? face : "all";
}

// ---------------------------------------------------------------------------------------------
// Hotspots (French copy: design intention, no power/energy figures)

export const DESIGN_INTENTION_MENTION =
  "Intention de conception : ces caractéristiques décrivent le Porteur tel qu'il est conçu, pas des performances constatées.";

export interface HotspotCopy {
  id: HotspotId;
  /** Accessible short name of the point (« Écran »). */
  label: string;
  title: string;
  body: string;
  /** Camera framing used when the hotspot is focused. */
  focus: { distance: Length; azimuthDeg: number; heightOffset: number };
}

const TYPE_SCREEN_COPY: Record<Exclude<StudioPorteurType, "D">, { title: string; body: string }> = {
  A: {
    title: "Écran panoramique 360°",
    body: "Un affichage courbe enroulé autour du mât, pensé pour être lisible depuis chaque direction d'approche d'un rond-point ou d'une place. C'est la fonction écran du Porteur, exploitée par TPUB.",
  },
  B: {
    title: "Double face",
    body: "Deux écrans verticaux dos à dos, un par sens de circulation, dimensionnés pour une lecture à distance sur les grands axes. La réservation porte sur l'écran complet du Porteur.",
  },
  C: {
    title: "Écran à hauteur des yeux",
    body: "Un écran vertical unique placé à hauteur des yeux, à l'échelle des piétons, avec une emprise au sol réduite sur le trottoir.",
  },
};

export function getHotspots(type: StudioPorteurType, mastHeightM?: number | null): HotspotCopy[] {
  const declared = typeof mastHeightM === "number" && Number.isFinite(mastHeightM);
  const H = resolveMastHeight(mastHeightM);
  const heightLine = declared
    ? `Hauteur déclarée pour ce Porteur : ${formatMetresShort(H)}.`
    : `Hauteur non déclarée : la maquette utilise ${formatMetresShort(H)} par défaut.`;
  const list: HotspotCopy[] = [];
  if (type !== "D") {
    const copy = TYPE_SCREEN_COPY[type];
    list.push({
      id: "ecran",
      label: "Écran",
      title: copy.title,
      body: copy.body,
      focus: { distance: type === "C" ? 6 : { h: 0.55 }, azimuthDeg: 12, heightOffset: 0 },
    });
  }
  list.push(
    {
      id: "sphere",
      label: "Sphère énergie",
      title: "Sphère énergie",
      body: "Au sommet, des coques cuivrées et bleu nuit en rotation continue : la turbine éolienne sphérique, pensée comme le cœur du Porteur. Elle complète les panneaux solaires dans une source d'énergie hybride.",
      focus: { distance: { h: 0.4 }, azimuthDeg: 30, heightOffset: -0.5 },
    },
    {
      id: "solaire",
      label: "Panneaux solaires",
      title: "Panneaux solaires",
      body: "Des capteurs photovoltaïques inclinés, portés par des bras triangulaires, conçus pour alimenter le Porteur de façon autonome avec la sphère éolienne (énergie hybride solaire et éolienne).",
      focus: { distance: { h: 0.5 }, azimuthDeg: 55, heightOffset: 1.5 },
    },
    {
      id: "capteurs",
      label: "Capteurs et connectivité",
      title: "Capteurs et connectivité",
      body:
        type === "D"
          ? "Sans écran, le Porteur reste une infrastructure : connectivité, météo, énergie et supervision à distance, là où il n'y a pas d'audience à servir. Pas d'inventaire publicitaire TPUB."
          : "Connectivité, météo, supervision, stockage et contrôle : des fonctions partagées avec l'écran, conçues pour remonter son état et journaliser chaque diffusion.",
      focus: { distance: type === "D" ? 7 : { h: 0.35 }, azimuthDeg: 40, heightOffset: 0 },
    },
    {
      id: "mat",
      label: "Mât",
      title: "Mât cannelé",
      body: `Une structure verticale en aluminium cannelé, pensée pour l'extérieur urbain, avec des bandeaux lumineux intégrés. ${heightLine}`,
      focus: { distance: { h: 0.9 }, azimuthDeg: 60, heightOffset: 0 },
    },
    {
      id: "base",
      label: "Socle",
      title: "Socle",
      body: "Un socle cylindrique robuste ancré au sol : la stabilité et l'ancrage du Porteur, avec une emprise pensée pour son emplacement.",
      focus: { distance: 7, azimuthDeg: 35, heightOffset: 1.2 },
    },
  );
  return list;
}

/**
 * Camera framing for a focused hotspot: look at the local anchor from along its outward normal,
 * rotated by the hotspot azimuth. Returns world coordinates.
 */
export function resolveHotspotFocus(
  focus: HotspotCopy["focus"],
  anchor: { position: Vec3Tuple; normal: Vec3Tuple },
  frame: Pick<PresetFrame, "dims" | "headingDeg">,
): ResolvedView {
  const H = frame.dims.heightM;
  const dist = Math.max(SCENE_CONFIG.controls.minDistance + 0.5, length(focus.distance, H));
  const nx = anchor.normal[0];
  const nz = anchor.normal[2];
  const len = Math.hypot(nx, nz) || 1;
  const a = focus.azimuthDeg * DEG;
  // Rotate the horizontal normal around Y by the azimuth.
  const dx = (nx / len) * Math.cos(a) + (nz / len) * Math.sin(a);
  const dz = -(nx / len) * Math.sin(a) + (nz / len) * Math.cos(a);
  const p = anchor.position;
  const position: Vec3Tuple = [
    p[0] + dx * dist,
    Math.max(SCENE_CONFIG.controls.minCameraY, p[1] + focus.heightOffset),
    p[2] + dz * dist,
  ];
  return {
    position: localToWorld(position, frame.headingDeg),
    target: localToWorld(p, frame.headingDeg),
  };
}

/** « 20 m », « 17,5 m ». */
export function formatMetresShort(value: number): string {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value)} m`;
}

export const PORTEUR_TYPE_LABELS: Record<StudioPorteurType, string> = {
  A: "Écran panoramique 360°",
  B: "Double face",
  C: "Écran à hauteur des yeux",
  D: "Infrastructure sans écran",
};

export const TIME_OF_DAY_LABELS: Record<"jour" | "nuit", string> = { jour: "Jour", nuit: "Nuit" };
