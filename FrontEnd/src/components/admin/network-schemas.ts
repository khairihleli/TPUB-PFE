/** Zone & support (écran) forms: client rules mirroring the DB checks (contract §5.5, §5.6). */
import { z } from "zod";

import {
  maxChars,
  parseDecimal,
  parseInteger,
  REQUIRED,
  roundTo,
} from "@/components/admin/form-utils";
import type {
  MastHeight,
  PorteurType,
  SupportRequest,
  SupportResponse,
  SupportType,
  TechnicalStatus,
  ZoneRequest,
  ZoneResponse,
} from "@/lib/api/types";

export const SUPPORT_TYPES = [
  "ECRAN",
  "PANNEAU_NUMERIQUE",
  "POINT_WIFI",
  "APPLICATION",
  "SITE_WEB",
] as const satisfies readonly SupportType[];

export const TECHNICAL_STATUSES = [
  "ACTIF",
  "INACTIF",
  "MAINTENANCE",
  "HORS_LIGNE",
] as const satisfies readonly TechnicalStatus[];

export const RADIUS_MAX_KM = 500;
export const CAPACITY_MAX = 32767; // SMALLINT

function coordinate(label: "latitude" | "longitude") {
  const limit = label === "latitude" ? 90 : 180;
  return z
    .string({ error: REQUIRED })
    .trim()
    .min(1, { error: REQUIRED })
    .refine((v) => parseDecimal(v) !== null, {
      error: "Nombre décimal attendu (ex. 36.8008).",
    })
    .refine(
      (v) => {
        const n = parseDecimal(v);
        return n === null || (n >= -limit && n <= limit);
      },
      { error: `La ${label} doit être comprise entre -${limit} et ${limit}.` },
    );
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------
export const ZONE_FIELDS = ["name", "latitude", "longitude", "radiusKm", "isActive"] as const;
export type ZoneField = (typeof ZONE_FIELDS)[number];

export interface ZoneFormValues {
  name: string;
  latitude: string;
  longitude: string;
  radiusKm: string;
  isActive: boolean;
}

export function zoneFormFrom(zone?: ZoneResponse | null): ZoneFormValues {
  return {
    name: zone?.name ?? "",
    latitude: zone ? String(zone.latitude) : "",
    longitude: zone ? String(zone.longitude) : "",
    radiusKm: zone?.radiusKm != null ? String(zone.radiusKm) : "",
    isActive: zone?.isActive ?? true,
  };
}

export const zoneSchema = z
  .object({
    name: z.string({ error: REQUIRED }).trim().min(1, { error: REQUIRED }).max(150, maxChars(150)),
    latitude: coordinate("latitude"),
    longitude: coordinate("longitude"),
    radiusKm: z
      .string()
      .trim()
      .refine(
        (v) => {
          if (v === "") return true;
          const n = parseDecimal(v);
          return n !== null && n >= 0.001 && n <= RADIUS_MAX_KM;
        },
        { error: `Rayon strictement positif (0,001 km minimum), ${RADIUS_MAX_KM} km maximum.` },
      ),
    isActive: z.boolean(),
  })
  .transform((v): ZoneRequest => ({
    name: v.name,
    latitude: roundTo(parseDecimal(v.latitude) ?? 0, 7),
    longitude: roundTo(parseDecimal(v.longitude) ?? 0, 7),
    radiusKm: v.radiusKm === "" ? null : roundTo(parseDecimal(v.radiusKm) ?? 0, 3),
    isActive: v.isActive,
  }));

// ---------------------------------------------------------------------------
// Supports
// ---------------------------------------------------------------------------
export const SUPPORT_FIELDS = [
  "zoneId",
  "name",
  "supportType",
  "latitude",
  "longitude",
  "technicalStatus",
  "diffusionCapacity",
  "porteurType",
  "mastHeightM",
  "headingDeg",
  "address",
] as const;
export type SupportField = (typeof SUPPORT_FIELDS)[number];

export type SupportFormValues = Record<SupportField, string>;

/** Porteur fields (Flyway V2). "" = not declared. */
export const PORTEUR_TYPE_OPTIONS = ["A", "B", "C", "D"] as const satisfies readonly PorteurType[];
export const MAST_HEIGHT_OPTIONS = ["15", "20", "25", "30"] as const;
export const ADDRESS_MAX = 255;

export function supportFormFrom(support?: SupportResponse | null): SupportFormValues {
  return {
    zoneId: support ? String(support.zoneId) : "",
    name: support?.name ?? "",
    supportType: support?.supportType ?? "ECRAN",
    latitude: support ? String(support.latitude) : "",
    longitude: support ? String(support.longitude) : "",
    technicalStatus: support?.technicalStatus ?? "ACTIF",
    diffusionCapacity: support ? String(support.diffusionCapacity) : "1",
    porteurType: support?.porteurType ?? "",
    mastHeightM: support?.mastHeightM != null ? String(support.mastHeightM) : "",
    headingDeg: support?.headingDeg != null ? String(support.headingDeg) : "",
    address: support?.address ?? "",
  };
}

/**
 * Values for « Placer un Porteur »: coordinates of the clicked point (6 decimals) and the
 * suggested zone (nearest zone whose radius contains the point), when there is one.
 */
export function supportFormAt(
  point: { lng: number; lat: number },
  zoneId: number | null,
): SupportFormValues {
  return {
    ...supportFormFrom(null),
    zoneId: zoneId !== null ? String(zoneId) : "",
    latitude: String(roundTo(point.lat, 6)),
    longitude: String(roundTo(point.lng, 6)),
  };
}

/** Values for « Créer une zone » at a clicked point (default radius 2 km). */
export function zoneFormAt(point: { lng: number; lat: number }, radiusKm = 2): ZoneFormValues {
  return {
    ...zoneFormFrom(null),
    latitude: String(roundTo(point.lat, 6)),
    longitude: String(roundTo(point.lng, 6)),
    radiusKm: String(radiusKm),
  };
}

/** Full PUT body for a support with some fields replaced (move, quick fixes). */
export function supportRequestFrom(
  support: SupportResponse,
  patch: Partial<SupportRequest> = {},
): SupportRequest {
  return {
    zoneId: support.zoneId,
    name: support.name,
    supportType: support.supportType,
    latitude: support.latitude,
    longitude: support.longitude,
    technicalStatus: support.technicalStatus,
    diffusionCapacity: support.diffusionCapacity,
    porteurType: support.porteurType ?? null,
    mastHeightM: isMastHeightValue(support.mastHeightM) ? support.mastHeightM : null,
    headingDeg: support.headingDeg ?? null,
    address: support.address ?? null,
    ...patch,
  };
}

/** Full PUT body for a zone with some fields replaced (radius handle). */
export function zoneRequestFrom(zone: ZoneResponse, patch: Partial<ZoneRequest> = {}): ZoneRequest {
  return {
    name: zone.name,
    latitude: zone.latitude,
    longitude: zone.longitude,
    radiusKm: zone.radiusKm,
    isActive: zone.isActive,
    ...patch,
  };
}

function isMastHeightValue(v: unknown): v is MastHeight {
  return v === 15 || v === 20 || v === 25 || v === 30;
}

export const supportSchema = z
  .object({
    zoneId: z
      .string({ error: REQUIRED })
      .trim()
      .refine((v) => (parseInteger(v) ?? 0) > 0, { error: "Choisissez une zone." }),
    name: z.string({ error: REQUIRED }).trim().min(1, { error: REQUIRED }).max(150, maxChars(150)),
    supportType: z.enum(SUPPORT_TYPES, { error: "Choisissez un type." }),
    latitude: coordinate("latitude"),
    longitude: coordinate("longitude"),
    technicalStatus: z.enum(TECHNICAL_STATUSES, { error: "Choisissez un état." }),
    diffusionCapacity: z
      .string()
      .trim()
      .refine(
        (v) => {
          if (v === "") return true;
          const n = parseInteger(v);
          return n !== null && n >= 1 && n <= CAPACITY_MAX;
        },
        { error: "Nombre entier supérieur ou égal à 1." },
      ),
    // Porteur fields: optional. Omitted/"" = not declared (null → unchanged on update).
    porteurType: z
      .enum(["", ...PORTEUR_TYPE_OPTIONS], { error: "Choisissez un type A, B, C ou D." })
      .default(""),
    mastHeightM: z
      .enum(["", ...MAST_HEIGHT_OPTIONS], { error: "Hauteur possible : 15, 20, 25 ou 30 m." })
      .default(""),
    headingDeg: z
      .string()
      .trim()
      .default("")
      .refine(
        (v) => {
          if (v === "") return true;
          const n = parseInteger(v);
          return n !== null && n >= 0 && n <= 359;
        },
        { error: "Orientation en degrés entiers, de 0 (nord) à 359." },
      ),
    address: z.string().trim().max(ADDRESS_MAX, maxChars(ADDRESS_MAX)).default(""),
  })
  .transform((v): SupportRequest => ({
    zoneId: parseInteger(v.zoneId) ?? 0,
    name: v.name,
    supportType: v.supportType,
    latitude: roundTo(parseDecimal(v.latitude) ?? 0, 7),
    longitude: roundTo(parseDecimal(v.longitude) ?? 0, 7),
    technicalStatus: v.technicalStatus,
    diffusionCapacity: v.diffusionCapacity === "" ? 1 : (parseInteger(v.diffusionCapacity) ?? 1),
    porteurType: v.porteurType === "" ? null : v.porteurType,
    mastHeightM: v.mastHeightM === "" ? null : (Number(v.mastHeightM) as MastHeight),
    headingDeg: v.headingDeg === "" ? null : (parseInteger(v.headingDeg) ?? null),
    // Blank clears the address on update (backend rule); on create it stays empty.
    address: v.address,
  }));

// ---------------------------------------------------------------------------
// Delete explanation (contract §7.19: FK violations say « check dates and times format »)
// ---------------------------------------------------------------------------
export const ZONE_IN_USE_MESSAGE =
  "Cette zone est encore rattachée à des écrans, des réservations ou des messages prioritaires : la base de données refuse sa suppression. Réaffectez d'abord ces éléments, ou désactivez simplement la zone (modifier › « Zone active »).";

export function isZoneInUseError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const err = e as { status?: unknown; rawMessage?: unknown };
  return (
    err.status === 400 &&
    typeof err.rawMessage === "string" &&
    err.rawMessage.startsWith("Invalid data")
  );
}

/** Screens per zone id. */
export function countSupportsByZone(supports: readonly SupportResponse[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const s of supports) m.set(s.zoneId, (m.get(s.zoneId) ?? 0) + 1);
  return m;
}

/** "36.8008000, 10.1800000" → "36,8008° N · 10,1800° E" (4 decimals, readable). */
export function formatCoordinates(lat: number, lng: number): string {
  const f = (n: number) =>
    new Intl.NumberFormat("fr-TN", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(
      Math.abs(n),
    );
  return `${f(lat)}° ${lat >= 0 ? "N" : "S"} · ${f(lng)}° ${lng >= 0 ? "E" : "O"}`;
}
