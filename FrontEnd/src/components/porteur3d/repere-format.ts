/**
 * Repère (calibration) readouts and « Copier la vue » snippet (pure, French number formatting).
 */
import type { FixedPresetDef } from "@/components/porteur3d/scene-config";
import type { CameraPresetId, ModelSource, Vec3Tuple } from "@/components/porteur3d/types";

const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

const MINUS_SIGN = new RegExp(String.fromCharCode(0x2212), "g");

/** Normalises the Intl narrow no-break spaces and minus sign so tests and readouts are stable. */
function clean(s: string): string {
  return s.replace(/\s/g, " ").replace(MINUS_SIGN, "-");
}

export function formatMetres(n: number): string {
  return `${clean(nf2.format(Math.abs(n) < 0.005 ? 0 : n))} m`;
}

/** « L 2,48 × H 20,00 × P 2,48 m » (largeur X, hauteur Y, profondeur Z). */
export function formatDims(size: Vec3Tuple): string {
  const [x, y, z] = size.map((v) => clean(nf2.format(v)));
  return `L ${x} × H ${y} × P ${z} m`;
}

/** « x 1,20 · y 3,00 · z -0,40 ». */
export function formatVec(v: Vec3Tuple): string {
  const f = (n: number) => clean(nf2.format(Math.abs(n) < 0.005 ? 0 : n));
  return `x ${f(v[0])} · y ${f(v[1])} · z ${f(v[2])}`;
}

export function formatTriangles(n: number): string {
  return `${clean(nf0.format(Math.max(0, Math.round(n))))} ${n === 1 ? "triangle" : "triangles"}`;
}

export function describeSource(source: ModelSource): string {
  return source.kind === "glb" ? `GLB · ${source.path}` : "Procédural (aucun GLB trouvé)";
}

function round(n: number, digits = 2): number {
  const k = 10 ** digits;
  const r = Math.round(n * k) / k;
  return Object.is(r, -0) ? 0 : r;
}

export function roundTuple(v: Vec3Tuple, digits = 2): Vec3Tuple {
  return [round(v[0], digits), round(v[1], digits), round(v[2], digits)];
}

/**
 * Ready-to-paste preset for `scene-config.ts` (`CAMERA_PRESETS[n].def`), from the camera expressed
 * in the Porteur local frame (heading removed).
 */
export function buildPresetDef(
  localPosition: Vec3Tuple,
  localTarget: Vec3Tuple,
  heightM: number,
): FixedPresetDef {
  return {
    kind: "fixed",
    position: roundTuple(localPosition),
    target: roundTuple(localTarget),
    referenceHeightM: round(heightM, 2),
  };
}

export function buildPresetSnippet(
  id: CameraPresetId | "personnalisee",
  localPosition: Vec3Tuple,
  localTarget: Vec3Tuple,
  heightM: number,
): string {
  return JSON.stringify({ id, def: buildPresetDef(localPosition, localTarget, heightM) }, null, 2);
}
