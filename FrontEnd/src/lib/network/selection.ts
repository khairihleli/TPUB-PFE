/**
 * Immutable selection model shared by the map, the lists and the booking flows.
 * Invariants kept by every reducer: ids are unique, insertion order is preserved, only
 * bookable Porteurs are ever added, and a zone id means « the whole zone was chosen ».
 */
import type { PorteurType, SupportResponse, ZoneResponse } from "@/lib/api/types";
import { haversineDistance, type LngLat } from "@/lib/network/geo";
import { isBookable, resolvePorteurType } from "@/lib/network/porteur";

export interface Selection {
  zoneIds: number[];
  supportIds: number[];
}

export const EMPTY_SELECTION: Selection = Object.freeze({
  zoneIds: [],
  supportIds: [],
});

type SelectableSupport = Pick<
  SupportResponse,
  "id" | "zoneId" | "supportType" | "technicalStatus" | "latitude" | "longitude"
> & { porteurType?: SupportResponse["porteurType"] };

function unique(ids: readonly number[]): number[] {
  return [...new Set(ids.filter((id) => Number.isFinite(id)))];
}

/** Dedupes ids (keeps first occurrence). Accepts partial/undefined input. */
export function normalizeSelection(sel?: Partial<Selection> | null): Selection {
  return { zoneIds: unique(sel?.zoneIds ?? []), supportIds: unique(sel?.supportIds ?? []) };
}

export function createSelection(zoneIds: number[] = [], supportIds: number[] = []): Selection {
  return normalizeSelection({ zoneIds, supportIds });
}

export function isZoneSelected(sel: Selection, zoneId: number): boolean {
  return sel.zoneIds.includes(zoneId);
}

export function isSupportSelected(sel: Selection, supportId: number): boolean {
  return sel.supportIds.includes(supportId);
}

export function isSelectionEmpty(sel: Selection): boolean {
  return sel.zoneIds.length === 0 && sel.supportIds.length === 0;
}

export function selectionEquals(a: Selection, b: Selection): boolean {
  return (
    a.zoneIds.length === b.zoneIds.length &&
    a.supportIds.length === b.supportIds.length &&
    a.zoneIds.every((id, i) => b.zoneIds[i] === id) &&
    a.supportIds.every((id, i) => b.supportIds[i] === id)
  );
}

export function clearSelection(): Selection {
  return { zoneIds: [], supportIds: [] };
}

/** Bookable supports of a zone, input order. */
export function bookableSupportsOfZone<S extends SelectableSupport>(
  zoneId: number,
  supports: readonly S[],
): S[] {
  return supports.filter((s) => s.zoneId === zoneId && isBookable(s));
}

/**
 * Toggle a zone. Selecting adds the zone and all its bookable Porteurs; deselecting removes the
 * zone and every Porteur of that zone.
 */
export function toggleZone(
  sel: Selection,
  zoneId: number,
  supports: readonly SelectableSupport[],
): Selection {
  if (isZoneSelected(sel, zoneId)) {
    const zoneSupportIds = new Set(supports.filter((s) => s.zoneId === zoneId).map((s) => s.id));
    return {
      zoneIds: sel.zoneIds.filter((id) => id !== zoneId),
      supportIds: sel.supportIds.filter((id) => !zoneSupportIds.has(id)),
    };
  }
  return {
    zoneIds: unique([...sel.zoneIds, zoneId]),
    supportIds: unique([
      ...sel.supportIds,
      ...bookableSupportsOfZone(zoneId, supports).map((s) => s.id),
    ]),
  };
}

/**
 * Toggle one Porteur. A non-bookable Porteur is never added (selection returned unchanged).
 * Removing a Porteur also drops its zone flag: the zone is no longer chosen as a whole.
 * Unknown ids can still be removed.
 */
export function toggleSupport(
  sel: Selection,
  supportId: number,
  supports: readonly SelectableSupport[],
): Selection {
  const support = supports.find((s) => s.id === supportId);
  if (isSupportSelected(sel, supportId)) {
    return {
      zoneIds: support ? sel.zoneIds.filter((id) => id !== support.zoneId) : [...sel.zoneIds],
      supportIds: sel.supportIds.filter((id) => id !== supportId),
    };
  }
  if (!support || !isBookable(support)) return sel;
  return { zoneIds: [...sel.zoneIds], supportIds: [...sel.supportIds, supportId] };
}

/** Adds several Porteurs (non-bookable and unknown ids ignored). */
export function addSupports(
  sel: Selection,
  supportIds: readonly number[],
  supports: readonly SelectableSupport[],
): Selection {
  const byId = new Map(supports.map((s) => [s.id, s]));
  const add = supportIds.filter((id) => {
    const s = byId.get(id);
    return !!s && isBookable(s);
  });
  if (add.every((id) => sel.supportIds.includes(id))) return sel;
  return { zoneIds: [...sel.zoneIds], supportIds: unique([...sel.supportIds, ...add]) };
}

/** Removes several Porteurs (and the zone flags of their zones). */
export function removeSupports(
  sel: Selection,
  supportIds: readonly number[],
  supports: readonly SelectableSupport[],
): Selection {
  const remove = new Set(supportIds.filter((id) => sel.supportIds.includes(id)));
  if (remove.size === 0) return sel;
  const zonesTouched = new Set(supports.filter((s) => remove.has(s.id)).map((s) => s.zoneId));
  return {
    zoneIds: sel.zoneIds.filter((id) => !zonesTouched.has(id)),
    supportIds: sel.supportIds.filter((id) => !remove.has(id)),
  };
}

export interface SupportDistance<S> {
  support: S;
  distanceM: number;
}

/** Porteurs within `radiusKm` of `center`, nearest first. */
export function supportsWithinRadius<S extends SelectableSupport>(
  center: LngLat,
  radiusKm: number,
  supports: readonly S[],
): SupportDistance<S>[] {
  if (!(radiusKm >= 0)) return [];
  const limit = radiusKm * 1000 + 1e-6;
  return supports
    .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
    .map((support) => ({
      support,
      distanceM: haversineDistance(center, { lng: support.longitude, lat: support.latitude }),
    }))
    .filter((d) => d.distanceM <= limit)
    .sort((a, b) => a.distanceM - b.distanceM || a.support.id - b.support.id);
}

/** Adds every bookable Porteur within the radius (zone de chalandise). */
export function selectWithinRadius(
  sel: Selection,
  center: LngLat,
  radiusKm: number,
  supports: readonly SelectableSupport[],
): Selection {
  const ids = supportsWithinRadius(center, radiusKm, supports)
    .filter((d) => isBookable(d.support))
    .map((d) => d.support.id);
  return addSupports(sel, ids, supports);
}

/** Drops ids that no longer exist or are no longer bookable (e.g. after a data reload). */
export function pruneSelection(
  sel: Selection,
  supports: readonly SelectableSupport[],
  zones: readonly Pick<ZoneResponse, "id">[],
): Selection {
  const zoneIds = new Set(zones.map((z) => z.id));
  const bookable = new Set(supports.filter((s) => isBookable(s)).map((s) => s.id));
  const next = {
    zoneIds: sel.zoneIds.filter((id) => zoneIds.has(id)),
    supportIds: sel.supportIds.filter((id) => bookable.has(id)),
  };
  return selectionEquals(next, sel) ? sel : next;
}

export interface SelectionZoneGroup {
  zoneId: number;
  zoneName: string;
  count: number;
  /** Whole zone chosen. */
  zoneSelected: boolean;
}

export interface SelectionSummary<S> {
  supports: S[];
  zones: Pick<ZoneResponse, "id" | "name">[];
  supportCount: number;
  zoneCount: number;
  bookableCount: number;
  /** Selected ids that are not bookable anymore (status changed since selection). */
  notBookable: S[];
  /** Ids not found in the dataset. */
  missingSupportIds: number[];
  byType: Record<PorteurType, number>;
  byZone: SelectionZoneGroup[];
  /** « 3 Porteurs dans 2 zones » / « Aucun Porteur sélectionné ». */
  label: string;
}

type SummarySupport = SelectableSupport & Pick<SupportResponse, "zoneName">;

export function summarizeSelection<S extends SummarySupport>(
  sel: Selection,
  supports: readonly S[],
  zones: readonly Pick<ZoneResponse, "id" | "name">[] = [],
): SelectionSummary<S> {
  const byId = new Map(supports.map((s) => [s.id, s]));
  const selected: S[] = [];
  const missingSupportIds: number[] = [];
  for (const id of sel.supportIds) {
    const s = byId.get(id);
    if (s) selected.push(s);
    else missingSupportIds.push(id);
  }
  const byType: Record<PorteurType, number> = { A: 0, B: 0, C: 0, D: 0 };
  const groups = new Map<number, SelectionZoneGroup>();
  const zoneName = (id: number, fallback: string) =>
    zones.find((z) => z.id === id)?.name ?? fallback;
  for (const s of selected) {
    byType[resolvePorteurType(s).type] += 1;
    const g = groups.get(s.zoneId);
    if (g) g.count += 1;
    else
      groups.set(s.zoneId, {
        zoneId: s.zoneId,
        zoneName: zoneName(s.zoneId, s.zoneName),
        count: 1,
        zoneSelected: sel.zoneIds.includes(s.zoneId),
      });
  }
  for (const zoneId of sel.zoneIds) {
    if (!groups.has(zoneId)) {
      groups.set(zoneId, {
        zoneId,
        zoneName: zoneName(zoneId, `Zone ${zoneId}`),
        count: 0,
        zoneSelected: true,
      });
    }
  }
  const notBookable = selected.filter((s) => !isBookable(s));
  const byZone = [...groups.values()];
  const supportCount = selected.length;
  const zoneCount = byZone.length;
  const label =
    supportCount === 0 && zoneCount === 0
      ? "Aucun Porteur sélectionné"
      : `${supportCount} ${supportCount >= 2 ? "Porteurs" : "Porteur"} dans ${zoneCount} ${zoneCount >= 2 ? "zones" : "zone"}`;
  return {
    supports: selected,
    zones: zones.filter((z) => sel.zoneIds.includes(z.id)),
    supportCount,
    zoneCount,
    bookableCount: supportCount - notBookable.length,
    notBookable,
    missingSupportIds,
    byType,
    byZone,
    label,
  };
}
