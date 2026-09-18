/**
 * Camera tween math (pure). A view = camera position + orbit target.
 */
import type { Vec3Tuple } from "@/components/porteur3d/types";
import { SCENE_CONFIG } from "@/components/porteur3d/scene-config";

export interface ViewState {
  position: Vec3Tuple;
  target: Vec3Tuple;
}

export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpTuple(a: Vec3Tuple, b: Vec3Tuple, t: number): Vec3Tuple {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function distance(a: Vec3Tuple, b: Vec3Tuple): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Interpolated view at raw progress `t` (0..1, eased inside). The camera path is lifted into a
 * gentle arc proportional to the travelled distance so long moves glide over the scene instead of
 * cutting through the mast.
 */
export function interpolateView(
  from: ViewState,
  to: ViewState,
  t: number,
  arcLift: number = SCENE_CONFIG.tween.arcLift,
): ViewState {
  const k = easeInOutCubic(t);
  const position = lerpTuple(from.position, to.position, k);
  const lift = Math.sin(Math.PI * k) * arcLift * distance(from.position, to.position);
  return {
    position: [position[0], position[1] + lift, position[2]],
    target: lerpTuple(from.target, to.target, k),
  };
}

/** Duration (ms) scaled by travelled distance; 0 with reduced motion. */
export function tweenDuration(from: ViewState, to: ViewState, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  const d = distance(from.position, to.position) + distance(from.target, to.target) * 0.5;
  const { durationMs, minDurationMs } = SCENE_CONFIG.tween;
  if (d < 0.01) return 0;
  return Math.round(
    Math.min(durationMs * 1.4, Math.max(minDurationMs, durationMs * Math.sqrt(d / 40))),
  );
}
