/**
 * GLB naming convention (docs/PORTEUR-3D.md), pure and unit-tested.
 *
 * - `/^Screen/i` meshes/nodes (or material `M_Screen*`) receive the creative:
 *   `Screen_360` (A band), `Screen_Face_1` (heading side), `Screen_Face_2` (opposite side).
 * - `/Energy_Sphere/i` nodes rotate around their local Y axis.
 * - `/^Hotspot_(\w+)/` empties override hotspot anchors (`Hotspot_ecran`, `Hotspot_solaire`, …).
 *
 * GLTFLoader sanitises names (spaces → `_`, `[].:/` removed) and suffixes duplicates with `_1`,
 * so Blender's `Screen_Face_1.001` arrives as `Screen_Face_1001`: both forms are recognised.
 */
import type { HotspotId } from "@/components/porteur3d/types";

export type ScreenFace = 1 | 2 | "360" | null;

export type NodeRole =
  | { kind: "screen"; face: ScreenFace }
  | { kind: "energy-sphere" }
  | { kind: "hotspot"; id: HotspotId | null; raw: string };

const SCREEN_RE = /^Screen/i;
const SCREEN_MATERIAL_RE = /^M_Screen/i;
const ENERGY_SPHERE_RE = /Energy_Sphere/i;
const HOTSPOT_RE = /^Hotspot_(\w+)/i;
/** Face 1/2, tolerating `_1` duplicate suffixes and sanitised Blender `.001` suffixes. */
const FACE_RE = /Face_?([12])(?=$|_|[^0-9]|\d{3}(?:$|_))/i;

const HOTSPOT_ALIASES: Record<string, HotspotId> = {
  ecran: "ecran",
  screen: "ecran",
  display: "ecran",
  solaire: "solaire",
  solar: "solaire",
  panneau: "solaire",
  panneaux: "solaire",
  sphere: "sphere",
  energy: "sphere",
  energie: "sphere",
  mat: "mat",
  mast: "mat",
  pole: "mat",
  base: "base",
  socle: "base",
  capteurs: "capteurs",
  capteur: "capteurs",
  sensors: "capteurs",
  sensor: "capteurs",
};

/** `Hotspot_Solar_2` → "solaire" ; unknown → null. Only the first word after `Hotspot_` counts. */
export function hotspotIdFromSuffix(suffix: string): HotspotId | null {
  const word = suffix.split("_")[0]?.toLowerCase().replace(/\d+$/, "") ?? "";
  return HOTSPOT_ALIASES[word] ?? null;
}

export function screenFaceFromName(name: string): ScreenFace {
  if (/360/.test(name)) return "360";
  const m = FACE_RE.exec(name);
  if (!m) return null;
  return m[1] === "2" ? 2 : 1;
}

/** Role of a node from its own name (and optionally its material names). */
export function classifyNodeName(
  name: string,
  materialNames: readonly string[] = [],
): NodeRole | null {
  const hotspot = HOTSPOT_RE.exec(name);
  if (hotspot) {
    const raw = hotspot[1] ?? "";
    return { kind: "hotspot", id: hotspotIdFromSuffix(raw), raw };
  }
  if (ENERGY_SPHERE_RE.test(name)) return { kind: "energy-sphere" };
  if (SCREEN_RE.test(name)) return { kind: "screen", face: screenFaceFromName(name) };
  const screenMaterial = materialNames.find((m) => SCREEN_MATERIAL_RE.test(m));
  if (screenMaterial !== undefined) {
    return { kind: "screen", face: screenFaceFromName(screenMaterial) };
  }
  return null;
}

/**
 * Whether a screen of face `face` shows the creative at full intensity for the requested face.
 * Band ("360") and unnamed faces (null) are always lit.
 */
export function isFaceLit(face: ScreenFace, selected: "all" | 1 | 2): boolean {
  if (selected === "all" || face === "360" || face === null) return true;
  return face === selected;
}

/** Content-type check for the HEAD probe: a SPA/Next fallback page is not a model. */
export function looksLikeGlbResponse(status: number, contentType: string | null): boolean {
  if (status < 200 || status >= 300) return false;
  const ct = (contentType ?? "").toLowerCase();
  return !ct.includes("text/html") && !ct.includes("application/json");
}

export type FetchLike = (
  input: string,
  init?: { method?: string; signal?: AbortSignal; cache?: RequestCache },
) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null } }>;

/**
 * HEAD-probe the candidates in order and return the first one that exists, or null (→ procedural).
 * Network errors count as "absent"; an abort rejects.
 */
export async function resolveGlbPath(
  candidates: readonly string[],
  fetchImpl: FetchLike,
  signal?: AbortSignal,
): Promise<string | null> {
  for (const path of candidates) {
    if (signal?.aborted) throw new DOMException("Chargement annulé", "AbortError");
    try {
      const res = await fetchImpl(path, { method: "HEAD", signal, cache: "no-cache" });
      if (looksLikeGlbResponse(res.status, res.headers.get("content-type"))) return path;
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        throw error;
      }
      // Unreachable → try the next candidate.
    }
  }
  return null;
}
