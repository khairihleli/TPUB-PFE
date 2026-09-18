/**
 * Procedural Porteur (types A–D) at metric scale, built from `computePorteurDimensions`.
 * Parts follow the GLB naming convention (Screen_360, Screen_Face_1/2, Energy_Sphere, Hotspot_*),
 * so the engine drives the procedural model and a delivered GLB through the same code path.
 *
 * No renderer and no canvas required (textures are optional) → buildable in jsdom tests.
 */
import {
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Path,
  PlaneGeometry,
  RepeatWrapping,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  computeHotspotAnchors,
  computePorteurDimensions,
  flutedRadiusFactor,
  mastRadiusAt,
  wingAngles,
  type PorteurDimensions,
} from "@/components/porteur3d/porteur-dimensions";
import { paletteInt, paletteRgba } from "@/components/porteur3d/studio-palette";
import { bandAspect } from "@/components/porteur3d/texture-math";
import type { StudioPorteurType } from "@/components/porteur3d/types";

export interface PorteurMaterials {
  aluminium: MeshPhysicalMaterial;
  aluminiumDark: MeshStandardMaterial;
  steelDark: MeshStandardMaterial;
  plinth: MeshStandardMaterial;
  bezel: MeshStandardMaterial;
  led: MeshStandardMaterial;
  solarCell: MeshPhysicalMaterial;
  copper: MeshStandardMaterial;
  gold: MeshStandardMaterial;
  sphereCore: MeshStandardMaterial;
  shellDark: MeshStandardMaterial;
  sensor: MeshStandardMaterial;
}

function canvas2d(width: number, height: number): CanvasRenderingContext2D | null {
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

/** Photovoltaic cell grid (null when no 2D canvas is available, e.g. jsdom). */
function createSolarCellTexture(): CanvasTexture | null {
  const ctx = canvas2d(256, 256);
  if (!ctx) return null;
  ctx.fillStyle = paletteRgba("solarCell", 1);
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = paletteRgba("solarGrid", 0.55);
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }
  ctx.strokeStyle = paletteRgba("solarGrid", 0.18);
  ctx.lineWidth = 1;
  for (let i = 16; i < 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
  }
  const tex = new CanvasTexture(ctx.canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  return tex;
}

export function createPorteurMaterials(): PorteurMaterials {
  const solarMap = createSolarCellTexture();
  return {
    aluminium: new MeshPhysicalMaterial({
      name: "M_Aluminium",
      color: paletteInt("aluminium"),
      metalness: 0.85,
      roughness: 0.3,
      anisotropy: 0.55,
      clearcoat: 0.15,
      clearcoatRoughness: 0.4,
    }),
    aluminiumDark: new MeshStandardMaterial({
      name: "M_Aluminium_Dark",
      color: paletteInt("aluminiumDark"),
      metalness: 0.85,
      roughness: 0.42,
    }),
    steelDark: new MeshStandardMaterial({
      name: "M_Steel_Dark",
      color: paletteInt("steelDark"),
      metalness: 0.7,
      roughness: 0.5,
    }),
    plinth: new MeshStandardMaterial({
      name: "M_Plinth",
      color: paletteInt("plinth"),
      metalness: 0.55,
      roughness: 0.6,
    }),
    bezel: new MeshStandardMaterial({
      name: "M_Bezel",
      color: paletteInt("bezel"),
      metalness: 0.4,
      roughness: 0.35,
    }),
    led: new MeshStandardMaterial({
      name: "M_Led",
      color: paletteInt("ledStrip"),
      emissive: paletteInt("ledStrip"),
      emissiveIntensity: 0.6,
      roughness: 0.3,
    }),
    solarCell: new MeshPhysicalMaterial({
      name: "M_Solar",
      color: solarMap ? paletteInt("white") : paletteInt("solarCell"),
      map: solarMap,
      metalness: 0.35,
      roughness: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
    copper: new MeshStandardMaterial({
      name: "M_Copper",
      color: paletteInt("copper"),
      metalness: 1,
      roughness: 0.28,
      side: DoubleSide,
    }),
    gold: new MeshStandardMaterial({
      name: "M_Gold",
      color: paletteInt("gold"),
      metalness: 1,
      roughness: 0.22,
    }),
    sphereCore: new MeshStandardMaterial({
      name: "M_Sphere_Core",
      color: paletteInt("sphereCore"),
      metalness: 0.75,
      roughness: 0.3,
    }),
    shellDark: new MeshStandardMaterial({
      name: "M_Shell_Dark",
      color: paletteInt("sphereShellDark"),
      metalness: 0.6,
      roughness: 0.4,
      side: DoubleSide,
    }),
    sensor: new MeshStandardMaterial({
      name: "M_Sensor",
      color: paletteInt("sensorBody"),
      metalness: 0.3,
      roughness: 0.5,
    }),
  };
}

/** Display material: near-black panel lit by its emissive map (the creative). */
export function createScreenMaterial(name = "M_Screen"): MeshStandardMaterial {
  return new MeshStandardMaterial({
    name,
    color: paletteInt("screenOff"),
    emissive: paletteInt("white"),
    emissiveIntensity: 1,
    metalness: 0.1,
    roughness: 0.52,
  });
}

/** Tapered cylinder with vertical rounded grooves (flutes). Open-ended. */
export function createFlutedMastGeometry(
  bottomRadius: number,
  topRadius: number,
  height: number,
  flutes = 18,
  depth = 0.06,
): BufferGeometry {
  const radialSegments = flutes * 6;
  const geo = new CylinderGeometry(topRadius, bottomRadius, height, radialSegments, 1, true);
  const pos = geo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const theta = Math.atan2(x, z);
    const f = flutedRadiusFactor(theta, flutes, depth);
    pos.setX(i, x * f);
    pos.setZ(i, z * f);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function mesh(
  geometry: BufferGeometry,
  material: MeshStandardMaterial,
  name: string,
  shadow = true,
): Mesh {
  const m = new Mesh(geometry, material);
  m.name = name;
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

function buildBase(d: PorteurDimensions, mats: PorteurMaterials): Group {
  const g = new Group();
  g.name = "Base";
  const plate = mesh(
    new CylinderGeometry(d.plateRadius, d.plateRadius * 1.02, d.plateHeight, 56),
    mats.steelDark,
    "Base_Plate",
  );
  plate.position.y = d.plateHeight / 2;
  g.add(plate);

  const bolts: BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const b = new CylinderGeometry(0.035, 0.035, 0.08, 8);
    b.translate(
      Math.cos(a) * d.plateRadius * 0.86,
      d.plateHeight + 0.04,
      Math.sin(a) * d.plateRadius * 0.86,
    );
    bolts.push(b);
  }
  const merged = mergeGeometries(bolts);
  bolts.forEach((b) => b.dispose());
  if (merged) g.add(mesh(merged, mats.gold, "Base_Bolts"));

  const plinthH = d.plinthHeight - d.plateHeight;
  const plinth = mesh(
    new CylinderGeometry(d.plinthRadius * 0.9, d.plinthRadius, plinthH, 64),
    mats.plinth,
    "Base_Plinth",
  );
  plinth.position.y = d.plateHeight + plinthH / 2;
  g.add(plinth);

  const ring = mesh(
    new TorusGeometry(d.plinthRadius * 0.9, 0.025, 8, 64),
    mats.aluminiumDark,
    "Base_Ring",
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = d.plinthHeight;
  g.add(ring);

  const sleeveH = 0.35;
  const sleeve = mesh(
    new CylinderGeometry(d.mastBaseRadius * 1.08, d.plinthRadius * 0.62, sleeveH, 48),
    mats.aluminiumDark,
    "Base_Sleeve",
  );
  sleeve.position.y = d.plinthHeight + sleeveH / 2;
  g.add(sleeve);
  return g;
}

function buildMast(d: PorteurDimensions, mats: PorteurMaterials): Group {
  const g = new Group();
  g.name = "Mast";
  const h = d.headY - d.plinthHeight;
  const shaft = mesh(
    createFlutedMastGeometry(d.mastBaseRadius, d.mastTopRadius, h, 18, 0.07),
    mats.aluminium,
    "Mast_Shaft",
  );
  shaft.position.y = d.plinthHeight + h / 2;
  g.add(shaft);

  // LED strips (blue light slots along the mast, see renders).
  const angles = d.type === "B" ? [Math.PI / 2, -Math.PI / 2] : [Math.PI];
  d.ledStrips.forEach((strip, i) => {
    for (const a of angles) {
      const r = mastRadiusAt(d, strip.centerY) * 0.97;
      const led = mesh(
        new BoxGeometry(0.055, strip.length, 0.04),
        mats.led,
        `Led_Strip_${i + 1}`,
        false,
      );
      // Angle measured like CylinderGeometry: x = r sin a, z = r cos a (π → −Z front).
      led.position.set(Math.sin(a) * r, strip.centerY, Math.cos(a) * r);
      led.rotation.y = a;
      g.add(led);
    }
  });

  const upperH = d.sphereY - d.headY;
  const upper = mesh(
    new CylinderGeometry(d.upperMastRadius, d.upperMastRadius * 1.25, upperH, 32),
    mats.aluminium,
    "Mast_Upper",
  );
  upper.position.y = d.headY + upperH / 2;
  g.add(upper);
  return g;
}

function buildSolarHead(d: PorteurDimensions, mats: PorteurMaterials): Group {
  const g = new Group();
  g.name = "Solar_Head";
  g.position.y = d.headY;

  const collar = mesh(
    new CylinderGeometry(d.collarRadius * 0.92, d.collarRadius, d.collarHeight, 48),
    mats.steelDark,
    "Solar_Collar",
  );
  collar.position.y = -d.collarHeight * 0.2;
  g.add(collar);
  const lip = mesh(
    new TorusGeometry(d.collarRadius, 0.03, 8, 48),
    mats.aluminiumDark,
    "Solar_Collar_Lip",
  );
  lip.rotation.x = Math.PI / 2;
  lip.position.y = d.collarHeight * 0.3;
  g.add(lip);

  const tilt = (d.wingTiltDeg * Math.PI) / 180;
  const tan = Math.tan(tilt);
  const rootY = d.collarHeight * 0.45;
  const slabT = 0.07;
  for (const [i, phi] of wingAngles(d.wingCount).entries()) {
    const wing = new Group();
    wing.name = `Solar_Wing_${i + 1}`;
    wing.rotation.y = phi;

    const slab = mesh(
      new BoxGeometry(d.wingSpan, slabT, d.wingWidth),
      mats.aluminiumDark,
      `Solar_Frame_${i + 1}`,
    );
    slab.position.set(
      d.collarRadius * 0.8 + (d.wingSpan / 2) * Math.cos(tilt),
      rootY - (d.wingSpan / 2) * Math.sin(tilt),
      0,
    );
    slab.rotation.z = -tilt;
    const cells = mesh(
      new PlaneGeometry(d.wingSpan * 0.95, d.wingWidth * 0.9),
      mats.solarCell,
      `Solar_Panel_${i + 1}`,
    );
    cells.rotation.x = -Math.PI / 2;
    cells.position.y = slabT / 2 + 0.004;
    slab.add(cells);
    wing.add(slab);

    // Triangular arm under the panel, with a cut-out (truss look).
    const x0 = d.mastTopRadius * 0.95;
    const reach = d.wingSpan * 0.82;
    const drop = d.wingSpan * 0.5;
    const topY = rootY - slabT;
    const shape = new Shape();
    shape.moveTo(x0, -drop);
    shape.lineTo(x0, topY);
    shape.lineTo(x0 + reach, topY - reach * tan);
    shape.closePath();
    const inset = 0.22;
    const hole = new Path();
    const cx = x0 + reach / 3;
    const cy = (-drop + topY + topY - reach * tan) / 3;
    const pts: [number, number][] = [
      [x0, -drop],
      [x0, topY],
      [x0 + reach, topY - reach * tan],
    ];
    const inner = pts.map(
      ([px, py]) =>
        [cx + (px - cx) * (1 - inset * 1.6), cy + (py - cy) * (1 - inset * 1.6)] as const,
    );
    const [h0, h1, h2] = inner;
    if (h0 && h1 && h2) {
      hole.moveTo(h0[0], h0[1]);
      hole.lineTo(h2[0], h2[1]);
      hole.lineTo(h1[0], h1[1]);
      hole.closePath();
      shape.holes.push(hole);
    }
    const armGeo = new ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false });
    armGeo.translate(0, 0, -0.03);
    wing.add(mesh(armGeo, mats.aluminium, `Solar_Arm_${i + 1}`));
    g.add(wing);
  }

  // Small top panel on a short post, facing up/south (renders show it above the hub).
  const post = mesh(new CylinderGeometry(0.05, 0.05, 0.5, 12), mats.steelDark, "Solar_Top_Post");
  post.position.y = rootY + 0.25;
  g.add(post);
  const topSize = d.wingWidth * 0.95;
  const top = new Group();
  top.name = "Solar_Top";
  top.position.y = rootY + 0.5;
  const topFrame = mesh(
    new BoxGeometry(topSize, 0.06, topSize),
    mats.aluminiumDark,
    "Solar_Top_Frame",
  );
  topFrame.rotation.x = 0.42;
  const topCells = mesh(
    new PlaneGeometry(topSize * 0.92, topSize * 0.92),
    mats.solarCell,
    "Solar_Panel_Top",
  );
  topCells.rotation.x = -Math.PI / 2;
  topCells.position.y = 0.034;
  topFrame.add(topCells);
  top.add(topFrame);
  g.add(top);
  return g;
}

function buildEnergySphere(d: PorteurDimensions, mats: PorteurMaterials): Group {
  const R = d.sphereRadius;
  const g = new Group();
  g.name = "Energy_Sphere";
  g.position.y = d.sphereY;

  g.add(mesh(new SphereGeometry(R * 0.64, 40, 24), mats.sphereCore, "Sphere_Core"));

  const petals = 6;
  for (let i = 0; i < petals; i++) {
    const phiStart = (i / petals) * Math.PI * 2;
    const geo = new SphereGeometry(
      i % 2 === 0 ? R : R * 0.93,
      18,
      16,
      phiStart,
      (Math.PI * 2 * 0.8) / petals,
      Math.PI * 0.1,
      Math.PI * 0.8,
    );
    const petal = mesh(geo, i % 2 === 0 ? mats.copper : mats.shellDark, `Sphere_Shell_${i + 1}`);
    // Helical twist: each shell leans like a turbine blade.
    petal.rotation.set(0.22 * Math.cos(phiStart), 0, 0.22 * Math.sin(phiStart));
    g.add(petal);
  }

  const equator = mesh(new TorusGeometry(R * 1.02, R * 0.022, 8, 64), mats.gold, "Sphere_Ring");
  equator.rotation.x = Math.PI / 2;
  g.add(equator);
  const meridian = mesh(new TorusGeometry(R * 1.0, R * 0.016, 6, 64), mats.gold, "Sphere_Meridian");
  meridian.rotation.y = Math.PI / 4;
  g.add(meridian);

  const bearing = mesh(
    new CylinderGeometry(d.upperMastRadius * 1.6, d.upperMastRadius * 1.6, R * 0.35, 20),
    mats.steelDark,
    "Sphere_Bearing",
  );
  bearing.position.y = -R * 0.98;
  g.add(bearing);
  const cap = mesh(new SphereGeometry(R * 0.09, 12, 8), mats.gold, "Sphere_Cap");
  cap.position.y = R * 0.98;
  g.add(cap);
  return g;
}

function buildScreens(
  d: PorteurDimensions,
  mats: PorteurMaterials,
): { group: Group; screenMaterials: MeshStandardMaterial[] } {
  const group = new Group();
  group.name = "Display_Assembly";
  const screenMaterials: MeshStandardMaterial[] = [];
  const s = d.screen;
  if (!s) return { group, screenMaterials };

  if (s.kind === "band") {
    group.position.y = s.centerY;
    const backing = mesh(
      new CylinderGeometry(s.radius * 0.975, s.radius * 0.975, s.height * 1.01, 64),
      mats.bezel,
      "Display_Backing",
    );
    group.add(backing);
    const material = createScreenMaterial("M_Screen");
    screenMaterials.push(material);
    const band = mesh(
      new CylinderGeometry(s.radius, s.radius, s.height, 160, 1, true),
      material,
      "Screen_360",
      false,
    );
    band.receiveShadow = true;
    band.userData.aspect = bandAspect(s.radius, s.height);
    group.add(band);
    for (const sign of [1, -1]) {
      const rim = mesh(
        new CylinderGeometry(s.radius + 0.06, s.radius + 0.06, 0.16, 80),
        mats.steelDark,
        sign > 0 ? "Display_Rim_Top" : "Display_Rim_Bottom",
      );
      rim.position.y = sign * (s.height / 2 + 0.08);
      group.add(rim);
      const lip = mesh(
        new TorusGeometry(s.radius + 0.06, 0.018, 6, 80),
        mats.aluminium,
        "Display_Rim_Lip",
      );
      lip.rotation.x = Math.PI / 2;
      lip.position.y = sign * (s.height / 2 + 0.16);
      group.add(lip);
    }
    return { group, screenMaterials };
  }

  group.position.y = s.centerY;
  const mastR = mastRadiusAt(d, s.centerY);
  for (const face of s.faces) {
    const sign = face === 1 ? -1 : 1;
    const cabinet = mesh(
      new BoxGeometry(s.width + 0.14, s.height + 0.14, s.cabinetDepth),
      mats.bezel,
      `Display_Cabinet_${face}`,
    );
    cabinet.position.z = sign * (s.offset - s.cabinetDepth / 2);
    group.add(cabinet);

    const material = createScreenMaterial(`M_Screen_Face_${face}`);
    screenMaterials.push(material);
    const panel = mesh(
      new PlaneGeometry(s.width, s.height),
      material,
      `Screen_Face_${face}`,
      false,
    );
    panel.receiveShadow = true;
    panel.position.z = sign * (s.offset + 0.003);
    panel.rotation.y = face === 1 ? Math.PI : 0;
    panel.userData.aspect = s.width / s.height;
    group.add(panel);

    const bracketLen = Math.max(0.05, s.offset - s.cabinetDepth - mastR + 0.04);
    for (const dy of [-0.3, 0.3]) {
      const bracket = mesh(
        new BoxGeometry(0.14, 0.14, bracketLen),
        mats.steelDark,
        `Display_Bracket_${face}`,
      );
      bracket.position.set(0, dy * s.height, sign * (mastR - 0.02 + bracketLen / 2));
      group.add(bracket);
    }
  }
  return { group, screenMaterials };
}

function buildSensors(d: PorteurDimensions, mats: PorteurMaterials): Group {
  const g = new Group();
  g.name = "Sensors";
  const pod = d.sensorPod;
  const podR = mastRadiusAt(d, pod.centerY);
  const body = mesh(new BoxGeometry(pod.depth, pod.height, pod.width), mats.sensor, "Sensor_Pod");
  body.position.set(podR + pod.depth / 2, pod.centerY, 0);
  g.add(body);
  const dome = mesh(
    new SphereGeometry(pod.width * 0.32, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    mats.sensor,
    "Sensor_Dome",
  );
  dome.position.set(podR + pod.depth / 2, pod.centerY + pod.height / 2, 0);
  g.add(dome);
  for (const dz of [-pod.width * 0.3, pod.width * 0.3]) {
    const antenna = mesh(
      new CylinderGeometry(0.012, 0.012, pod.height * 0.9, 6),
      mats.steelDark,
      "Sensor_Antenna",
    );
    antenna.position.set(podR + pod.depth * 0.8, pod.centerY + pod.height, dz);
    g.add(antenna);
  }

  const cab = d.sensorCabinet;
  if (cab) {
    const r = mastRadiusAt(d, cab.centerY);
    const box = mesh(
      new BoxGeometry(cab.width, cab.height, cab.depth),
      mats.sensor,
      "Sensor_Cabinet",
    );
    box.position.set(0, cab.centerY, -(r + cab.depth / 2));
    g.add(box);
    for (let i = 0; i < 5; i++) {
      const louvre = mesh(
        new BoxGeometry(cab.width * 0.8, 0.025, 0.03),
        mats.steelDark,
        "Sensor_Louvre",
        false,
      );
      louvre.position.set(0, cab.centerY - cab.height * 0.3 + i * 0.07, -(r + cab.depth + 0.012));
      g.add(louvre);
    }
    const status = mesh(new BoxGeometry(0.08, 0.08, 0.02), mats.led, "Sensor_Status_Led", false);
    status.position.set(cab.width * 0.3, cab.centerY + cab.height * 0.32, -(r + cab.depth + 0.012));
    g.add(status);
  }
  return g;
}

export interface ProceduralPorteur {
  root: Group;
  dims: PorteurDimensions;
  materials: PorteurMaterials;
  screenMaterials: MeshStandardMaterial[];
}

export function buildProceduralPorteur(
  type: StudioPorteurType,
  mastHeightM?: number | null,
): ProceduralPorteur {
  const dims = computePorteurDimensions(type, mastHeightM);
  const materials = createPorteurMaterials();
  const root = new Group();
  root.name = `Porteur_Type_${type}`;

  root.add(buildBase(dims, materials));
  root.add(buildMast(dims, materials));
  const { group: screens, screenMaterials } = buildScreens(dims, materials);
  root.add(screens);
  root.add(buildSensors(dims, materials));
  root.add(buildSolarHead(dims, materials));
  root.add(buildEnergySphere(dims, materials));

  const anchors = computeHotspotAnchors(dims);
  for (const [id, anchor] of Object.entries(anchors)) {
    const empty = new Object3D();
    empty.name = `Hotspot_${id}`;
    empty.position.set(anchor.position[0], anchor.position[1], anchor.position[2]);
    empty.userData.normal = anchor.normal;
    root.add(empty);
  }
  root.updateMatrixWorld(true);
  return { root, dims, materials, screenMaterials };
}
