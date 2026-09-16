import { Columns2, Orbit, RadioTower, RectangleVertical, type LucideIcon } from "lucide-react";

import type { TechnicalStatus } from "@/lib/api/types";
import type { CategoricalTone, PorteurAccent, PorteurIconKey } from "@/lib/network/porteur";

/** lucide icon per Porteur typology icon key. */
export const PORTEUR_ICONS: Record<PorteurIconKey, LucideIcon> = {
  panorama: Orbit,
  double: Columns2,
  single: RectangleVertical,
  infrastructure: RadioTower,
};

/**
 * Porteur type colours (VD-07): categorical tokens `--cat-1..4`, never a status hue.
 * Use with `PORTEUR_TYPES[type].tone`.
 */
export const TONE_TEXT: Record<CategoricalTone, string> = {
  "cat-1": "text-cat-1",
  "cat-2": "text-cat-2",
  "cat-3": "text-cat-3",
  "cat-4": "text-cat-4",
};

/** Solid type colour (compact marker dot, legend swatch). */
export const TONE_BG: Record<CategoricalTone, string> = {
  "cat-1": "bg-cat-1",
  "cat-2": "bg-cat-2",
  "cat-3": "bg-cat-3",
  "cat-4": "bg-cat-4",
};

/** Tinted chip: soft fill + border of the type colour. */
export const TONE_BG_SOFT: Record<CategoricalTone, string> = {
  "cat-1": "bg-cat-1/14 border-cat-1/35",
  "cat-2": "bg-cat-2/14 border-cat-2/35",
  "cat-3": "bg-cat-3/14 border-cat-3/35",
  "cat-4": "bg-cat-4/14 border-cat-4/35",
};

/** @deprecated legacy accent colours (type C used a danger-like red); use `TONE_TEXT`. */
export const ACCENT_TEXT: Record<PorteurAccent, string> = {
  orange: "text-brand-orange-text",
  blue: "text-brand-blue-text",
  red: "text-brand-red-text",
  muted: "text-muted",
};

/** @deprecated use `TONE_BG`. */
export const ACCENT_BG: Record<PorteurAccent, string> = {
  orange: "bg-brand-orange-text",
  blue: "bg-brand-blue-text",
  red: "bg-brand-red-text",
  muted: "bg-muted",
};

/** @deprecated use `TONE_BG_SOFT`. */
export const ACCENT_BG_SOFT: Record<PorteurAccent, string> = {
  orange: "bg-brand-orange-text/14 border-brand-orange-text/35",
  blue: "bg-brand-blue-text/14 border-brand-blue-text/35",
  red: "bg-brand-red-text/14 border-brand-red-text/35",
  muted: "bg-muted/10 border-muted/30",
};

/** Status ring colour of a Porteur marker. */
export const STATUS_RING: Record<TechnicalStatus, string> = {
  ACTIF: "border-success",
  MAINTENANCE: "border-warning",
  INACTIF: "border-muted-2",
  HORS_LIGNE: "border-danger",
};

export const STATUS_DOT: Record<TechnicalStatus, string> = {
  ACTIF: "bg-success",
  MAINTENANCE: "bg-warning",
  INACTIF: "bg-muted-2",
  HORS_LIGNE: "bg-danger",
};
