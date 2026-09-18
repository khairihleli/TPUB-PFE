/**
 * Porteur model loading chain: HEAD-probe `/models/porteur-type-{x}.glb` then `/models/porteur.glb`;
 * a found GLB is loaded with GLTFLoader + DRACOLoader (`/draco/`) + MeshoptDecoder and normalised
 * (height = mast height when `SCENE_CONFIG.glb.autoScale`, base centre at the origin). Otherwise the
 * procedural Porteur is built. Both paths return the same `LoadedPorteur` shape.
 */
import {
  Box3,
  Group,
  Mesh,
  type MeshStandardMaterial,
  type Object3D,
  Vector3,
  type WebGLRenderer,
} from "three";

import { resolveGlbPath, type FetchLike } from "@/components/porteur3d/glb-naming";
import {
  countTriangles,
  disposeObject3D,
  indexModel,
  positionIn,
  type ModelIndex,
} from "@/components/porteur3d/model-index";
import { computeNormalization } from "@/components/porteur3d/normalize";
import {
  computeHotspotAnchors,
  computePorteurDimensions,
  type HotspotAnchor,
  type PorteurDimensions,
} from "@/components/porteur3d/porteur-dimensions";
import {
  buildProceduralPorteur,
  createScreenMaterial,
} from "@/components/porteur3d/porteur-procedural";
import { SCENE_CONFIG, glbCandidates } from "@/components/porteur3d/scene-config";
import { estimateScreenAspect } from "@/components/porteur3d/texture-math";
import type {
  HotspotId,
  ModelSource,
  StudioPorteurType,
  Vec3Tuple,
} from "@/components/porteur3d/types";
import type { CreativeSurface } from "@/components/porteur3d/creative-texture";

export interface LoadedPorteur {
  root: Group;
  source: ModelSource;
  dims: PorteurDimensions;
  index: ModelIndex;
  surfaces: CreativeSurface[];
  anchors: Partial<Record<HotspotId, HotspotAnchor>>;
  triangles: number;
  size: Vec3Tuple;
  warnings: string[];
  dispose(): void;
}

function horizontalNormal(p: Vec3Tuple): Vec3Tuple {
  const l = Math.hypot(p[0], p[2]);
  return l > 1e-3 ? [p[0] / l, 0, p[2] / l] : [0, 0, -1];
}

function sizeOf(root: Object3D): Vec3Tuple {
  const box = new Box3().setFromObject(root);
  if (box.isEmpty()) return [0, 0, 0];
  return [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
}

/** Anchors: `Hotspot_*` empties win, procedural anchors fill the gaps. */
function mergeAnchors(
  root: Object3D,
  index: ModelIndex,
  fallback: Partial<Record<HotspotId, HotspotAnchor>>,
  type: StudioPorteurType,
): Partial<Record<HotspotId, HotspotAnchor>> {
  const anchors: Partial<Record<HotspotId, HotspotAnchor>> = { ...fallback };
  for (const [id, obj] of Object.entries(index.hotspots) as [HotspotId, Object3D][]) {
    const position = positionIn(root, obj);
    const userNormal = obj.userData.normal as Vec3Tuple | undefined;
    anchors[id] = { position, normal: userNormal ?? horizontalNormal(position) };
  }
  if (type === "D") delete anchors.ecran;
  return anchors;
}

function surfacesFrom(index: ModelIndex, replaceMaterials: boolean): CreativeSurface[] {
  return index.screens.map(({ mesh, face }) => {
    let material = mesh.material as MeshStandardMaterial;
    if (replaceMaterials) {
      const previous = mesh.material;
      material = createScreenMaterial(`M_Screen${face === null ? "" : `_${String(face)}`}`);
      mesh.material = material;
      for (const m of Array.isArray(previous) ? previous : [previous]) m.dispose();
    }
    let aspect = mesh.userData.aspect as number | undefined;
    if (!aspect) {
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox;
      const scale = mesh.getWorldScale(new Vector3());
      const size: Vec3Tuple = bb
        ? [
            (bb.max.x - bb.min.x) * scale.x,
            (bb.max.y - bb.min.y) * scale.y,
            (bb.max.z - bb.min.z) * scale.z,
          ]
        : [1, 1, 1];
      aspect = estimateScreenAspect(size, face);
    }
    return { mesh, material, face, aspect };
  });
}

export function createProceduralPorteur(
  type: StudioPorteurType,
  mastHeightM: number | null | undefined,
): LoadedPorteur {
  const built = buildProceduralPorteur(type, mastHeightM);
  const index = indexModel(built.root);
  const anchors = mergeAnchors(built.root, index, computeHotspotAnchors(built.dims), type);
  return {
    root: built.root,
    source: { kind: "procedural" },
    dims: built.dims,
    index,
    surfaces: surfacesFrom(index, false),
    anchors,
    triangles: countTriangles(built.root),
    size: sizeOf(built.root),
    warnings: [],
    dispose: () => disposeObject3D(built.root),
  };
}

export interface LoadPorteurOptions {
  type: StudioPorteurType;
  mastHeightM: number | null | undefined;
  renderer?: WebGLRenderer | null;
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
}

async function loadGlb(path: string, options: LoadPorteurOptions): Promise<LoadedPorteur> {
  const [{ GLTFLoader }, { DRACOLoader }, { MeshoptDecoder }] = await Promise.all([
    import("three/examples/jsm/loaders/GLTFLoader.js"),
    import("three/examples/jsm/loaders/DRACOLoader.js"),
    import("three/examples/jsm/libs/meshopt_decoder.module.js"),
  ]);
  const draco = new DRACOLoader().setDecoderPath(SCENE_CONFIG.glb.dracoDecoderPath);
  const loader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
  try {
    const gltf = await loader.loadAsync(path);
    if (options.signal?.aborted) {
      disposeObject3D(gltf.scene);
      throw new DOMException("Chargement annulé", "AbortError");
    }
    const dims = computePorteurDimensions(options.type, options.mastHeightM);
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const norm = computeNormalization(new Box3().setFromObject(model), {
      targetHeightM: dims.heightM,
      autoScale: SCENE_CONFIG.glb.autoScale,
    });
    const root = new Group();
    root.name = `GLB_Root_${options.type}`;
    model.scale.multiplyScalar(norm.scale);
    model.position.multiplyScalar(norm.scale);
    model.position.x += norm.offset[0];
    model.position.y += norm.offset[1];
    model.position.z += norm.offset[2];
    root.add(model);
    root.updateMatrixWorld(true);

    root.traverse((obj) => {
      if (obj instanceof Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    const index = indexModel(root);
    const warnings = [...norm.warnings];
    if (options.type !== "D" && index.screens.length === 0) {
      warnings.push(
        "Aucun maillage « Screen* » (ou matériau « M_Screen ») : le visuel ne peut pas être appliqué.",
      );
    }
    if (index.energySpheres.length === 0) {
      warnings.push("Aucun nœud « Energy_Sphere » : la sphère ne tournera pas.");
    }
    index.unknownHotspots.forEach((name) =>
      warnings.push(`Point d'intérêt inconnu ignoré : ${name}.`),
    );
    const triangles = countTriangles(root);
    if (triangles > SCENE_CONFIG.glb.maxTriangles) {
      warnings.push(
        `Budget dépassé : ${triangles} triangles (maximum ${SCENE_CONFIG.glb.maxTriangles}).`,
      );
    }
    // Keep anisotropic filtering crisp on the delivered textures.
    const maxAniso = options.renderer?.capabilities.getMaxAnisotropy() ?? 1;
    root.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats as MeshStandardMaterial[]) {
        if (m.map) m.map.anisotropy = Math.min(8, maxAniso);
      }
    });

    const anchors = mergeAnchors(root, index, computeHotspotAnchors(dims), options.type);
    return {
      root,
      source: { kind: "glb", path },
      dims,
      index,
      surfaces: surfacesFrom(index, true),
      anchors,
      triangles,
      size: sizeOf(root),
      warnings,
      dispose: () => disposeObject3D(root),
    };
  } finally {
    draco.dispose();
  }
}

/**
 * Resolve and load the best available model. GLB errors fall back to the procedural Porteur with a
 * warning (the studio must never end up empty). Aborts reject with an AbortError.
 */
export async function loadPorteurModel(options: LoadPorteurOptions): Promise<LoadedPorteur> {
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  let path: string | null = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCENE_CONFIG.glb.headTimeoutMs);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort);
  try {
    path = await resolveGlbPath(glbCandidates(options.type), fetchImpl, controller.signal);
  } catch (error) {
    if (options.signal?.aborted) throw error;
    path = null; // HEAD timeout → procedural
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }

  if (path) {
    try {
      return await loadGlb(path, options);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      const fallback = createProceduralPorteur(options.type, options.mastHeightM);
      fallback.warnings.push(`Échec du chargement de ${path} : modèle procédural affiché.`);
      return fallback;
    }
  }
  return createProceduralPorteur(options.type, options.mastHeightM);
}
