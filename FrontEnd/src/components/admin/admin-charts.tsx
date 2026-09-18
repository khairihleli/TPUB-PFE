import { TableProperties } from "lucide-react";
import type { ReactNode } from "react";

import {
  type ChartPoint,
  HISTORY_SERIES,
  historyMax,
  linePoints,
  niceCeil,
  percentOfMax,
} from "@/components/admin/stats-model";
import type { StatisticsHistoryRow } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { formatDayMonth, formatNumber } from "@/lib/format";

/** Accessible data table behind every chart (collapsed by default). */
export function ChartDataTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: readonly string[];
  rows: readonly (readonly ReactNode[])[];
}) {
  return (
    <details className="group/table mt-3 rounded-control border border-line">
      <summary className="flex min-h-touch cursor-pointer list-none items-center gap-2 rounded-control px-3.5 font-label text-[0.8125rem] font-semibold text-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
        <TableProperties aria-hidden="true" className="size-4" />
        <span className="group-open/table:hidden">Afficher les données en tableau</span>
        <span className="hidden group-open/table:inline">Masquer le tableau</span>
      </summary>
      <div className="relative max-h-80 overflow-auto border-t border-line">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="bg-surface-2/60">
              {headers.map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={cx(
                    "px-3.5 py-2.5 font-label text-[0.75rem] font-semibold whitespace-nowrap text-muted",
                    i === 0 ? "text-left" : "text-right",
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-t border-line">
                {row.map((cell, i) =>
                  i === 0 ? (
                    <th
                      key={i}
                      scope="row"
                      className="px-3.5 py-2 text-left font-normal text-ink-soft"
                    >
                      {cell}
                    </th>
                  ) : (
                    <td key={i} className="px-3.5 py-2 text-right text-ink-soft tabular">
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

const W = 640;
const H = 180;

/** Vertical bars (daily series). SVG, token colours, one <title> per bar. */
export function ColumnChart({
  points,
  label,
  valueLabel = "Affichages",
  formatValue = formatNumber,
  className,
}: {
  points: readonly ChartPoint[];
  /** Accessible name (« Affichages par jour »). */
  label: string;
  valueLabel?: string;
  formatValue?: (n: number) => string;
  className?: string;
}) {
  const max = niceCeil(Math.max(0, ...points.map((p) => p.value)));
  const total = points.reduce((a, p) => a + p.value, 0);
  const slot = points.length > 0 ? W / points.length : W;
  const bar = Math.max(2, slot * 0.68);
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));

  return (
    <figure className={cx("min-w-0", className)}>
      <div className="flex gap-2">
        <div
          aria-hidden="true"
          className="flex w-10 shrink-0 flex-col justify-between pb-6 text-right text-[0.6875rem] text-muted tabular"
        >
          <span>{formatValue(max)}</span>
          <span>{formatValue(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`${label} : total ${formatValue(total)} sur ${points.length} point${points.length > 1 ? "s" : ""}.`}
            className="h-44 w-full overflow-visible"
          >
            {[0, 0.5, 1].map((t) => (
              <line
                key={t}
                x1={0}
                x2={W}
                y1={H - t * H}
                y2={H - t * H}
                className="stroke-line"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {points.map((p, i) => {
              const h = (percentOfMax(p.value, max) / 100) * H;
              return (
                <rect
                  key={p.key}
                  x={i * slot + (slot - bar) / 2}
                  y={H - h}
                  width={bar}
                  height={Math.max(h, p.value > 0 ? 1.5 : 0)}
                  rx={2}
                  className="fill-current text-brand-orange-text transition-opacity hover:opacity-75"
                >
                  <title>{`${p.label} : ${formatValue(p.value)}`}</title>
                </rect>
              );
            })}
          </svg>
          <div
            aria-hidden="true"
            className="mt-1.5 flex justify-between gap-1 overflow-hidden text-[0.6875rem] whitespace-nowrap text-muted"
          >
            {points
              .filter((_, i) => i % labelEvery === 0)
              .map((p) => (
                <span key={p.key}>{p.label}</span>
              ))}
          </div>
        </div>
      </div>
      <ChartDataTable
        caption={label}
        headers={["Libellé", valueLabel]}
        rows={points.map((p) => [p.label, formatValue(p.value)])}
      />
    </figure>
  );
}

/** Ranked horizontal bars (campaigns, Porteurs, zones, sectors). */
export function BarList({
  points,
  label,
  formatValue = formatNumber,
  emptyText = "Aucune donnée sur la période.",
  tone = "bg-brand-blue-text",
}: {
  points: readonly ChartPoint[];
  label: string;
  formatValue?: (n: number) => string;
  emptyText?: string;
  tone?: string;
}) {
  if (points.length === 0) return <p className="text-sm text-muted">{emptyText}</p>;
  const max = Math.max(0, ...points.map((p) => p.value));
  return (
    <ul aria-label={label} className="flex flex-col gap-2.5">
      {points.map((p) => (
        <li key={p.key} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink-soft" title={p.label}>
              {p.label}
            </span>
            <span className="font-label font-semibold text-ink-strong tabular">
              {formatValue(p.value)}
            </span>
          </div>
          <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className={cx("h-full rounded-full", tone)}
              style={{ width: `${percentOfMax(p.value, max)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Campaign counts over time (daily platform snapshots). */
export function HistoryLineChart({ rows }: { rows: readonly StatisticsHistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        Aucun instantané sur la période : l&apos;historique se remplit chaque jour (relevé toutes
        les 15 minutes).
      </p>
    );
  }
  const max = historyMax(rows);
  const last = rows[rows.length - 1];
  return (
    <figure className="min-w-0">
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5" aria-label="Légende">
        {HISTORY_SERIES.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-2 text-[0.8125rem] text-ink-soft">
            <span aria-hidden="true" className={cx("h-0.5 w-4 rounded-full bg-current", s.tone)} />
            {s.label}
            {last ? (
              <span className="font-label font-semibold text-ink-strong tabular">
                {formatNumber(last[s.key])}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Évolution des campagnes du ${formatDayMonth(rows[0]?.date)} au ${formatDayMonth(last?.date)}.`}
        className="h-44 w-full overflow-visible"
      >
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={0}
            x2={W}
            y1={H - t * H}
            y2={H - t * H}
            className="stroke-line"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {HISTORY_SERIES.map((s) => (
          <polyline
            key={s.key}
            points={linePoints(
              rows.map((r) => r[s.key]),
              max,
              W,
              H,
            )}
            fill="none"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            className={cx("stroke-current", s.tone)}
          />
        ))}
      </svg>
      <ChartDataTable
        caption="Historique des campagnes"
        headers={["Jour", ...HISTORY_SERIES.map((s) => s.label), "Affichages", "Risque IA moyen"]}
        rows={rows.map((r) => [
          formatDayMonth(r.date),
          ...HISTORY_SERIES.map((s) => formatNumber(r[s.key])),
          formatNumber(r.views),
          r.avgRiskScore === null ? "—" : formatNumber(Math.round(r.avgRiskScore)),
        ])}
      />
    </figure>
  );
}
