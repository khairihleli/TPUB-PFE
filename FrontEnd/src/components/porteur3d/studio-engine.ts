/**
 * Imperative three.js engine of the Studio 3D (plain three.js, no react-three-fiber).
 *
 * - Render on demand: a frame is drawn only while the user interacts, a tween runs, or ambient
 *   animation is active (sphere rotation, default creative, video) — ambient frames are throttled
 *   and fully stopped under reduced motion.
 * - Paused when the tab is hidden or the canvas is off-screen.
 * - Owns its <canvas> (created/removed here) so a disposed context never leaks into a remount.
 * - DOM overlays (hotspot buttons, repère labels) are registered by key and positioned here each
 *   frame by writing `transform` directly (no React re-render per frame).
 */
import {
  ACESFilmicToneMapping,
  Group,
  MathUtils,
  Mesh,
  type MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import { CreativeController } from "@/components/porteur3d/creative-texture";
import { lightingFor } from "@/components/porteur3d/lighting";
import {
  computePorteurDimensions,
  type HotspotAnchor,
  type PorteurDimensions,
} from "@/components/porteur3d/porteur-dimensions";
import { loadPorteurModel, type LoadedPorteur } from "@/components/porteur3d/porteur-model";
import { facingFactor, projectToScreen } from "@/components/porteur3d/projection";
import { createRepereObjects, type RepereObjects } from "@/components/porteur3d/repere-objects";
import {
  SCENE_CONFIG,
  effectiveFace,
  getHotspots,
  headingToRotationY,
  localToWorld,
  resolveCameraPreset,
  resolveHotspotFocus,
  worldToLocal,
} from "@/components/porteur3d/scene-config";
import {
  createEnvironment,
  type StudioEnvironment,
} from "@/components/porteur3d/scene-environment";
import {
  easeInOutCubic,
  interpolateView,
  tweenDuration,
  type ViewState,
} from "@/components/porteur3d/tween";
import type {
  CameraPresetId,
  CameraReadout,
  HotspotId,
  ModelInfo,
  StudioCreative,
  StudioFace,
  StudioPorteurType,
  TimeOfDay,
  Vec3Tuple,
} from "@/components/porteur3d/types";

export interface StudioEngineState {
  type: StudioPorteurType;
  mastHeightM: number | null | undefined;
  headingDeg: number | null | undefined;
  timeOfDay: TimeOfDay;
  face: StudioFace;
  creative: StudioCreative | null;
  view: CameraPresetId;
  repere: boolean;
  reducedMotion: boolean;
}

export interface StudioEngineCallbacks {
  onLoadingChange(loading: boolean): void;
  onModelReady(info: ModelInfo): void;
  /** First frame rendered with a model. */
  onFirstFrame(): void;
  onCameraReadout(readout: CameraReadout): void;
  onCreativeError(message: string): void;
  onContextLost(): void;
}

interface Tween {
  from: ViewState;
  to: ViewState;
  start: number;
  duration: number;
}

interface OverlayAnchor {
  world: Vector3;
  normal: Vec3Tuple | null;
}

/** Throws when WebGL cannot be created (the caller renders the static fallback). */
export class StudioEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly pivot = new Group();
  private readonly creative: CreativeController;
  private readonly envTexture: { dispose(): void };

  private env: StudioEnvironment | null = null;
  private model: LoadedPorteur | null = null;
  private dims: PorteurDimensions;
  private repere: RepereObjects | null = null;
  private ledMaterials: MeshStandardMaterial[] = [];

  private state: StudioEngineState;
  private raf = 0;
  private lastFrame = 0;
  private lastAmbientFrame = 0;
  private lastReadout = 0;
  private needsRender = true;
  private tween: Tween | null = null;
  private night: number;
  private nightTween: { from: number; to: number; start: number; duration: number } | null = null;
  private hidden = false;
  private offscreen = false;
  private interacting = false;
  private disposed = false;
  private firstFrameSent = false;
  private inFrame = false;
  private loadAbort: AbortController | null = null;
  private width = 1;
  private height = 1;

  private readonly overlays = new Map<string, HTMLElement>();
  private readonly overlayAnchors = new Map<string, OverlayAnchor>();
  private readonly resizeObserver: ResizeObserver | null;
  private readonly intersectionObserver: IntersectionObserver | null;

  constructor(
    private readonly host: HTMLElement,
    initial: StudioEngineState,
    private readonly callbacks: StudioEngineCallbacks,
  ) {
    this.state = { ...initial, face: effectiveFace(initial.type, initial.face) };
    this.dims = computePorteurDimensions(initial.type, initial.mastHeightM);
    this.night = initial.timeOfDay === "nuit" ? 1 : 0;

    this.canvas = document.createElement("canvas");
    this.canvas.className = "absolute inset-0 block size-full touch-none outline-none";
    this.canvas.setAttribute("aria-hidden", "true");
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    host.prepend(this.canvas);

    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, SCENE_CONFIG.renderer.maxPixelRatio),
    );
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    const pmrem = new PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    const envRT = pmrem.fromScene(room, 0.04);
    this.scene.environment = envRT.texture;
    this.envTexture = envRT;
    room.dispose();
    pmrem.dispose();

    const { fovDeg, near, far } = SCENE_CONFIG.camera;
    this.camera = new PerspectiveCamera(fovDeg, 1, near, far);
    this.scene.add(this.pivot);
    this.pivot.rotation.y = headingToRotationY(initial.headingDeg);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.configureControls();
    this.controls.addEventListener("start", this.onControlsStart);
    this.controls.addEventListener("end", this.onControlsEnd);
    this.controls.addEventListener("change", this.onControlsChange);

    this.creative = new CreativeController({
      reducedMotion: initial.reducedMotion,
      onUpdate: () => this.requestRender(),
      onError: (message) => this.callbacks.onCreativeError(message),
    });
    this.creative.prime(initial.creative);
    this.creative.setFace(this.state.face);

    this.buildEnvironment();
    this.applyNight(this.night);

    // Intro: start slightly wide and glide into the preset once the model is ready.
    const preset = this.presetView(initial.view);
    const intro = initial.reducedMotion ? preset : this.introView(preset);
    this.setView(intro);

    this.canvas.addEventListener("webglcontextlost", this.onContextLost, false);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.hidden = document.visibilityState === "hidden";

    this.resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(this.onResize) : null;
    this.resizeObserver?.observe(host);
    this.intersectionObserver =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              const entry = entries[entries.length - 1];
              this.offscreen = entry ? !entry.isIntersecting : false;
              if (!this.offscreen) this.requestRender();
            },
            { threshold: 0.01 },
          )
        : null;
    this.intersectionObserver?.observe(host);
    this.onResize();

    void this.loadModel();
  }

  // -------------------------------------------------------------------------------------------
  // Public API

  update(next: Partial<StudioEngineState>): void {
    if (this.disposed) return;
    const prev = this.state;
    const merged: StudioEngineState = { ...prev, ...next };
    merged.face = effectiveFace(merged.type, merged.face);
    this.state = merged;

    if (merged.reducedMotion !== prev.reducedMotion) {
      this.creative.setReducedMotion(merged.reducedMotion);
    }
    const modelChanged = merged.type !== prev.type || merged.mastHeightM !== prev.mastHeightM;
    if (modelChanged) {
      this.dims = computePorteurDimensions(merged.type, merged.mastHeightM);
      this.configureControls();
      this.buildEnvironment();
      this.applyNight(this.night);
      void this.loadModel();
    }
    if (merged.headingDeg !== prev.headingDeg) {
      this.pivot.rotation.y = headingToRotationY(merged.headingDeg);
      this.pivot.updateMatrixWorld(true);
      this.refreshAnchors();
      if (!modelChanged) this.goToView(merged.view);
    }
    if (
      merged.creative?.url !== prev.creative?.url ||
      merged.creative?.kind !== prev.creative?.kind
    ) {
      void this.creative.setCreative(merged.creative);
    }
    if (merged.face !== prev.face) {
      this.creative.setFace(merged.face);
      if (merged.view === "face" && !modelChanged) this.goToView("face");
    }
    if (merged.timeOfDay !== prev.timeOfDay) {
      const to = merged.timeOfDay === "nuit" ? 1 : 0;
      if (merged.reducedMotion) {
        this.nightTween = null;
        this.applyNight(to);
      } else {
        this.nightTween = {
          from: this.night,
          to,
          start: performance.now(),
          duration: SCENE_CONFIG.timeOfDay.durationMs,
        };
      }
    }
    if (merged.view !== prev.view && !modelChanged) this.goToView(merged.view);
    if (merged.repere !== prev.repere) this.syncRepere();
    this.requestRender();
  }

  /** Tween (or jump, under reduced motion) to a preset. */
  goToView(id: CameraPresetId, instant = false): void {
    this.state = { ...this.state, view: id };
    this.animateTo(this.presetView(id), instant);
  }

  focusHotspot(id: HotspotId): void {
    const anchor = this.model?.anchors[id];
    const copy = getHotspots(this.state.type, this.state.mastHeightM).find((h) => h.id === id);
    if (!anchor || !copy) return;
    this.animateTo(
      resolveHotspotFocus(copy.focus, anchor, {
        dims: this.dims,
        headingDeg: this.state.headingDeg,
      }),
    );
  }

  /** Keyboard orbit: rotate the camera around the target (degrees). */
  orbitBy(deltaAzimuthDeg: number, deltaPolarDeg: number): void {
    this.tween = null;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const r = offset.length();
    let theta = Math.atan2(offset.x, offset.z) + MathUtils.degToRad(deltaAzimuthDeg);
    let phi = Math.acos(MathUtils.clamp(offset.y / r, -1, 1)) + MathUtils.degToRad(deltaPolarDeg);
    phi = MathUtils.clamp(phi, 0.05, MathUtils.degToRad(SCENE_CONFIG.controls.maxPolarAngleDeg));
    theta = Number.isFinite(theta) ? theta : 0;
    const target = this.controls.target;
    const to: ViewState = {
      position: [
        target.x + r * Math.sin(phi) * Math.sin(theta),
        target.y + r * Math.cos(phi),
        target.z + r * Math.sin(phi) * Math.cos(theta),
      ],
      target: [target.x, target.y, target.z],
    };
    this.animateTo(to, true);
  }

  /** Keyboard zoom: factor < 1 moves closer. */
  zoomBy(factor: number): void {
    const target = this.controls.target;
    const offset = this.camera.position.clone().sub(target);
    const len = MathUtils.clamp(
      offset.length() * factor,
      this.controls.minDistance,
      this.controls.maxDistance,
    );
    offset.setLength(len);
    this.animateTo(
      {
        position: [target.x + offset.x, target.y + offset.y, target.z + offset.z],
        target: [target.x, target.y, target.z],
      },
      true,
    );
  }

  registerOverlay(key: string, el: HTMLElement | null): void {
    if (el) this.overlays.set(key, el);
    else this.overlays.delete(key);
    this.requestRender();
  }

  getReadout(): CameraReadout {
    const p = this.camera.position;
    const t = this.controls.target;
    const position: Vec3Tuple = [p.x, p.y, p.z];
    const target: Vec3Tuple = [t.x, t.y, t.z];
    return {
      position,
      target,
      localPosition: worldToLocal(position, this.state.headingDeg),
      localTarget: worldToLocal(target, this.state.headingDeg),
    };
  }

  get heightM(): number {
    return this.dims.heightM;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.loadAbort?.abort();
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost, false);
    this.controls.removeEventListener("start", this.onControlsStart);
    this.controls.removeEventListener("end", this.onControlsEnd);
    this.controls.removeEventListener("change", this.onControlsChange);
    this.controls.dispose();
    this.creative.dispose();
    this.model?.dispose();
    this.model = null;
    this.repere?.dispose();
    this.repere = null;
    this.env?.dispose();
    this.env = null;
    this.envTexture.dispose();
    this.scene.clear();
    this.overlays.clear();
    this.overlayAnchors.clear();
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }

  // -------------------------------------------------------------------------------------------
  // Scene building

  private configureControls(): void {
    const c = SCENE_CONFIG.controls;
    const H = this.dims.heightM;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = c.dampingFactor;
    this.controls.minDistance = c.minDistance;
    this.controls.maxDistance = Math.max(c.maxDistanceMin, H * c.maxDistanceFactor);
    this.controls.maxPolarAngle = MathUtils.degToRad(c.maxPolarAngleDeg);
    this.controls.screenSpacePanning = true;
    this.controls.cursor.set(0, H * 0.5, 0);
    this.controls.maxTargetRadius = Math.max(c.maxTargetRadius, H * 0.8);
    this.controls.zoomToCursor = false;
  }

  private buildEnvironment(): void {
    if (this.env) {
      this.scene.remove(this.env.world);
      this.pivot.remove(this.env.context);
      this.env.dispose();
    }
    this.env = createEnvironment(this.state.type, this.dims);
    this.scene.add(this.env.world);
    this.pivot.add(this.env.context);
    this.scene.fog = this.env.fog;
  }

  private async loadModel(): Promise<void> {
    this.loadAbort?.abort();
    const abort = new AbortController();
    this.loadAbort = abort;
    this.callbacks.onLoadingChange(true);
    let loaded: LoadedPorteur;
    try {
      loaded = await loadPorteurModel({
        type: this.state.type,
        mastHeightM: this.state.mastHeightM,
        renderer: this.renderer,
        signal: abort.signal,
      });
    } catch {
      return; // aborted by a newer load or disposal
    }
    if (this.disposed || abort.signal.aborted) {
      loaded.dispose();
      return;
    }
    if (this.model) {
      this.pivot.remove(this.model.root);
      this.model.dispose();
    }
    this.model = loaded;
    this.dims = loaded.dims;
    this.pivot.add(loaded.root);
    this.pivot.updateMatrixWorld(true);

    this.ledMaterials = [];
    loaded.root.traverse((obj) => {
      if (obj instanceof Mesh) {
        const m = obj.material as MeshStandardMaterial;
        if (m.name === "M_Led" && !this.ledMaterials.includes(m)) this.ledMaterials.push(m);
      }
    });
    this.creative.setSurfaces(loaded.surfaces);
    this.creative.setFace(this.state.face);
    this.applyNight(this.night);
    this.refreshAnchors();
    this.syncRepere();

    const anchors: ModelInfo["anchors"] = {};
    for (const [id, a] of Object.entries(loaded.anchors) as [HotspotId, HotspotAnchor][])
      anchors[id] = a.position;
    this.callbacks.onModelReady({
      source: loaded.source,
      triangles: loaded.triangles,
      size: loaded.size,
      anchors,
      warnings: loaded.warnings,
    });
    this.callbacks.onLoadingChange(false);
    this.firstFrameSent = false;
    this.goToView(this.state.view);
    this.requestRender();
  }

  private syncRepere(): void {
    if (this.repere) {
      this.pivot.remove(this.repere.group);
      this.repere.dispose();
      this.repere = null;
    }
    if (this.state.repere && this.model) {
      this.repere = createRepereObjects(this.model.size, this.model.anchors);
      this.pivot.add(this.repere.group);
    }
    this.refreshAnchors();
    this.requestRender();
  }

  private refreshAnchors(): void {
    this.overlayAnchors.clear();
    this.pivot.updateMatrixWorld(true);
    const heading = this.state.headingDeg;
    for (const [id, a] of Object.entries(this.model?.anchors ?? {}) as [
      HotspotId,
      HotspotAnchor,
    ][]) {
      const world = new Vector3(...a.position);
      this.pivot.localToWorld(world);
      const normal = localToWorld(a.normal, heading);
      this.overlayAnchors.set(`hotspot:${id}`, { world, normal });
    }
    if (this.repere) {
      for (const [key, p] of Object.entries(this.repere.labels)) {
        if (key.startsWith("anchor:")) continue;
        this.overlayAnchors.set(key, {
          world: this.pivot.localToWorld(new Vector3(...p)),
          normal: null,
        });
      }
      for (const [id, a] of Object.entries(this.model?.anchors ?? {}) as [
        HotspotId,
        HotspotAnchor,
      ][]) {
        this.overlayAnchors.set(`anchor:${id}`, {
          world: this.pivot.localToWorld(new Vector3(...a.position)),
          normal: null,
        });
      }
    }
  }

  private applyNight(night: number): void {
    this.night = night;
    const values = lightingFor(night, this.dims.heightM);
    this.env?.apply(night, values);
    this.renderer.toneMappingExposure = values.exposure;
    this.scene.environmentIntensity = values.environmentIntensity;
    this.creative.setEmissive(values.screenEmissive);
    for (const m of this.ledMaterials) m.emissiveIntensity = values.ledStripEmissive;
    this.requestRender();
  }

  // -------------------------------------------------------------------------------------------
  // Camera

  private presetView(id: CameraPresetId): ViewState {
    return resolveCameraPreset(id, {
      dims: this.dims,
      headingDeg: this.state.headingDeg,
      face: this.state.face,
      viewAspect: this.width / Math.max(1, this.height),
    });
  }

  private introView(view: ViewState): ViewState {
    const [px, py, pz] = view.position;
    const [tx, , tz] = view.target;
    const k = 1.35;
    const a = MathUtils.degToRad(-14);
    const dx = (px - tx) * k;
    const dz = (pz - tz) * k;
    return {
      position: [
        tx + dx * Math.cos(a) - dz * Math.sin(a),
        py * 1.2 + 2,
        tz + dx * Math.sin(a) + dz * Math.cos(a),
      ],
      target: view.target,
    };
  }

  private setView(view: ViewState): void {
    this.camera.position.set(...view.position);
    this.controls.target.set(...view.target);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    this.requestRender();
  }

  private animateTo(to: ViewState, instant = false): void {
    const from: ViewState = {
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      target: [this.controls.target.x, this.controls.target.y, this.controls.target.z],
    };
    const duration = instant ? 0 : tweenDuration(from, to, this.state.reducedMotion);
    if (duration <= 0) {
      this.tween = null;
      this.setView(to);
      return;
    }
    this.tween = { from, to, start: performance.now(), duration };
    this.requestRender();
  }

  // -------------------------------------------------------------------------------------------
  // Loop

  requestRender = (): void => {
    this.needsRender = true;
    if (this.inFrame || this.disposed || this.raf || this.hidden || this.offscreen) return;
    this.raf = requestAnimationFrame(this.frame);
  };

  private ambientActive(): boolean {
    if (this.state.reducedMotion) return false;
    return (this.model?.index.energySpheres.length ?? 0) > 0 || this.creative.isAnimating();
  }

  private frame = (now: number): void => {
    this.raf = 0;
    if (this.disposed || this.hidden || this.offscreen) return;
    this.inFrame = true;
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;

    let active = this.needsRender || this.interacting;
    this.needsRender = false;

    if (this.tween) {
      const t = (now - this.tween.start) / this.tween.duration;
      if (t >= 1) {
        this.setView(this.tween.to);
        this.tween = null;
      } else {
        const v = interpolateView(this.tween.from, this.tween.to, t);
        this.camera.position.set(...v.position);
        this.controls.target.set(...v.target);
        this.camera.lookAt(this.controls.target);
      }
      active = true;
    } else if (this.controls.update(dt)) {
      active = true;
    }

    if (this.nightTween) {
      const t = (now - this.nightTween.start) / this.nightTween.duration;
      const k = easeInOutCubic(t);
      this.applyNight(this.nightTween.from + (this.nightTween.to - this.nightTween.from) * k);
      if (t >= 1) this.nightTween = null;
      active = true;
    }

    const ambient = this.ambientActive();
    const ambientDue =
      ambient && now - this.lastAmbientFrame >= 1000 / SCENE_CONFIG.renderer.ambientFps;
    if (ambient && (ambientDue || active)) {
      const adt = this.lastAmbientFrame ? Math.min(0.1, (now - this.lastAmbientFrame) / 1000) : 0;
      this.lastAmbientFrame = now;
      for (const sphere of this.model?.index.energySpheres ?? []) {
        sphere.rotation.y += adt * SCENE_CONFIG.sphere.radiansPerSecond;
      }
      this.creative.tick(now);
      active = true;
    }

    if (active) {
      this.clampCamera();
      this.renderer.render(this.scene, this.camera);
      this.positionOverlays();
      this.emitReadout(now);
      if (this.model && !this.firstFrameSent) {
        this.firstFrameSent = true;
        this.callbacks.onFirstFrame();
      }
    }

    this.inFrame = false;
    if (
      this.tween ||
      this.nightTween ||
      this.interacting ||
      ambient ||
      this.needsRender ||
      active
    ) {
      // Keep looping while something moves; damping settles within a few frames after `active`.
      this.raf = requestAnimationFrame(this.frame);
    }
  };

  private clampCamera(): void {
    const minY = SCENE_CONFIG.controls.minCameraY;
    if (this.camera.position.y < minY) this.camera.position.y = minY;
    const t = this.controls.target;
    const maxY = this.dims.heightM * 1.05;
    if (t.y < 0.2) t.y = 0.2;
    if (t.y > maxY) t.y = maxY;
  }

  private positionOverlays(): void {
    if (this.overlays.size === 0) return;
    this.camera.updateMatrixWorld();
    const cam: Vec3Tuple = [this.camera.position.x, this.camera.position.y, this.camera.position.z];
    for (const [key, el] of this.overlays) {
      const anchor = this.overlayAnchors.get(key);
      if (!anchor) {
        el.dataset.visible = "false";
        continue;
      }
      const p = projectToScreen(anchor.world, this.camera, this.width, this.height, 22);
      el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
      el.dataset.visible = "true";
      el.dataset.inView = String(p.inView);
      const facing = anchor.normal
        ? facingFactor([anchor.world.x, anchor.world.y, anchor.world.z], anchor.normal, cam)
        : 1;
      el.dataset.hiddenSide = String(facing < -0.2 || p.behind);
    }
  }

  private emitReadout(now: number): void {
    if (!this.state.repere || now - this.lastReadout < 140) return;
    this.lastReadout = now;
    this.callbacks.onCameraReadout(this.getReadout());
  }

  // -------------------------------------------------------------------------------------------
  // Events

  private onControlsStart = (): void => {
    this.tween = null;
    this.interacting = true;
    this.requestRender();
  };

  private onControlsEnd = (): void => {
    this.interacting = false;
    this.requestRender();
  };

  private onControlsChange = (): void => {
    this.requestRender();
  };

  private onVisibility = (): void => {
    this.hidden = document.visibilityState === "hidden";
    if (this.hidden) {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else {
      this.lastFrame = 0;
      this.requestRender();
    }
  };

  private onResize = (): void => {
    const rect = this.host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  };

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.callbacks.onContextLost();
  };
}
