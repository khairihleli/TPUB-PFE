import { ChevronRight, TableProperties } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { axisTicks, donutArcs, niceMax, percentOf } from "@/components/espace/chart-scale";
import { TONE_BG, TONE_FILL, TONE_STROKE } from "@/components/espace/espace-ui";
import type { Tone } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { formatNumber } from "@/lib/format";

export interface ChartDatum {
  key: string;
  label: string;
  value: number;
  tone: Tone;
  /** Formatted value (defaults to formatNumber). */
  valueLabel?: string;
  /** Drill-down link (filtered list) for the legend / bar row (IA-07). */
  href?: string;
  /** Accessible name of the drill-down link (default « Voir : {label} »). */
  linkLabel?: string;
}

const pct = (share: number) =>
  `${new Intl.NumberFormat("fr-TN", { maximumFractionDigits: 0 }).format(share * 100)} %`;

// ---------------------------------------------------------------------------
// Data table fallback (every chart ships one)
// ---------------------------------------------------------------------------
export function ChartTable({
  caption,
  headers,
  rows,
  className,
}: {
  caption: string;
  headers: readonly string[];
  rows: readonly (readonly ReactNode[])[];
  className?: string;
}) {
  return (
    <details className={cx("group/table rounded-control border border-line", className)}>
      <summary className="flex min-h-touch cursor-pointer list-none items-center gap-2 rounded-control px-3.5 font-label text-[0.8125rem] font-semibold text-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
        <TableProperties aria-hidden="true" className="size-4" />
        <span className="group-open/table:hidden">Afficher les données en tableau</span>
        <span className="hidden group-open/table:inline">Masquer le tableau</span>
      </summary>
      <div className="overflow-x-auto border-t border-line">
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
                      className="px-3.5 py-2.5 text-left font-normal text-ink-soft"
                    >
                      {cell}
                    </th>
                  ) : (
                    <td key={i} className="px-3.5 py-2.5 text-right text-ink-soft tabular">
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

// ---------------------------------------------------------------------------
// Donut + legend
// ---------------------------------------------------------------------------
const DONUT_SIZE = 200;
const DONUT_R = 78;
const DONUT_STROKE = 22;
const DONUT_C = 2 * Math.PI * DONUT_R;

export function DonutChart({
  data,
  label,
  centerValue,
  centerLabel,
  className,
}: {
  data: readonly ChartDatum[];
  /** Accessible summary prefix, e.g. « Campagnes par statut ». */
  label: string;
  centerValue: ReactNode;
  centerLabel: string;
  className?: string;
}) {
  const arcs = donutArcs(
    data.map((d) => d.value),
    DONUT_C,
    3,
  );
  const summary = `${label} : ${data
    .map((d) => `${d.label} ${d.valueLabel ?? formatNumber(d.value)}`)
    .join(", ")}.`;

  return (
    <div className={cx("@container", className)}>
      <div className="flex flex-col items-center gap-6 @md:flex-row @md:gap-8">
        <div className="relative size-44 shrink-0 @md:size-48">
          <svg
            viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
            role="img"
            aria-label={summary}
            className="size-full -rotate-90"
          >
            <circle
              cx={DONUT_SIZE / 2}
              cy={DONUT_SIZE / 2}
              r={DONUT_R}
              fill="none"
              strokeWidth={DONUT_STROKE}
              className="stroke-surface-3/70"
            />
            {data.map((d, i) => {
              const arc = arcs[i];
              if (!arc || arc.length <= 0) return null;
              return (
                <circle
                  key={d.key}
                  cx={DONUT_SIZE / 2}
                  cy={DONUT_SIZE / 2}
                  r={DONUT_R}
                  fill="none"
                  strokeWidth={DONUT_STROKE}
                  strokeDasharray={`${arc.length} ${DONUT_C}`}
                  strokeDashoffset={arc.offset}
                  className={cx(
                    TONE_STROKE[d.tone],
                    "transition-opacity duration-200 hover:opacity-80",
                  )}
                >
                  <title>{`${d.label} : ${d.valueLabel ?? formatNumber(d.value)} (${pct(arc.share)})`}</title>
                </circle>
              );
            })}
          </svg>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
          >
            <span className="font-display text-[2rem] leading-none font-semibold text-ink-strong tabular">
              {centerValue}
            </span>
            <span className="mt-1.5 font-label text-[0.8125rem] font-medium text-muted">
              {centerLabel}
            </span>
          </div>
        </div>

        <ul className="flex w-full min-w-0 flex-col gap-1" aria-label={`Légende : ${label}`}>
          {data.map((d, i) => {
            const content = (
              <>
                <span
                  aria-hidden="true"
                  className={cx("size-2.5 shrink-0 rounded-[3px]", TONE_BG[d.tone])}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-ink-soft" title={d.label}>
                  {d.label}
                </span>
                <span className="font-label text-sm font-semibold text-ink-strong tabular">
                  {d.valueLabel ?? formatNumber(d.value)}
                </span>
                <span className="w-11 text-right text-[0.75rem] text-muted tabular">
                  {pct(arcs[i]?.share ?? 0)}
                </span>
              </>
            );
            return (
              <li key={d.key} className="border-b border-line last:border-b-0">
                {d.href ? (
                  <Link
                    href={d.href}
                    aria-label={d.linkLabel}
                    className="group/legend -mx-2 flex min-h-touch items-center gap-3 rounded-control px-2 py-1.5 transition-colors hover:bg-overlay-hover"
                  >
                    {content}
                    <ChevronRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted transition-colors group-hover/legend:text-ink"
                    />
                  </Link>
                ) : (
                  <div className="flex min-h-9 items-center gap-3 py-1.5">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bars (SVG, % widths so they stay crisp at any size; 4px rounded data-end)
// ---------------------------------------------------------------------------
function Bar({
  percent,
  fillClass,
  height = 12,
  ticks = [],
  title,
}: {
  percent: number;
  fillClass: string;
  height?: number;
  ticks?: readonly number[];
  title: string;
}) {
  const width = percent > 0 ? Math.max(percent, 0.8) : 0;
  return (
    <svg width="100%" height={height} aria-hidden="true" className="block overflow-visible">
      {ticks.map((t) => (
        <line
          key={t}
          x1={`${t}%`}
          x2={`${t}%`}
          y1={-4}
          y2={height + 4}
          strokeWidth={1}
          className="stroke-line"
        />
      ))}
      <rect x="0" y="0" width="100%" height={height} rx={4} className="fill-overlay-hover" />
      {width > 0 ? (
        <g className={fillClass}>
          <title>{title}</title>
          <rect x="0" y="0" width={`${width}%`} height={height} rx={4} />
          {/* square end on the baseline */}
          <rect x="0" y="0" width={Math.min(4, height)} height={height} />
        </g>
      ) : null}
    </svg>
  );
}

export function BarList({
  data,
  label,
  className,
}: {
  data: readonly ChartDatum[];
  label: string;
  className?: string;
}) {
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  return (
    <div className={cx("@container", className)}>
      <ul aria-label={label} className="flex flex-col gap-3.5">
        {data.map((d) => {
          const value = d.valueLabel ?? formatNumber(d.value);
          return (
            <li
              key={d.key}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 @sm:grid-cols-[8.5rem_minmax(0,1fr)_3.5rem]"
            >
              {d.href ? (
                <Link
                  href={d.href}
                  aria-label={d.linkLabel}
                  title={d.label}
                  className="hit-area relative truncate text-sm text-brand-blue-text underline-offset-4 hover:underline"
                >
                  {d.label}
                </Link>
              ) : (
                <span className="truncate text-sm text-ink-soft" title={d.label}>
                  {d.label}
                </span>
              )}
              <span className="text-right font-label text-sm font-semibold text-ink-strong tabular @sm:order-last">
                {value}
              </span>
              <span className="col-span-2 @sm:col-span-1">
                <Bar
                  percent={percentOf(d.value, max)}
                  fillClass={TONE_FILL[d.tone]}
                  title={`${d.label} : ${value}`}
                />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface PairedBarRow {
  key: string;
  label: ReactNode;
  /** Plain label for tooltips. */
  text: string;
  a: number;
  b: number;
}

/**
 * Two measures in the SAME unit on ONE shared axis (e.g. budget vs estimated cost, TND).
 * Series identity: legend + label next to every value, never colour alone.
 */
export function PairedBars({
  rows,
  seriesA,
  seriesB,
  format,
  formatTick = format,
  label,
  className,
}: {
  rows: readonly PairedBarRow[];
  seriesA: { label: string; fillClass: string; swatchClass: string };
  seriesB: { label: string; fillClass: string; swatchClass: string; note?: ReactNode };
  format: (n: number) => string;
  /** Axis tick labels (round values: no need for millimes). Defaults to `format`. */
  formatTick?: (n: number) => string;
  label: string;
  className?: string;
}) {
  const max = niceMax(Math.max(0, ...rows.flatMap((r) => [r.a, r.b])));
  const ticks = axisTicks(max, 2);
  const tickPercents = ticks.map((t) => percentOf(t, max));

  return (
    <div className={className}>
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.8125rem] text-ink-soft">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className={cx("h-2.5 w-4 rounded-[3px]", seriesA.swatchClass)} />
          {seriesA.label}
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className={cx("h-2.5 w-4 rounded-[3px]", seriesB.swatchClass)} />
          {seriesB.label}
          {seriesB.note}
        </span>
      </div>

      {/* Axis ticks aligned with the bar column */}
      <div
        aria-hidden="true"
        className="mb-2 hidden grid-cols-[11rem_minmax(0,1fr)_7.5rem] gap-x-4 md:grid"
      >
        <span />
        <span className="relative h-4 text-[0.75rem] text-muted tabular">
          {ticks.map((t, i) => (
            <span
              key={t}
              className={cx(
                "absolute top-0 whitespace-nowrap",
                i === 0
                  ? "translate-x-0"
                  : i === ticks.length - 1
                    ? "-translate-x-full"
                    : "-translate-x-1/2",
              )}
              style={{ left: `${tickPercents[i] ?? 0}%` }}
            >
              {formatTick(t)}
            </span>
          ))}
        </span>
        <span />
      </div>

      <ul aria-label={label} className="flex flex-col">
        {rows.map((r) => (
          <li
            key={r.key}
            className="grid grid-cols-1 gap-x-4 gap-y-2 border-t border-line py-3.5 first:border-t-0 md:grid-cols-[11rem_minmax(0,1fr)_7.5rem] md:items-center md:first:border-t"
          >
            <span
              className="line-clamp-2 min-w-0 text-sm font-medium break-words text-ink-soft"
              title={r.text}
            >
              {r.label}
            </span>
            <span className="flex flex-col gap-1.5">
              <span className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <Bar
                    percent={percentOf(r.a, max)}
                    fillClass={seriesA.fillClass}
                    height={10}
                    ticks={tickPercents}
                    title={`${r.text} · ${seriesA.label} : ${format(r.a)}`}
                  />
                </span>
                <span className="w-24 shrink-0 text-right text-[0.75rem] text-muted tabular md:hidden">
                  {format(r.a)}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <Bar
                    percent={percentOf(r.b, max)}
                    fillClass={seriesB.fillClass}
                    height={10}
                    ticks={tickPercents}
                    title={`${r.text} · ${seriesB.label} : ${format(r.b)}`}
                  />
                </span>
                <span className="w-24 shrink-0 text-right text-[0.75rem] text-muted tabular md:hidden">
                  {format(r.b)}
                </span>
              </span>
            </span>
            <span className="hidden flex-col items-end gap-0.5 text-[0.75rem] tabular md:flex">
              <span className="text-ink-soft">{format(r.a)}</span>
              <span className="text-muted">{format(r.b)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
