import { useMemo } from "react";

import {
  createProjection,
  DJERBA_OUTLINE,
  findDenseCluster,
  isValidCoordinate,
  outlineToPath,
  TUNISIA_OUTLINE,
  type GeoBounds,
} from "@/components/espace/map-projection";
import type { SupportResponse, ZoneResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";

const MAP_HEIGHT = 520;
/** Minimum visual radius of a zone halo (viewBox units): real radii are a few units only. */
const MIN_HALO = 9;

export interface TunisiaMapProps {
  zones: readonly ZoneResponse[];
  supports: readonly SupportResponse[];
  selectedZoneId?: number | null;
  /** Frame drawn on the country map to show where the inset zooms. */
  insetBounds?: GeoBounds | null;
  className?: string;
}

/**
 * Country map + a « vue rapprochée » inset when zone markers would pile up on the country
 * scale (e.g. Tunis, La Marsa and Les Berges du Lac). Decorative: aria-hidden.
 */
export function NetworkMap({
  zones,
  supports,
  selectedZoneId = null,
}: Omit<TunisiaMapProps, "insetBounds" | "className">) {
  const cluster = useMemo(
    () => findDenseCluster(zones, createProjection(undefined, MAP_HEIGHT)),
    [zones],
  );

  if (!cluster) {
    return (
      <div className="mx-auto w-full max-w-[15rem] px-4 py-6 sm:max-w-[20rem]">
        <TunisiaMap zones={zones} supports={supports} selectedZoneId={selectedZoneId} />
      </div>
    );
  }

  const clusterZones = cluster.ids
    .map((id) => zones.find((z) => z.id === id))
    .filter((z): z is ZoneResponse => z !== undefined);

  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] items-center gap-4 px-4 py-6 sm:gap-6 sm:px-6"
    >
      <TunisiaMap
        zones={zones}
        supports={supports}
        selectedZoneId={selectedZoneId}
        insetBounds={cluster.bounds}
      />
      <ZoneInset
        zones={clusterZones}
        supports={supports}
        bounds={cluster.bounds}
        selectedZoneId={selectedZoneId}
      />
    </div>
  );
}

const INSET_HEIGHT = 200;

function ZoneInset({
  zones,
  supports,
  bounds,
  selectedZoneId,
}: {
  zones: readonly ZoneResponse[];
  supports: readonly SupportResponse[];
  bounds: GeoBounds;
  selectedZoneId: number | null;
}) {
  const projection = createProjection(bounds, INSET_HEIGHT);
  const { width, height } = projection;
  const ids = new Set(zones.map((z) => z.id));
  const screens = supports
    .filter((s) => ids.has(s.zoneId) && isValidCoordinate(s.latitude, s.longitude))
    .map((s) => ({ support: s, ...projection.project(s.latitude, s.longitude) }))
    .filter((m) => m.inside);
  const marks = zones.map((z, i) => ({
    zone: z,
    n: i + 1,
    ...projection.project(z.latitude, z.longitude),
    halo: Math.max(6, projection.kmToUnits(z.radiusKm ?? 0)),
  }));
  const cols = 4;

  return (
    <div className="min-w-0 overflow-hidden rounded-card border border-line bg-bg/40">
      <p className="border-b border-line px-3 py-2 font-label text-[0.75rem] font-medium text-muted">
        Vue rapprochée
      </p>
      <svg focusable="false" viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full">
        {Array.from({ length: cols - 1 }, (_, i) => (
          <g key={i}>
            <line
              x1={(width / cols) * (i + 1)}
              x2={(width / cols) * (i + 1)}
              y1={0}
              y2={height}
              strokeWidth={0.6}
              className="stroke-line"
            />
            <line
              x1={0}
              x2={width}
              y1={(height / cols) * (i + 1)}
              y2={(height / cols) * (i + 1)}
              strokeWidth={0.6}
              className="stroke-line"
            />
          </g>
        ))}
        {marks.map((m) => {
          const selected = m.zone.id === selectedZoneId;
          return (
            <circle
              key={`h-${m.zone.id}`}
              cx={m.x}
              cy={m.y}
              r={m.halo}
              strokeWidth={1}
              strokeDasharray={selected ? undefined : "3 3"}
              className={
                selected
                  ? "fill-brand-blue-text/15 stroke-brand-blue-text"
                  : "fill-brand-orange/10 stroke-brand-orange-text/50"
              }
            />
          );
        })}
        {screens.map((m) => (
          <circle
            key={`s-${m.support.id}`}
            cx={m.x}
            cy={m.y}
            r={2}
            className={m.support.zoneId === selectedZoneId ? "fill-ink-strong" : "fill-ink-soft/70"}
          />
        ))}
        {marks.map((m) => {
          const selected = m.zone.id === selectedZoneId;
          return (
            <g key={`m-${m.zone.id}`}>
              <circle
                cx={m.x}
                cy={m.y}
                r={8}
                strokeWidth={2}
                className={cx(
                  "stroke-surface",
                  selected ? "fill-brand-blue-text" : "fill-brand-orange-text",
                )}
              />
              <text
                x={m.x}
                y={m.y + 3.5}
                textAnchor="middle"
                className="fill-bg font-label text-[10px] font-bold"
              >
                {m.n}
              </text>
            </g>
          );
        })}
      </svg>
      <ol className="flex flex-col gap-1 border-t border-line px-3 py-2.5">
        {marks.map((m) => (
          <li
            key={m.zone.id}
            className={cx(
              "flex min-w-0 items-center gap-2 text-[0.75rem] leading-tight",
              m.zone.id === selectedZoneId ? "text-ink-strong" : "text-muted",
            )}
          >
            <span
              className={cx(
                "inline-flex size-5 shrink-0 items-center justify-center rounded-full font-label text-[0.75rem] font-bold text-bg",
                m.zone.id === selectedZoneId ? "bg-brand-blue-text" : "bg-brand-orange-text",
              )}
            >
              {m.n}
            </span>
            <span className="truncate">{m.zone.name}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Decorative mini-map: zones and screens projected on a simplified outline of Tunisia.
 * aria-hidden — the accessible content is the zone list rendered next to it.
 */
export function TunisiaMap({
  zones,
  supports,
  selectedZoneId = null,
  insetBounds = null,
  className,
}: TunisiaMapProps) {
  const projection = useMemo(() => createProjection(undefined, MAP_HEIGHT), []);
  const outline = useMemo(() => outlineToPath(TUNISIA_OUTLINE, projection), [projection]);
  const djerba = useMemo(() => outlineToPath(DJERBA_OUTLINE, projection), [projection]);

  const zoneMarks = zones
    .filter((z) => isValidCoordinate(z.latitude, z.longitude))
    .map((z) => {
      const p = projection.project(z.latitude, z.longitude);
      return {
        zone: z,
        ...p,
        halo: Math.max(MIN_HALO, projection.kmToUnits(z.radiusKm ?? 0)),
      };
    })
    // selected last so it paints on top
    .sort((a, b) => Number(a.zone.id === selectedZoneId) - Number(b.zone.id === selectedZoneId));

  const supportMarks = supports
    .filter((s) => isValidCoordinate(s.latitude, s.longitude))
    .map((s) => ({ support: s, ...projection.project(s.latitude, s.longitude) }))
    .filter((m) => m.inside);

  const { width, height } = projection;
  const pad = 14;

  const insetFrame = (() => {
    if (!insetBounds) return null;
    const nw = projection.project(insetBounds.maxLat, insetBounds.minLng);
    const se = projection.project(insetBounds.minLat, insetBounds.maxLng);
    const size = Math.max(22, se.x - nw.x, se.y - nw.y);
    const cx0 = (nw.x + se.x) / 2;
    const cy0 = (nw.y + se.y) / 2;
    return { x: cx0 - size / 2, y: cy0 - size / 2, size };
  })();

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`}
      className={cx("h-auto w-full overflow-visible", className)}
    >
      {/* graticule */}
      {[31, 32, 33, 34, 35, 36, 37].map((lat) => {
        const y = projection.project(lat, projection.bounds.minLng).y;
        return (
          <line
            key={`lat-${lat}`}
            x1={0}
            x2={width}
            y1={y}
            y2={y}
            strokeWidth={0.6}
            className="stroke-line"
          />
        );
      })}
      {[8, 9, 10, 11].map((lng) => {
        const x = projection.project(projection.bounds.minLat, lng).x;
        return (
          <line
            key={`lng-${lng}`}
            x1={x}
            x2={x}
            y1={0}
            y2={height}
            strokeWidth={0.6}
            className="stroke-line"
          />
        );
      })}

      <path
        d={outline}
        strokeWidth={1.2}
        strokeLinejoin="round"
        className="fill-surface-2/80 stroke-line-strong"
      />
      <path d={djerba} strokeWidth={1} className="fill-surface-2/80 stroke-line-strong" />

      {insetFrame ? (
        <rect
          x={insetFrame.x}
          y={insetFrame.y}
          width={insetFrame.size}
          height={insetFrame.size}
          rx={3}
          fill="none"
          strokeWidth={1}
          strokeDasharray="3 2"
          className="stroke-ink-soft/60"
        />
      ) : null}

      {zoneMarks.map((m) => {
        const selected = m.zone.id === selectedZoneId;
        return (
          <g key={`z-${m.zone.id}`} opacity={m.inside ? 1 : 0.55}>
            <circle
              cx={m.x}
              cy={m.y}
              r={m.halo}
              strokeWidth={1}
              className={cx(
                selected
                  ? "fill-brand-blue-text/20 stroke-brand-blue-text"
                  : "fill-brand-orange/12 stroke-brand-orange-text/50",
              )}
            />
            <circle
              cx={m.x}
              cy={m.y}
              r={selected ? 4.5 : 3.5}
              strokeWidth={2}
              className={cx(
                "stroke-surface",
                selected ? "fill-brand-blue-text" : "fill-brand-orange-text",
              )}
            />
          </g>
        );
      })}

      {supportMarks.map((m) => (
        <circle
          key={`s-${m.support.id}`}
          cx={m.x}
          cy={m.y}
          r={2}
          className={m.support.zoneId === selectedZoneId ? "fill-ink-strong" : "fill-ink-soft/70"}
        />
      ))}

      {zoneMarks
        .filter(
          (m) =>
            m.zone.id === selectedZoneId &&
            // zones shown in the inset are labelled there
            !(
              insetBounds &&
              m.zone.latitude >= insetBounds.minLat &&
              m.zone.latitude <= insetBounds.maxLat &&
              m.zone.longitude >= insetBounds.minLng &&
              m.zone.longitude <= insetBounds.maxLng
            ),
        )
        .map((m) => {
          const anchorLeft = m.x > width * 0.6;
          return (
            <text
              key={`label-${m.zone.id}`}
              x={anchorLeft ? m.x - m.halo - 6 : m.x + m.halo + 6}
              y={m.y + 4}
              textAnchor={anchorLeft ? "end" : "start"}
              className="fill-ink-strong stroke-bg font-label text-[13px] font-semibold"
              paintOrder="stroke"
              strokeWidth={4}
              strokeLinejoin="round"
            >
              {m.zone.name}
            </text>
          );
        })}
    </svg>
  );
}
