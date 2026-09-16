/**
 * Repère (calibration) scene objects: 1 m grid + 5 m major lines, axes, model bounding box and
 * anchor spheres. Text labels are DOM overlays positioned by the engine (crisp, accessible).
 */
import {
  AxesHelper,
  Box3,
  Box3Helper,
  Color,
  GridHelper,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from "three";

import { disposeObject3D } from "@/components/porteur3d/model-index";
import { paletteInt } from "@/components/porteur3d/studio-palette";
import type { HotspotId, Vec3Tuple } from "@/components/porteur3d/types";

export interface RepereObjects {
  group: Group;
  /** Local positions for DOM labels: axis tips, bbox top, anchors. */
  labels: Record<string, Vec3Tuple>;
  dispose(): void;
}

export function createRepereObjects(
  size: Vec3Tuple,
  anchors: Partial<Record<HotspotId, { position: Vec3Tuple }>>,
): RepereObjects {
  const group = new Group();
  group.name = "Repere";
  const span = Math.max(40, Math.ceil((Math.max(size[0], size[2], size[1]) * 1.6) / 10) * 10);

  const minor = new GridHelper(span, span, paletteInt("gridMinor"), paletteInt("gridMinor"));
  minor.position.y = 0.012;
  minor.material.transparent = true;
  minor.material.opacity = 0.55;
  minor.material.depthWrite = false;
  group.add(minor);
  const major = new GridHelper(span, span / 5, paletteInt("gridMajor"), paletteInt("gridMajor"));
  major.position.y = 0.014;
  major.material.transparent = true;
  major.material.opacity = 0.85;
  major.material.depthWrite = false;
  group.add(major);

  const axisLength = Math.max(5, size[1] * 0.3);
  const axes = new AxesHelper(axisLength);
  axes.setColors(
    new Color(paletteInt("axisX")),
    new Color(paletteInt("axisY")),
    new Color(paletteInt("axisZ")),
  );
  axes.position.y = 0.02;
  axes.material.depthTest = false;
  axes.renderOrder = 998;
  group.add(axes);

  const box = new Box3(
    new Vector3(-size[0] / 2, 0, -size[2] / 2),
    new Vector3(size[0] / 2, size[1], size[2] / 2),
  );
  const boxHelper = new Box3Helper(box, paletteInt("bbox"));
  group.add(boxHelper);

  const anchorMaterial = new MeshBasicMaterial({
    color: paletteInt("anchor"),
    depthTest: false,
    transparent: true,
    opacity: 0.95,
  });
  const anchorGeometry = new SphereGeometry(Math.max(0.08, size[1] * 0.006), 16, 10);
  for (const [id, a] of Object.entries(anchors)) {
    const s = new Mesh(anchorGeometry, anchorMaterial);
    s.name = `Repere_Anchor_${id}`;
    s.position.set(a.position[0], a.position[1], a.position[2]);
    s.renderOrder = 999;
    group.add(s);
  }

  const labels: Record<string, Vec3Tuple> = {
    "axis:x": [axisLength * 1.05, 0.05, 0],
    "axis:y": [0, axisLength * 1.05, 0],
    "axis:z": [0, 0.05, axisLength * 1.05],
    "axis:front": [0, 0.05, -axisLength * 1.05],
    "bbox:top": [size[0] / 2, size[1], -size[2] / 2],
  };
  for (const [id, a] of Object.entries(anchors)) labels[`anchor:${id}`] = a.position;

  return {
    group,
    labels,
    dispose: () => disposeObject3D(group),
  };
}
