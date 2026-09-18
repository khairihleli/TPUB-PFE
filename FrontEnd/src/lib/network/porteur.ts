/**
 * Porteur typology (brief §8.3 + corporate PORTEUR_TYPES, translated, design-intention wording).
 * « Typologies et caractéristiques issues de la conception du Porteur. Elles expriment une
 * intention de conception, pas des performances constatées. » No kW/kWh or audience figures.
 */
import type {
  MastHeight,
  PorteurType,
  SupportResponse,
  SupportType,
  TechnicalStatus,
} from "@/lib/api/types";
import { TECHNICAL_STATUS } from "@/lib/campaign-status";
import { bearingLabel, bearingName, normalizeHeading } from "@/lib/network/geo";

export type { MastHeight, PorteurType } from "@/lib/api/types";

/** Mandatory mention wherever Porteur characteristics are shown. */
export const DESIGN_INTENTION_NOTICE =
  "Typologies et caractéristiques issues de la conception du Porteur. Elles expriment une intention de conception, pas des performances constatées.";

export const INFERRED_TYPE_LABEL = "Typologie estimée";
export const INFERRED_TYPE_HINT =
  "Type de Porteur non déclaré : typologie déduite du type de support, à confirmer par ZELQANE.";

/** How the screen is laid out on the mast. */
export type FaceLayout = "wrap" | "double" | "single" | "none";

/** Icon keys resolved to lucide icons by the UI layer (keeps this module React-free). */
export type PorteurIconKey = "panorama" | "double" | "single" | "infrastructure";

/**
 * Legacy accent family used by map markers and 3D highlights.
 * @deprecated use `tone` / `category` (categorical tokens --cat-1..4, UX-PLAN §4.8).
 */
export type PorteurAccent = "orange" | "blue" | "red" | "muted";

/** Categorical tone (never a status hue): Badge tone / `bg-cat-N` / `text-cat-N`. */
export type CategoricalTone = "cat-1" | "cat-2" | "cat-3" | "cat-4";

export interface PorteurTypeMeta {
  code: PorteurType;
  /** Short name: « Panoramique ». */
  name: string;
  /** Full label: « Écran panoramique 360° ». */
  label: string;
  /** Where it is designed to stand: « Ronds-points et places emblématiques ». */
  context: string;
  /** Screen description (design intention). */
  screen: string;
  /** Designed-for flow. */
  flow: string;
  /** Short paragraph (design intention). */
  description: string;
  /** Number of screen faces: A 1 (wrap), B 2, C 1, D 0. */
  faces: 0 | 1 | 2;
  faceLayout: FaceLayout;
  icon: PorteurIconKey;
  /** Categorical token (A cat-1 orange, B cat-2 blue, C cat-4 teal, D cat-3 violet-grey). */
  tone: CategoricalTone;
  /** 1–4, index of the categorical token. */
  category: 1 | 2 | 3 | 4;
  /** @deprecated legacy marker accent; use `tone`. */
  accent: PorteurAccent;
  /** Whether the typology carries ZELQANE inventory at all. */
  hasScreen: boolean;
  /** Static render in /public. */
  image: string;
}

export const PORTEUR_TYPES: Readonly<Record<PorteurType, PorteurTypeMeta>> = {
  A: {
    code: "A",
    name: "Panoramique",
    label: "Écran panoramique 360°",
    context: "Ronds-points et places emblématiques",
    screen: "Écran courbe à 360° enroulé autour du mât",
    flow: "Véhicules et piétons",
    description:
      "Conçu pour les ronds-points, les places et les entrées de ville : un affichage continu autour du mât, pensé pour être lisible depuis chaque direction d'approche.",
    faces: 1,
    faceLayout: "wrap",
    icon: "panorama",
    tone: "cat-1",
    category: 1,
    accent: "orange",
    hasScreen: true,
    image: "/porteur/porteur-type-a.png",
  },
  B: {
    code: "B",
    name: "Double face",
    label: "Double face",
    context: "Grands axes et corridors à fort trafic",
    screen: "Deux écrans verticaux dos à dos, un par sens de circulation",
    flow: "Véhicules à vitesse élevée",
    description:
      "Conçu pour les grands axes et les rocades : deux écrans verticaux orientés vers chaque sens de circulation, dimensionnés pour une lecture à distance.",
    faces: 2,
    faceLayout: "double",
    icon: "double",
    tone: "cat-2",
    category: 2,
    accent: "blue",
    hasScreen: true,
    image: "/porteur/porteur-type-b.png",
  },
  C: {
    code: "C",
    name: "Hauteur des yeux",
    label: "Écran simple à hauteur des yeux",
    context: "Rues piétonnes, trottoirs et campus",
    screen: "Un écran vertical à échelle humaine",
    flow: "Piétons",
    description:
      "Conçu pour les rues piétonnes, les trottoirs et les campus : un écran unique à hauteur des yeux, avec une emprise au sol réduite.",
    faces: 1,
    faceLayout: "single",
    icon: "single",
    tone: "cat-4",
    category: 4,
    accent: "red",
    hasScreen: true,
    image: "/porteur/porteur-type-c.png",
  },
  D: {
    code: "D",
    name: "Sans écran",
    label: "Infrastructure sans écran",
    context: "Sites ruraux et hors réseau",
    screen: "Aucun écran : connectivité, météo, énergie et supervision",
    flow: "Pas d'inventaire ZELQANE",
    description:
      "Conçu comme support d'infrastructure là où il n'y a pas d'audience à servir : pas d'écran, donc pas d'inventaire publicitaire ZELQANE.",
    faces: 0,
    faceLayout: "none",
    icon: "infrastructure",
    tone: "cat-3",
    category: 3,
    accent: "muted",
    hasScreen: false,
    image: "/porteur/porteur-type-d.png",
  },
};

export const PORTEUR_TYPE_CODES: readonly PorteurType[] = ["A", "B", "C", "D"];

export function isPorteurType(value: unknown): value is PorteurType {
  return value === "A" || value === "B" || value === "C" || value === "D";
}

export interface MastHeightMeta {
  value: MastHeight;
  tier: string;
  description: string;
}

/** Mast heights (design intention). No power/energy figures in the client UI. */
export const MAST_HEIGHTS: readonly MastHeightMeta[] = [
  {
    value: 15,
    tier: "Compact",
    description: "Pensé pour les rues et les espaces à échelle humaine.",
  },
  { value: 20, tier: "Urbain", description: "Pensé pour les carrefours et les avenues urbaines." },
  { value: 25, tier: "Majeur", description: "Pensé pour les grands carrefours et les places." },
  { value: 30, tier: "Phare", description: "Pensé pour les grands axes et les points de repère." },
];

export const MAST_HEIGHT_VALUES: readonly MastHeight[] = [15, 20, 25, 30];

/** Default mast height when none is declared (visual scale only). */
export const DEFAULT_MAST_HEIGHT: MastHeight = 20;

export function isMastHeight(value: unknown): value is MastHeight {
  return value === 15 || value === 20 || value === 25 || value === 30;
}

export function mastHeightMeta(value: number | null | undefined): MastHeightMeta | null {
  return MAST_HEIGHTS.find((m) => m.value === value) ?? null;
}

/** « 25 m · Majeur », or null when not declared. */
export function formatMastHeight(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const meta = mastHeightMeta(value);
  return meta ? `${meta.value} m · ${meta.tier}` : `${value} m`;
}

export interface ResolvedPorteurType {
  type: PorteurType;
  /** True when deduced from supportType (UI shows « typologie estimée »). */
  inferred: boolean;
}

const INFERRED_FROM_SUPPORT_TYPE: Partial<Record<SupportType, PorteurType>> = {
  ECRAN: "A",
  PANNEAU_NUMERIQUE: "C",
  POINT_WIFI: "D",
};

type PorteurSource = Pick<SupportResponse, "supportType"> & {
  porteurType?: string | null;
};

/** Declared `porteurType` wins; else ECRAN→A, PANNEAU_NUMERIQUE→C, POINT_WIFI→D, other→C. */
export function resolvePorteurType(support: PorteurSource): ResolvedPorteurType {
  if (isPorteurType(support.porteurType)) return { type: support.porteurType, inferred: false };
  return { type: INFERRED_FROM_SUPPORT_TYPE[support.supportType] ?? "C", inferred: true };
}

type BookableSource = PorteurSource & Pick<SupportResponse, "technicalStatus">;

/** Bookable = technicalStatus ACTIF and type ≠ D. */
export function isBookable(support: BookableSource): boolean {
  return support.technicalStatus === "ACTIF" && resolvePorteurType(support).type !== "D";
}

/** French reason why booking is disabled, or null when bookable. Type D is reported first. */
export function bookingBlockReason(support: BookableSource): string | null {
  if (resolvePorteurType(support).type === "D") {
    return "Porteur de type D : infrastructure sans écran, non réservable.";
  }
  switch (support.technicalStatus) {
    case "ACTIF":
      return null;
    case "MAINTENANCE":
      return "Porteur en maintenance : réservation indisponible pour le moment.";
    case "HORS_LIGNE":
      return "Porteur hors ligne : réservation indisponible pour le moment.";
    case "INACTIF":
      return "Porteur inactif : réservation indisponible.";
  }
}

export function technicalStatusLabel(status: TechnicalStatus): string {
  return TECHNICAL_STATUS[status]?.label ?? status;
}

/** « Écran principal orienté NE », or null when no heading is declared / type D. */
export function orientationLabel(
  headingDeg: number | null | undefined,
  type?: PorteurType,
): string | null {
  if (headingDeg === null || headingDeg === undefined || !Number.isFinite(headingDeg)) return null;
  if (type === "D") return null;
  const deg = Math.round(normalizeHeading(headingDeg));
  if (type === "A") return `Écran 360°, face principale orientée ${bearingLabel(deg)}`;
  return `Écran principal orienté ${bearingLabel(deg)}`;
}

/** Screen-reader variant with the full compass name and degrees. */
export function orientationSpoken(headingDeg: number | null | undefined): string | null {
  if (headingDeg === null || headingDeg === undefined || !Number.isFinite(headingDeg)) return null;
  const deg = Math.round(normalizeHeading(headingDeg));
  return `orienté ${bearingName(deg)} (${deg}°)`;
}

type LabelSource = BookableSource & Pick<SupportResponse, "name">;

/** « Porteur Type A — Écran LED Avenue Habib Bourguiba — Actif » (+ « typologie estimée »). */
export function porteurAriaLabel(support: LabelSource, options: { selected?: boolean } = {}) {
  const { type, inferred } = resolvePorteurType(support);
  const parts = [
    `Porteur Type ${type}${inferred ? " (typologie estimée)" : ""}`,
    support.name,
    technicalStatusLabel(support.technicalStatus),
  ];
  if (options.selected) parts.push("sélectionné");
  return parts.join(" — ");
}

/** Faces selectable for the creative preview (studio « face » selector). */
export function previewFaces(type: PorteurType): { value: "all" | 1 | 2; label: string }[] {
  switch (type) {
    case "A":
      return [{ value: "all", label: "360°" }];
    case "B":
      return [
        { value: "all", label: "Les deux" },
        { value: 1, label: "Face 1" },
        { value: 2, label: "Face 2" },
      ];
    case "C":
      return [{ value: "all", label: "Face unique" }];
    case "D":
      return [];
  }
}
