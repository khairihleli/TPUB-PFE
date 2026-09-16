/**
 * Scene-graph utilities shared by the procedural and the GLB models: role indexing from the naming
 * convention, triangle count, full disposal. three.js core only (no renderer) → testable in jsdom.
 */
import {
  type BufferGeometry,
  type Material,
  Mesh,
  type Object3D,
  type Texture,
  Vector3,
} from "three";

import { classifyNodeName, type ScreenFace } from "@/components/porteur3d/glb-naming";
import type { HotspotId } from "@/components/porteur3d/types";

export interface IndexedScreen {
  mesh: Mesh;
  face: ScreenFace;
}

export interface ModelIndex {
  screens: IndexedScreen[];
  energySpheres: Object3D[];
  hotspots: Partial<Record<HotspotId, Object3D>>;
  /** `Hotspot_*` names that do not map to a known hotspot id. */
  unknownHotspots: string[];
}

function materialNames(obj: Object3D): string[] {
  if (!(obj instanceof Mesh)) return [];
  const m = obj.material as Material | Material[];
  return (Array.isArray(m) ? m : [m]).map((x) => x.name).filter(Boolean);
}

export function indexModel(root: Object3D): ModelIndex {
  const index: ModelIndex = { screens: [], energySpheres: [], hotspots: {}, unknownHotspots: [] };

  const visit = (obj: Object3D, inheritedFace: ScreenFace | undefined) => {
    const role = classifyNodeName(obj.name, materialNames(obj));
    let face = inheritedFace;
    if (role?.kind === "screen") {
      face = role.face ?? inheritedFace ?? null;
    } else if (role?.kind === "energy-sphere") {
      // Nested matches (Energy_Sphere_Shell inside Energy_Sphere) rotate with their parent.
      const nested = index.energySpheres.some((s) => isAncestor(s, obj));
      if (!nested) index.energySpheres.push(obj);
    } else if (role?.kind === "hotspot") {
      if (role.id && !index.hotspots[role.id]) index.hotspots[role.id] = obj;
      else if (!role.id) index.unknownHotspots.push(obj.name);
    }
    if (face !== undefined && obj instanceof Mesh) {
      index.screens.push({ mesh: obj as Mesh, face });
    }
    for (const child of obj.children) visit(child, face);
  };
  visit(root, undefined);
  return index;
}

function isAncestor(ancestor: Object3D, obj: Object3D): boolean {
  let p = obj.parent;
  while (p) {
    if (p === ancestor) return true;
    p = p.parent;
  }
  return false;
}

export function geometryTriangles(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  const count = index ? index.count : (geometry.getAttribute("position")?.count ?? 0);
  const groupsCount = geometry.drawRange.count;
  const drawn = Number.isFinite(groupsCount) ? Math.min(count, groupsCount) : count;
  return Math.floor(drawn / 3);
}

export function countTriangles(root: Object3D): number {
  let total = 0;
  root.traverse((obj) => {
    if (obj instanceof Mesh) {
      const g = obj.geometry as BufferGeometry;
      const instances =
        "count" in obj && typeof (obj as { count?: unknown }).count === "number"
          ? (obj as unknown as { count: number }).count
          : 1;
      total += geometryTriangles(g) * instances;
    }
  });
  return total;
}

function isTexture(value: unknown): value is Texture {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { isTexture?: boolean }).isTexture === true
  );
}

/**
 * Dispose every geometry, material and material texture under `root` (each once).
 * `keep` textures (e.g. a creative texture owned elsewhere) are skipped.
 */
export function disposeObject3D(root: Object3D, keep: ReadonlySet<Texture> = new Set()): void {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  root.traverse((obj) => {
    const withGeometry = obj as Object3D & {
      geometry?: BufferGeometry;
      material?: Material | Material[];
    };
    if (withGeometry.geometry) geometries.add(withGeometry.geometry);
    const m = withGeometry.material;
    if (m) for (const mat of Array.isArray(m) ? m : [m]) materials.add(mat);
  });
  const textures = new Set<Texture>();
  for (const mat of materials) {
    for (const value of Object.values(mat)) {
      if (isTexture(value) && !keep.has(value)) textures.add(value);
    }
    const uniforms = (mat as Material & { uniforms?: Record<string, { value: unknown }> }).uniforms;
    if (uniforms) {
      for (const u of Object.values(uniforms)) {
        if (isTexture(u.value) && !keep.has(u.value)) textures.add(u.value);
      }
    }
  }
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}

/** World position of an object relative to `frame` (e.g. the heading pivot), as a tuple. */
export function positionIn(frame: Object3D, obj: Object3D): [number, number, number] {
  const v = new Vector3();
  obj.getWorldPosition(v);
  frame.worldToLocal(v);
  return [v.x, v.y, v.z];
}
