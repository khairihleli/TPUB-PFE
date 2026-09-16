/**
 * Day/night lighting rig values (pure). `night` = 0 (jour) … 1 (nuit); the engine tweens it and
 * interpolates colours itself.
 */
import { lerp } from "@/components/porteur3d/tween";

export interface LightingValues {
  sunIntensity: number;
  hemiIntensity: number;
  environmentIntensity: number;
  exposure: number;
  /** Screen emissive multiplier (screens glow at night). */
  screenEmissive: number;
  streetLightIntensity: number;
  screenSpillIntensity: number;
  ledStripEmissive: number;
  starsOpacity: number;
  windowGlow: number;
  /** Sun elevation in degrees (moon at night). */
  sunElevationDeg: number;
  sunAzimuthDeg: number;
  fogNear: number;
  fogFar: number;
}

const DAY: LightingValues = {
  sunIntensity: 3.1,
  hemiIntensity: 1.15,
  environmentIntensity: 0.55,
  exposure: 1.0,
  screenEmissive: 1.05,
  streetLightIntensity: 0,
  screenSpillIntensity: 0,
  ledStripEmissive: 0.6,
  starsOpacity: 0,
  windowGlow: 0,
  sunElevationDeg: 50,
  sunAzimuthDeg: 140,
  fogNear: 120,
  fogFar: 680,
};

const NIGHT: LightingValues = {
  sunIntensity: 0.35,
  hemiIntensity: 0.18,
  environmentIntensity: 0.1,
  exposure: 1.2,
  screenEmissive: 1.75,
  streetLightIntensity: 45,
  screenSpillIntensity: 9,
  ledStripEmissive: 3,
  starsOpacity: 0.9,
  windowGlow: 1,
  sunElevationDeg: 38,
  sunAzimuthDeg: 220,
  fogNear: 70,
  fogFar: 520,
};

export function lightingFor(night: number, heightM = 20): LightingValues {
  const t = Math.min(1, Math.max(0, night));
  const out = {} as LightingValues;
  for (const key of Object.keys(DAY) as (keyof LightingValues)[]) {
    out[key] = lerp(DAY[key], NIGHT[key], t);
  }
  // Taller masts need the fog pushed back to keep the head readable from the drone view.
  const k = Math.max(1, heightM / 20);
  out.fogNear *= k;
  out.fogFar *= k;
  // Screen spill scales with the display size (taller Porteur, bigger screen).
  out.screenSpillIntensity *= k * k;
  return out;
}

/** Sun direction (unit vector towards the sun) from elevation/azimuth (0 = north = −Z, clockwise). */
export function sunDirection(elevationDeg: number, azimuthDeg: number): [number, number, number] {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  return [Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)];
}
