/**
 * GLB normalisation math (pure): scale the model to the declared mast height and move the centre
 * of its base to the origin. Operates on plain numbers so it can be tested without a renderer.
 */
import type { Vec3Tuple } from "@/components/porteur3d/types";

export interface BoxLike {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export interface Normalization {
  /** Uniform scale to apply to the model root. */
  scale: number;
  /** Translation applied AFTER scaling (position of the model root). */
  offset: Vec3Tuple;
  /** Size of the model once normalised (m). */
  size: Vec3Tuple;
  warnings: string[];
}

function fmt(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n);
}

export function computeNormalization(
  box: BoxLike,
  options: { targetHeightM: number; autoScale: boolean },
): Normalization {
  const warnings: string[] = [];
  const sx = box.max.x - box.min.x;
  const sy = box.max.y - box.min.y;
  const sz = box.max.z - box.min.z;
  const finite = [sx, sy, sz].every((v) => Number.isFinite(v) && v >= 0);
  if (!finite || sy <= 0) {
    warnings.push("Modèle vide ou boîte englobante invalide : aucune normalisation appliquée.");
    return { scale: 1, offset: [0, 0, 0], size: [0, 0, 0], warnings };
  }

  let scale = 1;
  if (options.autoScale) {
    scale = options.targetHeightM / sy;
    if (sy < 0.5 || sy > 500) {
      warnings.push(
        `Hauteur source de ${fmt(sy)} unités : vérifiez l'unité d'export (le modèle doit être en mètres).`,
      );
    }
  } else if (Math.abs(sy - options.targetHeightM) / options.targetHeightM > 0.1) {
    warnings.push(
      `Hauteur du modèle ${fmt(sy)} m différente de la hauteur déclarée ${fmt(options.targetHeightM)} m (autoScale désactivé).`,
    );
  }

  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  if (Math.hypot(cx, cz) > 0.25 * Math.max(sx, sz, 1) || Math.abs(box.min.y) > 0.05 * sy) {
    warnings.push(
      "Origine du modèle éloignée du centre de la base : recentrage automatique appliqué.",
    );
  }

  return {
    scale,
    offset: [-cx * scale, -box.min.y * scale, -cz * scale],
    size: [sx * scale, sy * scale, sz * scale],
    warnings,
  };
}
