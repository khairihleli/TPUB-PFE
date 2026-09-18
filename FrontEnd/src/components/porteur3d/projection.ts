/**
 * 3D anchor → DOM overlay helpers. Uses three.js math only (no renderer), so it runs in jsdom.
 */
import { type Camera, Vector3 } from "three";

import type { Vec3Tuple } from "@/components/porteur3d/types";

export interface ScreenPoint {
  /** CSS pixels from the left/top of the canvas, clamped inside the margins. */
  x: number;
  y: number;
  /** Inside the view frustum (not behind the camera, not outside NDC). */
  inView: boolean;
  /** Behind the camera plane: the projected point is meaningless, keep last position or clamp. */
  behind: boolean;
  /** NDC depth (−1 near … 1 far). */
  depth: number;
}

const tmp = new Vector3();
const tmpCam = new Vector3();

/**
 * Project a world point to CSS pixel coordinates. Points outside the view are clamped to the edge
 * (minus `margin`) so DOM buttons stay reachable for keyboard users.
 */
export function projectToScreen(
  world: Vector3 | Vec3Tuple,
  camera: Camera,
  width: number,
  height: number,
  margin = 18,
): ScreenPoint {
  if (world instanceof Vector3) tmp.copy(world);
  else tmp.set(world[0], world[1], world[2]);

  // Behind test in camera space (z > 0 means behind for a camera looking down −Z).
  tmpCam.copy(tmp).applyMatrix4(camera.matrixWorldInverse);
  const behind = tmpCam.z > 0;

  tmp.project(camera);
  let nx = tmp.x;
  let ny = tmp.y;
  if (behind) {
    nx = -nx;
    ny = -ny;
  }
  const inView = !behind && Math.abs(nx) <= 1 && Math.abs(ny) <= 1 && tmp.z <= 1;
  const rawX = ((nx + 1) / 2) * width;
  const rawY = ((1 - ny) / 2) * height;
  const m = Math.max(0, Math.min(margin, width / 2, height / 2));
  return {
    x: Math.min(width - m, Math.max(m, rawX)),
    y: Math.min(height - m, Math.max(m, rawY)),
    inView,
    behind,
    depth: tmp.z,
  };
}

/**
 * How much a surface anchor faces the camera: 1 = straight at it, −1 = on the far side.
 * Used to dim hotspots hidden behind the mast (they stay focusable).
 */
export function facingFactor(
  anchor: Vec3Tuple,
  normal: Vec3Tuple,
  cameraPosition: Vec3Tuple,
): number {
  const vx = cameraPosition[0] - anchor[0];
  const vy = cameraPosition[1] - anchor[1];
  const vz = cameraPosition[2] - anchor[2];
  const vl = Math.hypot(vx, vy, vz);
  const nl = Math.hypot(normal[0], normal[1], normal[2]);
  if (vl === 0 || nl === 0) return 1;
  return (vx * normal[0] + vy * normal[1] + vz * normal[2]) / (vl * nl);
}

export interface LabelBox {
  key: string;
  x: number;
  y: number;
}

/**
 * Push overlapping labels apart vertically (simple, stable: sorted by y, each label at least
 * `minGap` px below the previous one when they are horizontally close).
 */
export function separateLabels(
  points: readonly LabelBox[],
  minGap = 30,
  sameColumn = 60,
): LabelBox[] {
  const sorted = [...points].sort((a, b) => a.y - b.y || a.key.localeCompare(b.key));
  const out: LabelBox[] = [];
  for (const p of sorted) {
    let y = p.y;
    for (const q of out) {
      if (Math.abs(q.x - p.x) < sameColumn && y - q.y < minGap) {
        y = q.y + minGap;
      }
    }
    out.push({ key: p.key, x: p.x, y });
  }
  return out;
}
