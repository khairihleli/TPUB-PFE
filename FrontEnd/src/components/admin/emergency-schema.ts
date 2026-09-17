/**
 * Priority message (« message prioritaire ») model, contract §2.8 v2:
 * - datetime window (start date + time → end date + time), urgency level, duration 5–120 s;
 * - target = a zone, a circle (point + radius picked on the map), or both;
 * - list states PROGRAMME / EN_COURS / TERMINE / DESACTIVE with manual or automatic stop.
 * Client checks mirror the backend rules (EMERGENCY_TARGET_REQUIRED, INVALID_EMERGENCY_WINDOW).
 */
import { z } from "zod";

import { maxChars, parseDecimal, parseInteger, REQUIRED } from "@/components/admin/form-utils";
import type {

  EmergencyResponse,
  EmergencyState,
  SupportResponse,
  UrgencyLevel,
} from "@/lib/api/types";
import type { EmergencyRequestCarte, EmergencyResponseCarte } from "@/lib/api/types-carte";
import { URGENCY_RANK } from "@/lib/campaign-status";
import type { LngLat } from "@/lib/network/geo";
import { pointInPolygon, ringsToGeoJson, validatePolygon } from "@/lib/polygon";
import { toLocalIsoDateTime } from "@/lib/format";
import { withinKm } from "@/lib/geo";

export const URGENCY_LEVELS = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const satisfies readonly UrgencyLevel[];

export const EMERGENCY_FIELDS = [
  "title",
  "content",
  "zoneId",
  "latitude",
  "longitude",
  "radiusKm",
  "startDate",
  "startTime",
  "endDate",
  "endTime",
  "durationSeconds",
  "priority",
  "urgencyLevel",
  /** Round 2: polygon target, serialised as `lng,lat;lng,lat…` (docs/round2-contract.md §4.4). */
  "polygon",
] as const;

export type EmergencyField = (typeof EMERGENCY_FIELDS)[number];

/** Raw form state (strings from the controls). */
export type EmergencyFormValues = Record<EmergencyField, string>;

export const DURATION_MIN = 5;
export const DURATION_MAX = 120;
export const DURATION_DEFAULT = 15;
export const PRIORITY_MAX = 32767; // SMALLINT
export const TITLE_MAX = 200;
export const CONTENT_MAX = 2000;
/** Readable from a distance on a street screen. */
export const TITLE_RECOMMENDED = 60;
export const RADIUS_MIN_KM = 0.1;
export const RADIUS_MAX_KM = 50;
export const RADIUS_DEFAULT_KM = 2;

export function priorityLabel(priority: number): string {
  return priority <= 1 ? "Passe en premier" : `Priorité ${priority}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "2026-09-17T14:37:05" → { date: "2026-09-17", time: "14:37" }. */
function splitLocal(local: string): { date: string; time: string } {
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

export function emptyEmergencyForm(now: Date = new Date()): EmergencyFormValues {
  const { date, time } = splitLocal(toLocalIsoDateTime(now));
  // Start at the next full quarter hour, end the same day at 23:59.
  const [h, m] = time.split(":").map(Number) as [number, number];
  const minutes = Math.min(23 * 60 + 45, Math.ceil((h * 60 + m + 1) / 15) * 15);
  return {
    title: "",
    content: "",
    zoneId: "",
    latitude: "",
    longitude: "",
    radiusKm: String(RADIUS_DEFAULT_KM),
    polygon: "",
    startDate: date,
    startTime: `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`,
    endDate: date,
    endTime: "23:59",
    durationSeconds: String(DURATION_DEFAULT),
    priority: "1",
    urgencyLevel: "HIGH",
  };
}

const TYPED_FIELDS: readonly EmergencyField[] = [
  "title",
  "content",
  "zoneId",
  "latitude",
  "longitude",
  "polygon",
];

// ---------------------------------------------------------------------------
// Polygon target (docs/round2-contract.md §4.4)
// ---------------------------------------------------------------------------

/** `"10.17,36.79;10.19,36.79"` → vertices (empty when blank or malformed). */
export function parsePolygonField(value: string): LngLat[] {
  const out: LngLat[] = [];
  for (const pair of value.split(";")) {
    if (pair.trim() === "") continue;
    const [lng, lat] = pair.split(",").map((n) => Number(n.trim()));
    if (lng === undefined || lat === undefined || !Number.isFinite(lng) || !Number.isFinite(lat)) {
      return [];
    }
    out.push({ lng, lat });
  }
  return out;
}

export function serializePolygonField(vertices: readonly LngLat[]): string {
  return vertices.map((v) => `${v.lng},${v.lat}`).join(";");
}

/** French reason when the polygon cannot be sent (same rules as the backend), else null. */
export function polygonFieldError(value: string): string | null {
  const vertices = parsePolygonField(value);
  if (vertices.length === 0) return "Dessinez le polygone sur la carte.";
  if (vertices.length < 3) return "Un polygone doit avoir au moins 3 sommets.";
  const result = validatePolygon([[vertices]]);
  return result.ok ? null : result.reason;
}

export function activeSupportsInPolygon(
  supports: readonly Pick<SupportResponse, "latitude" | "longitude" | "technicalStatus">[],
  vertices: readonly LngLat[],
): number {
  if (vertices.length < 3) return 0;
  return supports.filter(
    (s) =>
      s.technicalStatus === "ACTIF" &&
      pointInPolygon({ lng: s.longitude, lat: s.latitude }, [[[...vertices]]]),
  ).length;
}

/** True when the user typed a message or chose a target. */
export function isEmergencyFormDirty(values: EmergencyFormValues): boolean {
  return TYPED_FIELDS.some((k) => values[k].trim() !== "");
}

/** Restored drafts may come from an older shape: keep only known string fields. */
export function normalizeEmergencyDraft(raw: unknown, now: Date = new Date()): EmergencyFormValues {
  const base = emptyEmergencyForm(now);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const out = { ...base };
  for (const k of EMERGENCY_FIELDS) if (typeof r[k] === "string") out[k] = r[k];
  return out;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export function withSeconds(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}

/** Local "YYYY-MM-DDTHH:mm:ss" of a date + time (lexicographically comparable). */
export function localDateTime(date: string, time: string): string {
  return `${date}T${withSeconds(time)}`;
}

const requiredText = (max: number) =>
  z.string({ error: REQUIRED }).trim().min(1, { error: REQUIRED }).max(max, maxChars(max));

/**
 * Schema for a given "now" (the window must end in the future). Output = POST /api/emergency body.
 */
export function emergencySchema(now: Date = new Date()) {
  const nowLocal = toLocalIsoDateTime(now);
  return z
    .object({
      title: requiredText(TITLE_MAX),
      content: requiredText(CONTENT_MAX),
      zoneId: z.string().trim(),
      latitude: z.string().trim(),
      longitude: z.string().trim(),
      radiusKm: z.string().trim(),
      startDate: z.string().trim().regex(ISO_DATE, { error: "Date invalide." }),
      startTime: z.string().trim().regex(TIME, { error: "Heure invalide." }),
      endDate: z.string().trim().regex(ISO_DATE, { error: "Date invalide." }),
      endTime: z.string().trim().regex(TIME, { error: "Heure invalide." }),
      durationSeconds: z
        .string()
        .trim()
        .refine(
          (v) => {
            const n = parseInteger(v);
            return n !== null && n >= DURATION_MIN && n <= DURATION_MAX;
          },
          { error: `Entre ${DURATION_MIN} et ${DURATION_MAX} secondes.` },
        ),
      priority: z
        .string()
        .trim()
        .refine(
          (v) => {
            const n = parseInteger(v);
            return n !== null && n >= 1 && n <= PRIORITY_MAX;
          },
          { error: "Nombre entier supérieur ou égal à 1." },
        ),
      urgencyLevel: z.enum(URGENCY_LEVELS, { error: "Choisissez un niveau d'urgence." }),
      polygon: z.string().trim(),
    })
    .superRefine((v, ctx) => {
      const zone = parseInteger(v.zoneId);
      const hasZone = zone !== null && zone > 0;
      const lat = parseDecimal(v.latitude);
      const lng = parseDecimal(v.longitude);
      const radius = parseDecimal(v.radiusKm);
      const anyCircle = v.latitude !== "" || v.longitude !== "";
      const hasPolygon = v.polygon.trim() !== "";
      if (hasPolygon) {
        if (anyCircle) {
          ctx.addIssue({
            code: "custom",
            path: ["polygon"],
            message: "Choisissez un cercle ou un polygone, pas les deux.",
          });
        }
        const reason = polygonFieldError(v.polygon);
        if (reason) ctx.addIssue({ code: "custom", path: ["polygon"], message: reason });
      }
      if (!hasZone && !anyCircle && !hasPolygon) {
        ctx.addIssue({
          code: "custom",
          path: ["latitude"],
          message: "Placez le point sur la carte ou choisissez une zone.",
        });
      }
      if (anyCircle && !hasPolygon) {
        if (lat === null || lat < -90 || lat > 90) {
          ctx.addIssue({ code: "custom", path: ["latitude"], message: "Latitude invalide." });
        }
        if (lng === null || lng < -180 || lng > 180) {
          ctx.addIssue({ code: "custom", path: ["longitude"], message: "Longitude invalide." });
        }
        if (radius === null || radius < RADIUS_MIN_KM || radius > RADIUS_MAX_KM) {
          ctx.addIssue({
            code: "custom",
            path: ["radiusKm"],
            message: `Rayon entre ${RADIUS_MIN_KM} et ${RADIUS_MAX_KM} km.`,
          });
        }
      }
      if (
        ISO_DATE.test(v.startDate) &&
        ISO_DATE.test(v.endDate) &&
        TIME.test(v.startTime) &&
        TIME.test(v.endTime)
      ) {
        const start = localDateTime(v.startDate, v.startTime);
        const end = localDateTime(v.endDate, v.endTime);
        if (end <= start) {
          ctx.addIssue({
            code: "custom",
            path: ["endTime"],
            message: "La fin doit être postérieure au début.",
          });
        } else if (end <= nowLocal) {
          ctx.addIssue({
            code: "custom",
            path: ["endTime"],
            message: "La fin de diffusion est déjà passée.",
          });
        }
      }
    })
    .transform((v): EmergencyRequestCarte => {
      const zone = parseInteger(v.zoneId);
      const polygonVertices = v.polygon.trim() === "" ? [] : parsePolygonField(v.polygon);
      const circle =
        v.latitude !== "" || v.longitude !== ""
          ? {
              latitude: parseDecimal(v.latitude) as number,
              longitude: parseDecimal(v.longitude) as number,
              radiusKm: parseDecimal(v.radiusKm) as number,
            }
          : null;
      const common = {
        title: v.title,
        content: v.content,
        startDate: v.startDate,
        endDate: v.endDate,
        startTime: withSeconds(v.startTime),
        endTime: withSeconds(v.endTime),
        durationSeconds: parseInteger(v.durationSeconds),
        priority: parseInteger(v.priority) ?? 1,
        urgencyLevel: v.urgencyLevel,
      };
      if (polygonVertices.length >= 3) {
        return {
          ...common,
          polygon: ringsToGeoJson([[polygonVertices]]),
          zoneId: zone !== null && zone > 0 ? zone : null,
        };
      }
      if (circle) return { ...common, ...circle, zoneId: zone !== null && zone > 0 ? zone : null };
      return { ...common, zoneId: zone as number };
    });
}

// ---------------------------------------------------------------------------
// Impact on the map (« 4 Porteurs actifs dans le cercle »)
// ---------------------------------------------------------------------------
export function activeSupportsInCircle(
  supports: readonly Pick<SupportResponse, "latitude" | "longitude" | "technicalStatus">[],
  lat: number | null,
  lng: number | null,
  radiusKm: number | null,
): number {
  if (lat === null || lng === null || radiusKm === null || !(radiusKm > 0)) return 0;
  return supports.filter(
    (s) => s.technicalStatus === "ACTIF" && withinKm(s.latitude, s.longitude, lat, lng, radiusKm),
  ).length;
}

export function activeSupportsInZone(
  supports: readonly Pick<SupportResponse, "zoneId" | "technicalStatus">[],
  zoneId: number | null,
): number {
  if (zoneId === null) return 0;
  return supports.filter((s) => s.zoneId === zoneId && s.technicalStatus === "ACTIF").length;
}

// ---------------------------------------------------------------------------
// List model
// ---------------------------------------------------------------------------
type StateInput = Pick<
  EmergencyResponse,
  "isActive" | "startDate" | "endDate" | "startTime" | "endTime" | "state"
> & { stopReason?: EmergencyResponse["stopReason"] };

/** `state` from the backend when present, otherwise derived from the window (pre-v2 payloads). */
export function emergencyStateOf(e: StateInput, now: Date = new Date()): EmergencyState {
  if (e.state) return e.state;
  if (!e.isActive) return e.stopReason === "AUTO" ? "TERMINE" : "DESACTIVE";
  const nowLocal = toLocalIsoDateTime(now);
  const start = localDateTime(e.startDate, e.startTime ?? "00:00:00");
  const end = localDateTime(e.endDate, e.endTime ?? "23:59:59");
  if (nowLocal < start) return "PROGRAMME";
  if (nowLocal > end) return "TERMINE";
  return "EN_COURS";
}

export function isLiveState(state: EmergencyState): boolean {
  return state === "EN_COURS" || state === "PROGRAMME";
}

const STATE_ORDER: Record<EmergencyState, number> = {
  EN_COURS: 0,
  PROGRAMME: 1,
  TERMINE: 2,
  DESACTIVE: 3,
};

/** On-air first, then by urgency (critical first), priority (1 first), newest. */
export function sortEmergencies<T extends EmergencyResponse>(
  items: readonly T[],
  now = new Date(),
): T[] {
  return [...items].sort((a, b) => {
    const sa = STATE_ORDER[emergencyStateOf(a, now)];
    const sb = STATE_ORDER[emergencyStateOf(b, now)];
    if (sa !== sb) return sa - sb;
    const ua = URGENCY_RANK[a.urgencyLevel] ?? 0;
    const ub = URGENCY_RANK[b.urgencyLevel] ?? 0;
    if (ua !== ub) return ub - ua;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.id - a.id;
  });
}

/** « Polygone · Tunis Centre », « Cercle de 2 km · Tunis Centre » or « Zone Tunis Centre ». */
export function emergencyTargetLabel(
  e: Pick<EmergencyResponse, "zoneId" | "zoneName" | "latitude" | "longitude" | "radiusKm"> &
    Pick<EmergencyResponseCarte, "targetPolygon">,
  zoneName: (id: number) => string,
): string {
  const zone = e.zoneName ?? zoneName(e.zoneId);
  if (e.targetPolygon) return `Polygone · ${zone}`;
  if (typeof e.radiusKm === "number" && e.latitude !== null && e.latitude !== undefined) {
    const km = new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 1 }).format(e.radiusKm);
    return `Cercle de ${km} km · ${zone}`;
  }
  return `Zone ${zone}`;
}
