/**
 * Screen content: the advertiser's creative (image → texture, video → VideoTexture, muted loop) or
 * the default animated TPUB canvas « VOTRE MESSAGE ICI » + « Aperçu ». One texture per screen
 * surface so each keeps its own UV transform (cover for panels, wrap for the 360° band).
 */
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  type MeshStandardMaterial,
  type Mesh,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  VideoTexture,
} from "three";

import { isFaceLit, type ScreenFace } from "@/components/porteur3d/glb-naming";
import { paletteRgba } from "@/components/porteur3d/studio-palette";
import {
  canvasSizeForAspect,
  coverUv,
  wrapBandUv,
  type UvTransform,
} from "@/components/porteur3d/texture-math";
import type { StudioCreative, StudioFace } from "@/components/porteur3d/types";

export interface CreativeSurface {
  mesh: Mesh;
  material: MeshStandardMaterial;
  face: ScreenFace;
  /** Unrolled width / height of the display. */
  aspect: number;
}

export interface CreativeControllerOptions {
  reducedMotion: boolean;
  /** Something changed on a texture: the engine should render a frame. */
  onUpdate(): void;
  onError(message: string): void;
}

const DEFAULT_FPS = 20;

function fontFamily(): string {
  if (typeof document === "undefined") return "sans-serif";
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-sora-var").trim();
  return v ? `${v}, Sora, system-ui, sans-serif` : "Sora, system-ui, sans-serif";
}

interface DefaultCanvas {
  ctx: CanvasRenderingContext2D;
  texture: CanvasTexture;
  band: boolean;
  grid: HTMLCanvasElement | null;
}

function createDefaultCanvas(aspect: number, band: boolean): DefaultCanvas | null {
  if (typeof document === "undefined") return null;
  const size = canvasSizeForAspect(aspect, band ? 1536 : 1024);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // Pre-rendered LED dot grid (drawn once, composited every frame).
  const gridCanvas = document.createElement("canvas");
  gridCanvas.width = size.width;
  gridCanvas.height = size.height;
  const g = gridCanvas.getContext("2d");
  if (g) {
    g.fillStyle = paletteRgba("creativeGround", 0.22);
    const step = Math.max(5, Math.round(size.height / 120));
    for (let y = 0; y < size.height; y += step) g.fillRect(0, y, size.width, 1);
    for (let x = 0; x < size.width; x += step) g.fillRect(x, 0, 1, size.height);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  if (band) texture.wrapS = RepeatWrapping;
  return { ctx, texture, band, grid: g ? gridCanvas : null };
}

/** Draws one frame of the default TPUB creative. `t` in seconds (0 when reduced motion). */
export function drawDefaultCreative(dc: DefaultCanvas, t: number): void {
  const { ctx } = dc;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const family = fontFamily();

  const bg = ctx.createLinearGradient(0, 0, w * 0.55, h * 1.15);
  bg.addColorStop(0, paletteRgba("creativeRedDeep", 1));
  bg.addColorStop(0.45, paletteRgba("creativeRed", 1));
  bg.addColorStop(1, paletteRgba("creativeGround", 1));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // The 360° band repeats the message three times: one full copy faces every approach direction.
  const copies = dc.band ? 3 : 1;
  const cw = w / copies;
  for (let i = 0; i < copies; i++) {
    const ox = i * cw;
    // Drifting orange energy blob.
    const bx = ox + cw * (0.78 + Math.sin(t * 0.45 + i) * 0.12);
    const by = h * (0.12 + Math.cos(t * 0.35 + i) * 0.08);
    const r = Math.max(cw, h) * 0.75;
    const blob = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    blob.addColorStop(0, paletteRgba("creativeOrange", 0.75));
    blob.addColorStop(1, paletteRgba("creativeOrange", 0));
    ctx.fillStyle = blob;
    ctx.fillRect(ox, 0, cw, h);
  }

  // Diagonal light sweep.
  const sweepX = (((t * 0.18) % 1.6) - 0.3) * w;
  const sweep = ctx.createLinearGradient(sweepX - w * 0.12, 0, sweepX + w * 0.12, h);
  sweep.addColorStop(0, paletteRgba("creativeInk", 0));
  sweep.addColorStop(0.5, paletteRgba("creativeInk", 0.1));
  sweep.addColorStop(1, paletteRgba("creativeInk", 0));
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, w, h);

  ctx.textBaseline = "alphabetic";
  for (let i = 0; i < copies; i++) {
    const ox = i * cw;
    const pad = Math.round(Math.min(cw, h) * 0.08);

    // « Aperçu » pill.
    const pillH = Math.round(Math.min(cw, h) * 0.075);
    ctx.font = `700 ${Math.round(pillH * 0.48)}px ${family}`;
    const label = "APERÇU";
    const tw = ctx.measureText(label).width;
    const pillW = tw + pillH * 1.5;
    ctx.fillStyle = paletteRgba("creativeGround", 0.55);
    roundRect(ctx, ox + pad, pad, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.fillStyle = paletteRgba("creativeBlue", 1);
    ctx.beginPath();
    ctx.arc(ox + pad + pillH * 0.45, pad + pillH / 2, pillH * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = paletteRgba("creativeInk", 0.92);
    ctx.fillText(label, ox + pad + pillH * 0.75, pad + pillH * 0.66);

    // Headline.
    ctx.fillStyle = paletteRgba("creativeInk", 1);
    if (dc.band) {
      // Centred, stacked and kept inside the middle of each copy: the part of the curved band
      // that faces the viewer stays readable without foreshortening.
      const lines = ["VOTRE", "MESSAGE", "ICI"];
      const size = fitFont(ctx, lines, cw * 0.72, Math.round(h * 0.16), family);
      const lineH = size * 1.02;
      const top = h * 0.5 - lineH * 0.62;
      ctx.textAlign = "center";
      lines.forEach((line, k) => ctx.fillText(line, ox + cw / 2, top + k * lineH));
      ctx.font = `600 ${Math.round(size * 0.3)}px ${family}`;
      ctx.fillStyle = paletteRgba("creativeInk", 0.8);
      ctx.fillText("TPUB · Maquette indicative", ox + cw / 2, top + lineH * 2.7);
      ctx.textAlign = "start";
    } else {
      const lines = ["VOTRE", "MESSAGE", "ICI"];
      const size = fitFont(ctx, lines, cw - pad * 2, Math.round(cw * 0.2), family);
      const startY = h - pad - size * 0.9 - (lines.length - 1) * size * 1.02;
      lines.forEach((line, k) => ctx.fillText(line, ox + pad, startY + k * size * 1.02));
      ctx.font = `600 ${Math.round(size * 0.26)}px ${family}`;
      ctx.fillStyle = paletteRgba("creativeInk", 0.78);
      ctx.fillText("TPUB · Maquette indicative", ox + pad, h - pad);
    }
  }

  if (dc.grid) ctx.drawImage(dc.grid, 0, 0);
  dc.texture.needsUpdate = true;
}

/** Largest bold size (≤ start) at which every line fits `maxWidth`; leaves ctx.font set. */
function fitFont(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  maxWidth: number,
  start: number,
  family: string,
): number {
  let size = start;
  for (let i = 0; i < 12; i++) {
    ctx.font = `800 ${size}px ${family}`;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (widest <= maxWidth) break;
    size = Math.max(8, Math.floor(size * Math.max(0.6, maxWidth / widest)));
  }
  ctx.font = `800 ${size}px ${family}`;
  return size;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

function applyUv(texture: Texture, uv: UvTransform, band: boolean): void {
  texture.wrapS = band ? RepeatWrapping : ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.repeat.set(uv.repeatX, uv.repeatY);
  texture.offset.set(uv.offsetX, uv.offsetY);
  texture.needsUpdate = true;
}

function mediaAspect(texture: Texture): number {
  const img = texture.image as {
    width?: number;
    height?: number;
    videoWidth?: number;
    videoHeight?: number;
  } | null;
  const w = img?.videoWidth || img?.width || 0;
  const h = img?.videoHeight || img?.height || 0;
  return w > 0 && h > 0 ? w / h : 16 / 9;
}

export class CreativeController {
  private surfaces: CreativeSurface[] = [];
  private defaults: DefaultCanvas[] = [];
  private mediaTextures: Texture[] = [];
  private video: HTMLVideoElement | null = null;
  private creative: StudioCreative | null = null;
  private face: StudioFace = "all";
  private emissive = 1;
  private lastDraw = -Infinity;
  private loadToken = 0;
  private disposed = false;
  private readonly startedAt = typeof performance !== "undefined" ? performance.now() : 0;

  constructor(private options: CreativeControllerOptions) {}

  setReducedMotion(reduced: boolean): void {
    this.options = { ...this.options, reducedMotion: reduced };
    if (this.video) {
      if (reduced) this.video.pause();
      else void this.video.play().catch(() => undefined);
    }
    this.redrawDefaults(0);
  }

  /** Remember the creative without loading it (no screens bound yet). */
  prime(creative: StudioCreative | null): void {
    this.creative = creative;
  }

  /** (Re)bind screens, e.g. after a model swap. Keeps the current creative. */
  setSurfaces(surfaces: CreativeSurface[]): void {
    this.surfaces = surfaces;
    void this.setCreative(this.creative, true);
  }

  setFace(face: StudioFace): void {
    this.face = face;
    this.applyIntensity();
  }

  /** Night/day screen brightness multiplier. */
  setEmissive(multiplier: number): void {
    this.emissive = multiplier;
    this.applyIntensity();
  }

  async setCreative(creative: StudioCreative | null, force = false): Promise<void> {
    const same =
      !force &&
      creative?.url === this.creative?.url &&
      creative?.kind === this.creative?.kind &&
      (creative !== null || this.defaults.length > 0);
    this.creative = creative;
    if (same) return;
    const token = ++this.loadToken;
    if (!creative) {
      this.releaseMedia();
      this.useDefaults();
      return;
    }
    try {
      const loaded =
        creative.kind === "video"
          ? await this.loadVideo(creative.url)
          : { texture: await this.loadImage(creative.url), video: null };
      const base = loaded.texture;
      if (token !== this.loadToken || this.disposed) {
        base.dispose();
        if (loaded.video) this.stopVideo(loaded.video);
        return;
      }
      this.releaseMedia();
      this.releaseDefaults();
      this.video = loaded.video;
      this.mediaTextures = this.surfaces.map((s, i) => {
        const tex = i === 0 ? base : base.clone();
        tex.colorSpace = SRGBColorSpace;
        const band = s.face === "360";
        const uv = band
          ? wrapBandUv(mediaAspect(base), s.aspect)
          : coverUv(mediaAspect(base), s.aspect);
        applyUv(tex, uv, band);
        s.material.emissiveMap = tex;
        s.material.needsUpdate = true;
        return tex;
      });
      if (this.surfaces.length === 0) base.dispose();
      this.applyIntensity();
      this.options.onUpdate();
    } catch {
      if (token !== this.loadToken || this.disposed) return;
      this.options.onError("Le visuel n'a pas pu être lu : l'aperçu par défaut est affiché.");
      this.releaseMedia();
      this.useDefaults();
    }
  }

  /** Advance the default animation. Returns true when a texture changed (render needed). */
  tick(now: number): boolean {
    if (this.options.reducedMotion || this.defaults.length === 0) return false;
    if (now - this.lastDraw < 1000 / DEFAULT_FPS) return false;
    this.lastDraw = now;
    this.redrawDefaults((now - this.startedAt) / 1000);
    return true;
  }

  /** Whether continuous rendering is needed for the screen content. */
  isAnimating(): boolean {
    if (this.options.reducedMotion) return false;
    if (this.video) return !this.video.paused;
    return this.defaults.length > 0;
  }

  private redrawDefaults(t: number): void {
    for (const dc of this.defaults) drawDefaultCreative(dc, t);
    if (this.defaults.length > 0) this.options.onUpdate();
  }

  private useDefaults(): void {
    this.releaseDefaults();
    this.defaults = [];
    for (const s of this.surfaces) {
      const band = s.face === "360";
      const dc = createDefaultCanvas(s.aspect, band);
      if (!dc) continue;
      // Authored for the whole band (no tiling): u = 0.5 faces the main direction (−Z), which
      // is the centre of the middle copy.
      applyUv(dc.texture, { repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0 }, band);
      drawDefaultCreative(dc, 0);
      s.material.emissiveMap = dc.texture;
      s.material.needsUpdate = true;
      this.defaults.push(dc);
    }
    if (typeof document !== "undefined" && "fonts" in document) {
      void document.fonts.ready.then(() => {
        if (!this.disposed) this.redrawDefaults((performance.now() - this.startedAt) / 1000);
      });
    }
    this.applyIntensity();
    this.options.onUpdate();
  }

  private applyIntensity(): void {
    for (const s of this.surfaces) {
      const lit = isFaceLit(s.face, this.face);
      s.material.emissiveIntensity = this.emissive * (lit ? 1 : 0.14);
    }
    this.options.onUpdate();
  }

  private loadImage(url: string): Promise<Texture> {
    return new TextureLoader().loadAsync(url);
  }

  private loadVideo(url: string): Promise<{ texture: Texture; video: HTMLVideoElement }> {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.src = url;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      video.preload = "auto";
      const cleanup = () => {
        video.removeEventListener("loadeddata", onLoaded);
        video.removeEventListener("error", onError);
      };
      const onLoaded = () => {
        cleanup();
        const texture = new VideoTexture(video);
        if (this.options.reducedMotion) {
          video.pause();
          video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
          video.addEventListener(
            "seeked",
            () => {
              texture.needsUpdate = true;
              this.options.onUpdate();
            },
            { once: true },
          );
        } else {
          void video.play().catch(() => undefined);
        }
        resolve({ texture, video });
      };
      const onError = () => {
        cleanup();
        reject(new Error("video"));
      };
      video.addEventListener("loadeddata", onLoaded);
      video.addEventListener("error", onError);
      video.load();
    });
  }

  private releaseDefaults(): void {
    for (const dc of this.defaults) dc.texture.dispose();
    this.defaults = [];
  }

  private releaseMedia(): void {
    for (const t of this.mediaTextures) t.dispose();
    this.mediaTextures = [];
    if (this.video) this.stopVideo(this.video);
  }

  private stopVideo(video: HTMLVideoElement): void {
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (this.video === video) this.video = null;
  }

  dispose(): void {
    this.disposed = true;
    this.loadToken++;
    this.releaseDefaults();
    for (const t of this.mediaTextures) t.dispose();
    this.mediaTextures = [];
    if (this.video) this.stopVideo(this.video);
    for (const s of this.surfaces) s.material.emissiveMap = null;
    this.surfaces = [];
  }
}
