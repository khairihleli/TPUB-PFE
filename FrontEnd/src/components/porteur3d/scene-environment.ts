/**
 * Procedural surroundings of the studio: sky gradient, stars, fog, lights and a Tunisian urban
 * context per Porteur type (A roundabout, B dual carriageway, C sidewalk street, D open ground).
 *
 * `world` is fixed (sky, sun, stars). `context` follows the Porteur heading (the engine adds it to
 * the heading pivot) so roads run along the direction the screens face.
 * The Porteur always stands on y = 0; roads sit slightly lower behind a curb.
 */
import {
  BackSide,
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  type Material,
  type Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  RepeatWrapping,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  BufferGeometry as ThreeBufferGeometry,
  Vector3,
} from "three";

import type { LightingValues } from "@/components/porteur3d/lighting";
import { sunDirection } from "@/components/porteur3d/lighting";
import { disposeObject3D } from "@/components/porteur3d/model-index";
import type { PorteurDimensions } from "@/components/porteur3d/porteur-dimensions";
import { createRng } from "@/components/porteur3d/random";
import {
  paletteInt,
  paletteRgba,
  type StudioColorName,
} from "@/components/porteur3d/studio-palette";
import type { StudioPorteurType } from "@/components/porteur3d/types";

export interface StudioEnvironment {
  world: Group;
  context: Group;
  fog: Fog;
  sun: DirectionalLight;
  /** Night street lights (intensity 0 during the day). */
  streetLights: PointLight[];
  /** Warm glow cast by the screen on the ground at night. */
  screenSpill: PointLight | null;
  apply(night: number, values: LightingValues): void;
  /** Keep the shadow frustum centred on what the camera looks at. */
  followTarget(x: number, z: number): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------------------------
// Small builders

function std(color: StudioColorName, roughness = 0.9, metalness = 0): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: paletteInt(color), roughness, metalness });
}

function flat(geometry: BufferGeometry, material: Material, name: string, y: number): Mesh {
  const m = new Mesh(geometry, material);
  m.name = name;
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

/** Axis-aligned slab (x/z extents) with top at `top` and `thickness`. */
function slab(
  material: Material,
  name: string,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  top: number,
  thickness = 0.2,
): Mesh {
  const m = new Mesh(new BoxGeometry(Math.abs(x1 - x0), thickness, Math.abs(z1 - z0)), material);
  m.name = name;
  m.position.set((x0 + x1) / 2, top - thickness / 2, (z0 + z1) / 2);
  m.receiveShadow = true;
  return m;
}

function instanced(
  geometry: BufferGeometry,
  material: Material,
  matrices: Matrix4[],
  name: string,
  castShadow = false,
): InstancedMesh | null {
  if (matrices.length === 0) {
    geometry.dispose();
    return null;
  }
  const im = new InstancedMesh(geometry, material, matrices.length);
  im.name = name;
  matrices.forEach((m, i) => im.setMatrixAt(i, m));
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = castShadow;
  im.receiveShadow = true;
  return im;
}

const tmpObj = new Object3D();
function matrixAt(x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1): Matrix4 {
  tmpObj.position.set(x, y, z);
  tmpObj.rotation.set(0, ry, 0);
  tmpObj.scale.set(sx, sy, sz);
  tmpObj.updateMatrix();
  return tmpObj.matrix.clone();
}

function canvas(width: number, height: number): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  try {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c.getContext("2d");
  } catch {
    return null;
  }
}

/** Facade texture (whitewashed or ochre walls, blue shutters) + matching night glow map. */
function facadeTextures(
  wall: StudioColorName,
  seed: number,
): { map: CanvasTexture | null; glow: CanvasTexture | null } {
  const size = 256;
  const ctx = canvas(size, size);
  const glowCtx = canvas(size, size);
  if (!ctx || !glowCtx) return { map: null, glow: null };
  const rng = createRng(seed);
  ctx.fillStyle = paletteRgba(wall, 1);
  ctx.fillRect(0, 0, size, size);
  glowCtx.fillStyle = paletteRgba("windowDark", 1);
  glowCtx.fillRect(0, 0, size, size);
  const cols = 2;
  const rows = 2;
  const cw = size / cols;
  const rh = size / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw + cw * 0.28;
      const y = r * rh + rh * 0.22;
      const w = cw * 0.44;
      const h = rh * 0.56;
      ctx.fillStyle = paletteRgba("windowDark", 0.92);
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = paletteRgba("shutterBlue", 1);
      ctx.fillRect(x - w * 0.34, y, w * 0.3, h);
      ctx.fillRect(x + w * 1.04, y, w * 0.3, h);
      if (rng() > 0.45) {
        glowCtx.fillStyle = paletteRgba("windowLit", 0.55 + rng() * 0.45);
        glowCtx.fillRect(x, y, w, h);
      }
    }
  }
  const map = new CanvasTexture(ctx.canvas);
  const glow = new CanvasTexture(glowCtx.canvas);
  for (const t of [map, glow]) {
    t.colorSpace = SRGBColorSpace;
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
  }
  return { map, glow };
}

interface Facades {
  white: MeshStandardMaterial;
  ochre: MeshStandardMaterial;
  roof: MeshStandardMaterial;
  textures: CanvasTexture[];
}

function createFacades(): Facades {
  const w = facadeTextures("wallWhite", 7);
  const o = facadeTextures("wallOchre", 11);
  const make = (
    tex: { map: CanvasTexture | null; glow: CanvasTexture | null },
    color: StudioColorName,
  ) =>
    new MeshStandardMaterial({
      color: tex.map ? paletteInt("white") : paletteInt(color),
      map: tex.map,
      emissive: paletteInt("white"),
      emissiveMap: tex.glow,
      emissiveIntensity: 0,
      roughness: 0.85,
    });
  return {
    white: make(w, "wallWhite"),
    ochre: make(o, "wallOchre"),
    roof: std("paving", 0.95),
    textures: [w.map, w.glow, o.map, o.glow].filter((t): t is CanvasTexture => t !== null),
  };
}

/** Box building with facade UVs scaled to ~3,5 m window bays (2 × 2 per tile); plain roofs. */
function building(
  f: Facades,
  x: number,
  z: number,
  w: number,
  h: number,
  d: number,
  ochre: boolean,
  ry = 0,
): Mesh {
  const geo = new BoxGeometry(w, h, d);
  const uv = geo.getAttribute("uv");
  const bay = 7;
  // Face order: +x, -x, +y, -y, +z, -z ; 4 vertices each.
  const scale = (face: number, su: number, sv: number) => {
    for (let i = face * 4; i < face * 4 + 4; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  };
  scale(0, d / bay, h / bay);
  scale(1, d / bay, h / bay);
  scale(4, w / bay, h / bay);
  scale(5, w / bay, h / bay);
  uv.needsUpdate = true;
  const wall = ochre ? f.ochre : f.white;
  const m = new Mesh(geo, [wall, wall, f.roof, f.roof, wall, wall]);
  m.name = "Context_Building";
  m.position.set(x, h / 2 - 0.2, z);
  m.rotation.y = ry;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

interface LampSet {
  group: Group;
  lights: PointLight[];
  lampMaterial: MeshStandardMaterial;
}

/** Street lamps at (x, z) positions; only the `maxLights` closest to the Porteur carry a light. */
function lamps(positions: [number, number, number][], height: number, maxLights = 4): LampSet {
  const group = new Group();
  group.name = "Context_Lamps";
  const poleMat = std("steelDark", 0.6, 0.6);
  const lampMaterial = new MeshStandardMaterial({
    color: paletteInt("streetLamp"),
    emissive: paletteInt("streetLamp"),
    emissiveIntensity: 0,
    roughness: 0.4,
  });
  const lights: PointLight[] = [];
  const sorted = [...positions].sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
  sorted.forEach(([x, z, ry], i) => {
    const lamp = new Group();
    lamp.position.set(x, 0, z);
    lamp.rotation.y = ry;
    const pole = new Mesh(new CylinderGeometry(0.07, 0.11, height, 10), poleMat);
    pole.position.y = height / 2;
    pole.castShadow = true;
    lamp.add(pole);
    const arm = new Mesh(new BoxGeometry(1.6, 0.08, 0.1), poleMat);
    arm.position.set(0.8, height - 0.1, 0);
    lamp.add(arm);
    const head = new Mesh(new BoxGeometry(0.6, 0.12, 0.3), lampMaterial);
    head.position.set(1.5, height - 0.2, 0);
    lamp.add(head);
    if (i < maxLights) {
      const light = new PointLight(paletteInt("streetLamp"), 0, 38, 2);
      light.position.set(1.5, height - 0.5, 0);
      lamp.add(light);
      lights.push(light);
    }
    group.add(lamp);
  });
  return { group, lights, lampMaterial };
}

function palm(
  x: number,
  z: number,
  h: number,
  trunkMat: Material,
  frondMat: Material,
  rng: () => number,
): Group {
  const g = new Group();
  g.position.set(x, 0, z);
  const trunk = new Mesh(new CylinderGeometry(0.14, 0.26, h, 8), trunkMat);
  trunk.position.y = h / 2;
  trunk.rotation.z = (rng() - 0.5) * 0.12;
  trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 8; i++) {
    const frond = new Mesh(new PlaneGeometry(0.7, 3.2), frondMat);
    const a = (i / 8) * Math.PI * 2 + rng() * 0.3;
    frond.position.set(Math.cos(a) * 1.2, h - 0.35, Math.sin(a) * 1.2);
    frond.rotation.set(-Math.PI / 2 + 0.55, -a + Math.PI / 2, 0, "YXZ");
    frond.castShadow = true;
    g.add(frond);
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
// Contexts

interface ContextBuild {
  group: Group;
  lamps: LampSet | null;
  facades: Facades | null;
}

function roundabout(): ContextBuild {
  const group = new Group();
  group.name = "Context_Roundabout";
  const asphalt = std("asphalt", 0.92);
  const paving = std("paving", 0.88);
  const curb = std("curb", 0.8);
  const grass = std("grass", 0.95);
  const marking = std("roadMarking", 0.6);
  const rng = createRng(3);

  group.add(flat(new CircleGeometry(1400, 64), std("earth", 1), "Context_Ground", -0.22));
  // Central island (the Porteur stands on it): paving ring + planted centre.
  const island = new Mesh(new CylinderGeometry(9, 9.15, 0.2, 96), curb);
  island.position.y = -0.1;
  island.receiveShadow = true;
  group.add(island);
  group.add(flat(new RingGeometry(6.8, 8.85, 96), paving, "Context_Island_Paving", 0.004));
  group.add(flat(new CircleGeometry(6.8, 64), grass, "Context_Island_Grass", 0.006));
  // Ring road + dashed lane.
  group.add(flat(new RingGeometry(9, 21, 128), asphalt, "Context_Ring_Road", -0.18));
  const dashes: Matrix4[] = [];
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2;
    dashes.push(matrixAt(Math.cos(a) * 15, -0.17, Math.sin(a) * 15, -a));
  }
  const dashMesh = instanced(
    new BoxGeometry(0.16, 0.02, 1.4),
    marking,
    dashes,
    "Context_Lane_Dashes",
  );
  if (dashMesh) group.add(dashMesh);
  // Outer sidewalk.
  const outerCurb = new Mesh(new CylinderGeometry(21, 21, 0.2, 128, 1, true), curb);
  outerCurb.position.y = -0.1;
  group.add(outerCurb);
  group.add(flat(new RingGeometry(21, 27, 128), paving, "Context_Sidewalk", 0.0));

  // Four approach avenues.
  for (let k = 0; k < 4; k++) {
    const arm = new Group();
    arm.rotation.y = (k * Math.PI) / 2;
    arm.add(slab(asphalt, "Context_Avenue", -7, 7, 24, 520, -0.18, 0.05));
    arm.add(slab(paving, "Context_Avenue_Sidewalk", 7, 12, 26, 520, 0, 0.2));
    arm.add(slab(paving, "Context_Avenue_Sidewalk", -12, -7, 26, 520, 0, 0.2));
    const centre: Matrix4[] = [];
    for (let z = 30; z < 500; z += 9) centre.push(matrixAt(0, -0.12, z));
    const centreMesh = instanced(
      new BoxGeometry(0.16, 0.02, 3),
      marking,
      centre,
      "Context_Avenue_Dashes",
    );
    if (centreMesh) arm.add(centreMesh);
    group.add(arm);
  }

  // Low-rise whitewashed / ochre blocks between the avenues.
  const facades = createFacades();
  for (let q = 0; q < 4; q++) {
    const base = (q * Math.PI) / 2 + Math.PI / 4;
    for (let i = 0; i < 4; i++) {
      const a = base + (rng() - 0.5) * 0.7;
      const r = 62 + i * 22 + rng() * 8;
      const w = 12 + rng() * 10;
      const h = 8 + rng() * (i > 1 ? 16 : 8);
      group.add(
        building(facades, Math.cos(a) * r, Math.sin(a) * r, w, h, 12 + rng() * 6, rng() > 0.55, -a),
      );
    }
  }

  // Palms on the island.
  const trunkMat = std("trunk", 0.9);
  const frondMat = new MeshStandardMaterial({
    color: paletteInt("foliage"),
    roughness: 0.8,
    side: DoubleSide,
  });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    group.add(
      palm(Math.cos(a) * 5.2, Math.sin(a) * 5.2, 5.5 + rng() * 1.5, trunkMat, frondMat, rng),
    );
  }
  const shrubs: Matrix4[] = [];
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const r = 2.2 + rng() * 4.2;
    const s = 0.22 + rng() * 0.3;
    shrubs.push(matrixAt(Math.cos(a) * r, s * 0.5, Math.sin(a) * r, 0, s, s * 0.8, s));
  }
  const shrubMesh = instanced(
    new IcosahedronGeometry(1, 0),
    std("foliage", 0.9),
    shrubs,
    "Context_Shrubs",
    true,
  );
  if (shrubMesh) group.add(shrubMesh);

  const lampSet = lamps(
    [0, 1, 2, 3].map((k) => {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      return [Math.cos(a) * 23.5, Math.sin(a) * 23.5, -a + Math.PI];
    }),
    9,
  );
  group.add(lampSet.group);
  return { group, lamps: lampSet, facades };
}

function dualCarriageway(): ContextBuild {
  const group = new Group();
  group.name = "Context_Highway";
  const asphalt = std("asphalt", 0.92);
  const curb = std("curb", 0.8);
  const marking = std("roadMarking", 0.6);
  const rail = std("guardRail", 0.45, 0.7);
  const L = 1000;
  const rng = createRng(5);

  group.add(flat(new CircleGeometry(1400, 64), std("grassDry", 1), "Context_Ground", -0.26));
  // Raised median on which the Porteur stands.
  group.add(slab(curb, "Context_Median", -2, 2, -L / 2, L / 2, 0, 0.25));
  for (const side of [-1, 1]) {
    group.add(slab(asphalt, "Context_Carriageway", side * 2, side * 14, -L / 2, L / 2, -0.2, 0.05));
    const lines: Matrix4[] = [];
    for (const lane of [1, 2]) {
      for (let z = -L / 2; z < L / 2; z += 12)
        lines.push(matrixAt(side * (2 + lane * 4), -0.19, z));
    }
    const lineMesh = instanced(
      new BoxGeometry(0.15, 0.02, 4),
      marking,
      lines,
      "Context_Lane_Dashes",
    );
    if (lineMesh) group.add(lineMesh);
    group.add(
      slab(marking, "Context_Edge_Line", side * 2.35, side * 2.5, -L / 2, L / 2, -0.185, 0.02),
    );
    group.add(
      slab(marking, "Context_Edge_Line", side * 13.45, side * 13.6, -L / 2, L / 2, -0.185, 0.02),
    );
    group.add(
      slab(rail, "Context_Guard_Rail", side * 14.6, side * 14.75, -L / 2, L / 2, 0.75, 0.32),
    );
    const posts: Matrix4[] = [];
    for (let z = -L / 2; z < L / 2; z += 4) posts.push(matrixAt(side * 14.75, 0.25, z));
    const postMesh = instanced(new BoxGeometry(0.1, 0.9, 0.1), rail, posts, "Context_Rail_Posts");
    if (postMesh) group.add(postMesh);
  }
  // Median planting (kept clear around the Porteur).
  const shrubs: Matrix4[] = [];
  for (let z = -L / 2; z < L / 2; z += 2.2) {
    if (Math.abs(z) < 7) continue;
    const s = 0.5 + rng() * 0.35;
    shrubs.push(matrixAt((rng() - 0.5) * 1.2, s * 0.45, z, rng() * 3, s, s * 0.75, s));
  }
  const shrubMesh = instanced(
    new IcosahedronGeometry(1, 0),
    std("foliage", 0.9),
    shrubs,
    "Context_Median_Shrubs",
    true,
  );
  if (shrubMesh) group.add(shrubMesh);

  // Distant skyline on both sides.
  const facades = createFacades();
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const z = -220 + i * 55 + rng() * 20;
      const h = 16 + rng() * 40;
      group.add(
        building(
          facades,
          side * (150 + rng() * 110),
          z,
          18 + rng() * 14,
          h,
          18 + rng() * 10,
          rng() > 0.6,
        ),
      );
    }
  }

  const positions: [number, number, number][] = [];
  for (let z = -225; z <= 225; z += 45) {
    if (z === 0) continue;
    positions.push([0, z, 0], [0, z, Math.PI]);
  }
  const lampSet = lamps(positions, 11);
  group.add(lampSet.group);
  return { group, lamps: lampSet, facades };
}

function sidewalkStreet(): ContextBuild {
  const group = new Group();
  group.name = "Context_Street";
  // Facades on +X, road on −X: the default orbit/drone azimuths look from the road side.
  group.rotation.y = Math.PI;
  const asphalt = std("asphalt", 0.92);
  const paving = std("paving", 0.85);
  const curb = std("curb", 0.8);
  const marking = std("roadMarking", 0.6);
  const L = 600;
  const rng = createRng(9);

  group.add(flat(new CircleGeometry(1400, 64), std("earth", 1), "Context_Ground", -0.24));
  // Sidewalk (Porteur side) — top flush with y = 0.
  group.add(slab(paving, "Context_Sidewalk", -5, 4.6, -L / 2, L / 2, 0, 0.22));
  group.add(slab(curb, "Context_Curb", 4.6, 4.85, -L / 2, L / 2, 0, 0.22));
  group.add(slab(asphalt, "Context_Road", 4.85, 16, -L / 2, L / 2, -0.16, 0.06));
  group.add(slab(paving, "Context_Sidewalk_Far", 16, 20.5, -L / 2, L / 2, 0, 0.22));
  // Paving joints (subtle grid).
  const joints: Matrix4[] = [];
  for (let z = -60; z <= 60; z += 1.5) joints.push(matrixAt(-0.2, 0.003, z));
  const jointMesh = instanced(
    new BoxGeometry(9.6, 0.004, 0.03),
    std("pavingJoint", 0.9),
    joints,
    "Context_Paving_Joints",
  );
  if (jointMesh) group.add(jointMesh);
  const centre: Matrix4[] = [];
  for (let z = -L / 2; z < L / 2; z += 7) centre.push(matrixAt(10.4, -0.1, z));
  const centreMesh = instanced(
    new BoxGeometry(0.14, 0.02, 3),
    marking,
    centre,
    "Context_Centre_Line",
  );
  if (centreMesh) group.add(centreMesh);

  // Continuous facades on the far side of the sidewalk, arcades on the ground floor.
  const facades = createFacades();
  let z = -L / 2 + 40;
  while (z < L / 2 - 40) {
    const w = 9 + rng() * 9;
    const h = 10 + rng() * 16;
    group.add(building(facades, -11, z + w / 2, 12, h, w, rng() > 0.6));
    z += w + 0.4;
  }
  let zz = -L / 2 + 40;
  while (zz < L / 2 - 40) {
    const w = 10 + rng() * 12;
    group.add(building(facades, 28, zz + w / 2, 14, 8 + rng() * 20, w, rng() > 0.5));
    zz += w + 0.4;
  }

  // Trees along the curb (clear of the Porteur).
  const trunks: Matrix4[] = [];
  const crowns: Matrix4[] = [];
  for (let tz = -150; tz <= 150; tz += 11) {
    if (Math.abs(tz) < 8) continue;
    const s = 0.85 + rng() * 0.4;
    trunks.push(matrixAt(3.7, 1.6 * s, tz, 0, s, s, s));
    crowns.push(matrixAt(3.7, 4.2 * s, tz, rng() * 3, 1.9 * s, 1.6 * s, 1.9 * s));
  }
  const trunkMesh = instanced(
    new CylinderGeometry(0.12, 0.18, 3.2, 8),
    std("trunk", 0.9),
    trunks,
    "Context_Tree_Trunks",
    true,
  );
  if (trunkMesh) group.add(trunkMesh);
  const crownMesh = instanced(
    new IcosahedronGeometry(1, 1),
    std("foliage", 0.85),
    crowns,
    "Context_Tree_Crowns",
    true,
  );
  if (crownMesh) group.add(crownMesh);
  const bollards: Matrix4[] = [];
  for (let bz = -40; bz <= 40; bz += 3) {
    if (Math.abs(bz) < 3) continue;
    bollards.push(matrixAt(4.3, 0.45, bz));
  }
  const bollardMesh = instanced(
    new CylinderGeometry(0.08, 0.1, 0.9, 10),
    std("steelDark", 0.5, 0.6),
    bollards,
    "Context_Bollards",
    true,
  );
  if (bollardMesh) group.add(bollardMesh);

  const positions: [number, number, number][] = [];
  for (let lz = -125; lz <= 125; lz += 25) {
    if (lz === 0) continue;
    positions.push([4.1, lz, 0]);
  }
  const lampSet = lamps(positions, 7.5);
  group.add(lampSet.group);
  return { group, lamps: lampSet, facades };
}

function openGround(): ContextBuild {
  const group = new Group();
  group.name = "Context_Open_Ground";
  const rng = createRng(13);
  group.add(flat(new CircleGeometry(1400, 64), std("grass", 1), "Context_Ground", -0.01));
  group.add(flat(new PlaneGeometry(7, 7), std("earth", 1), "Context_Gravel_Pad", 0.0));
  const track = flat(new PlaneGeometry(3.2, 300), std("earth", 1), "Context_Track", -0.005);
  track.position.z = 150 + 3.5;
  group.add(track);

  const posts: Matrix4[] = [];
  const perSide = 6;
  for (let i = 0; i <= perSide; i++) {
    const t = -3.5 + (7 * i) / perSide;
    posts.push(matrixAt(t, 0.6, -3.5), matrixAt(t, 0.6, 3.5));
    if (i > 0 && i < perSide) posts.push(matrixAt(-3.5, 0.6, t), matrixAt(3.5, 0.6, t));
  }
  const postMesh = instanced(
    new CylinderGeometry(0.04, 0.05, 1.2, 8),
    std("guardRail", 0.5, 0.6),
    posts,
    "Context_Fence_Posts",
    true,
  );
  if (postMesh) group.add(postMesh);

  const hills: Matrix4[] = [];
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + rng() * 0.15;
    const r = 420 + rng() * 260;
    const s = 60 + rng() * 90;
    hills.push(
      matrixAt(Math.cos(a) * r, -2, Math.sin(a) * r, rng() * 3, s, 12 + rng() * 26, s * 0.7),
    );
  }
  const hillMesh = instanced(new ConeGeometry(1, 1, 7), std("hills", 1), hills, "Context_Hills");
  if (hillMesh) group.add(hillMesh);

  const rocks: Matrix4[] = [];
  const bushes: Matrix4[] = [];
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const r = 9 + rng() * 60;
    const s = 0.2 + rng() * 0.7;
    (i % 3 === 0 ? rocks : bushes).push(
      matrixAt(Math.cos(a) * r, s * 0.35, Math.sin(a) * r, rng() * 3, s, s * 0.7, s),
    );
  }
  const rockMesh = instanced(
    new IcosahedronGeometry(1, 0),
    std("curb", 1),
    rocks,
    "Context_Rocks",
    true,
  );
  if (rockMesh) group.add(rockMesh);
  const bushMesh = instanced(
    new IcosahedronGeometry(1, 0),
    std("foliage", 0.95),
    bushes,
    "Context_Bushes",
    true,
  );
  if (bushMesh) group.add(bushMesh);
  return { group, lamps: null, facades: null };
}

// ---------------------------------------------------------------------------------------------
// Sky + stars

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w; // always at the far plane
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 bottomColor;
uniform vec3 sunColor;
uniform vec3 sunDir;
uniform float sunGlow;
varying vec3 vDir;
void main() {
  float h = vDir.y;
  vec3 col = h > 0.0
    ? mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.55))
    : mix(horizonColor, bottomColor, pow(clamp(-h, 0.0, 1.0), 0.35));
  float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
  col += sunColor * (pow(s, 64.0) * 0.8 + pow(s, 6.0) * 0.12) * sunGlow;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function createSky(): { mesh: Mesh; material: ShaderMaterial } {
  const material = new ShaderMaterial({
    name: "M_Sky",
    uniforms: {
      topColor: { value: new Color(paletteInt("skyDayTop")) },
      horizonColor: { value: new Color(paletteInt("skyDayHorizon")) },
      bottomColor: { value: new Color(paletteInt("skyDayHorizon")) },
      sunColor: { value: new Color(paletteInt("sun")) },
      sunDir: { value: new Vector3(0, 1, 0) },
      sunGlow: { value: 1 },
    },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new Mesh(new SphereGeometry(1800, 32, 16), material);
  mesh.name = "Sky";
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, material };
}

function createStars(): { points: Points; material: PointsMaterial } {
  const rng = createRng(21);
  const count = 900;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = rng();
    const v = 0.08 + rng() * 0.92;
    const theta = u * Math.PI * 2;
    const y = v;
    const r = Math.sqrt(1 - y * y);
    positions.set([Math.cos(theta) * r * 1500, y * 1500, Math.sin(theta) * r * 1500], i * 3);
  }
  const geometry = new ThreeBufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  const material = new PointsMaterial({
    color: paletteInt("stars"),
    size: 1.6,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  });
  const points = new Points(geometry, material);
  points.name = "Stars";
  points.frustumCulled = false;
  points.visible = false;
  return { points, material };
}

// ---------------------------------------------------------------------------------------------

export function createEnvironment(
  type: StudioPorteurType,
  dims: PorteurDimensions,
): StudioEnvironment {
  const world = new Group();
  world.name = "Environment_World";
  const H = dims.heightM;

  const sky = createSky();
  world.add(sky.mesh);
  const stars = createStars();
  world.add(stars.points);

  const hemi = new HemisphereLight(paletteInt("skyDayHorizon"), paletteInt("groundBounceDay"), 1);
  hemi.name = "Hemisphere";
  world.add(hemi);

  const sun = new DirectionalLight(paletteInt("sun"), 3);
  sun.name = "Sun";
  sun.castShadow = true;
  const extent = Math.max(26, H * 1.05);
  sun.shadow.camera.left = -extent;
  sun.shadow.camera.right = extent;
  sun.shadow.camera.top = extent;
  sun.shadow.camera.bottom = -extent;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = H * 8 + 200;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  world.add(sun);
  world.add(sun.target);

  const fog = new Fog(paletteInt("skyDayHorizon"), 140, 900);

  const built =
    type === "A"
      ? roundabout()
      : type === "B"
        ? dualCarriageway()
        : type === "C"
          ? sidewalkStreet()
          : openGround();
  const context = new Group();
  context.name = "Environment_Context";
  context.add(built.group);

  let screenSpill: PointLight | null = null;
  const s = dims.screen;
  if (s) {
    screenSpill = new PointLight(paletteInt("screenSpill"), 0, Math.max(14, H * 0.9), 2);
    screenSpill.name = "Screen_Spill";
    const front = (s.kind === "band" ? s.radius : s.offset) + Math.max(2.5, s.height * 0.6);
    screenSpill.position.set(0, Math.max(0.6, s.centerY - s.height * 0.75), -front);
    context.add(screenSpill);
  }

  const c = {
    dayTop: new Color(paletteInt("skyDayTop")),
    dayHorizon: new Color(paletteInt("skyDayHorizon")),
    nightTop: new Color(paletteInt("skyNightTop")),
    nightHorizon: new Color(paletteInt("skyNightHorizon")),
    sun: new Color(paletteInt("sun")),
    moon: new Color(paletteInt("moon")),
    bounceDay: new Color(paletteInt("groundBounceDay")),
    bounceNight: new Color(paletteInt("groundBounceNight")),
  };
  const followOffset = { x: 0, z: 0 };
  let lastValues: LightingValues | null = null;

  const placeSun = (values: LightingValues) => {
    const [dx, dy, dz] = sunDirection(values.sunElevationDeg, values.sunAzimuthDeg);
    const dist = H * 4 + 60;
    sun.position.set(followOffset.x + dx * dist, dy * dist, followOffset.z + dz * dist);
    sun.target.position.set(followOffset.x, 0, followOffset.z);
    sun.target.updateMatrixWorld();
    (sky.material.uniforms.sunDir?.value as Vector3).set(dx, dy, dz);
  };

  return {
    world,
    context,
    fog,
    sun,
    streetLights: built.lamps?.lights ?? [],
    screenSpill,
    apply(night, values) {
      lastValues = values;
      const u = sky.material.uniforms;
      (u.topColor?.value as Color).lerpColors(c.dayTop, c.nightTop, night);
      (u.horizonColor?.value as Color).lerpColors(c.dayHorizon, c.nightHorizon, night);
      (u.bottomColor?.value as Color).lerpColors(c.dayHorizon, c.nightHorizon, night);
      (u.sunColor?.value as Color).lerpColors(c.sun, c.moon, night);
      if (u.sunGlow) u.sunGlow.value = 1 - night * 0.85;
      fog.color.lerpColors(c.dayHorizon, c.nightHorizon, night);
      fog.near = values.fogNear;
      fog.far = values.fogFar;
      hemi.intensity = values.hemiIntensity;
      hemi.color.lerpColors(c.dayHorizon, c.nightHorizon, night);
      hemi.groundColor.lerpColors(c.bounceDay, c.bounceNight, night);
      sun.intensity = values.sunIntensity;
      sun.color.lerpColors(c.sun, c.moon, night);
      placeSun(values);
      stars.material.opacity = values.starsOpacity;
      stars.points.visible = values.starsOpacity > 0.01;
      for (const light of built.lamps?.lights ?? []) light.intensity = values.streetLightIntensity;
      if (built.lamps) built.lamps.lampMaterial.emissiveIntensity = night * 3;
      if (screenSpill) screenSpill.intensity = values.screenSpillIntensity;
      if (built.facades) {
        built.facades.white.emissiveIntensity = values.windowGlow * 1.4;
        built.facades.ochre.emissiveIntensity = values.windowGlow * 1.4;
      }
    },
    followTarget(x, z) {
      followOffset.x = x;
      followOffset.z = z;
      if (lastValues) placeSun(lastValues);
    },
    dispose() {
      disposeObject3D(world);
      disposeObject3D(context);
      built.facades?.textures.forEach((t) => t.dispose());
      sun.shadow.map?.dispose();
    },
  };
}
