"use client";

import { type PointerEvent, useRef } from "react";

import type { PorteurType } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { bearingLabel, bearingName, normalizeHeading } from "@/lib/network/geo";

const SIZE = 148;
const C = SIZE / 2;
const R = 62;
const COMPASS = [
  { deg: 0, label: "N" },
  { deg: 45, label: "NE" },
  { deg: 90, label: "E" },
  { deg: 135, label: "SE" },
  { deg: 180, label: "S" },
  { deg: 225, label: "SO" },
  { deg: 270, label: "O" },
  { deg: 315, label: "NO" },
] as const;

/** Polar (0 = north, clockwise) → SVG coordinates. */
function polar(deg: number, radius: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: C + radius * Math.cos(rad), y: C + radius * Math.sin(rad) };
}

function wedge(deg: number, spread: number, radius: number): string {
  const a = polar(deg - spread, radius);
  const b = polar(deg + spread, radius);
  return `M ${C} ${C} L ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)} Z`;
}

/** Angle (0–359, clockwise from north) of a pointer position relative to the dial centre. */
export function angleFromPointer(dx: number, dy: number): number {
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return Math.round(normalizeHeading(deg)) % 360;
}

/**
 * Compass dial preview of the main screen direction. Pointer users click or drag on the dial;
 * keyboard and screen-reader users use the numeric field and the compass buttons next to it
 * (the SVG itself is decorative).
 */
export function OrientationDial({
  value,
  type,
  onChange,
  disabled = false,
  className,
}: {
  /** null = not declared. */
  value: number | null;
  type: PorteurType | null;
  onChange: (deg: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const heading = value === null ? null : normalizeHeading(value);

  const setFromEvent = (e: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const scale = SIZE / rect.width;
    const dx = (e.clientX - rect.left) * scale - C;
    const dy = (e.clientY - rect.top) * scale - C;
    if (Math.hypot(dx, dy) < 8) return;
    const deg = angleFromPointer(dx, dy);
    // Shift snaps to 15° steps.
    onChange(e.shiftKey ? (Math.round(deg / 15) * 15) % 360 : deg);
  };

  const noScreen = type === "D";
  const faces =
    heading === null || noScreen ? [] : type === "B" ? [heading, heading + 180] : [heading];

  return (
    <div className={cx("relative inline-flex flex-col items-center gap-2", className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        aria-hidden="true"
        className={cx("touch-none select-none", disabled ? "opacity-50" : "cursor-crosshair")}
        onPointerDown={(e) => {
          if (disabled) return;
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromEvent(e);
        }}
        onPointerMove={(e) => {
          if (dragging.current && !disabled) setFromEvent(e);
        }}
        onPointerUp={(e) => {
          dragging.current = false;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
      >
        <circle cx={C} cy={C} r={R + 6} className="fill-current text-bg" />
        <circle
          cx={C}
          cy={C}
          r={R}
          className="fill-none stroke-current text-line-strong"
          strokeWidth={1}
        />
        <circle
          cx={C}
          cy={C}
          r={R - 18}
          className="fill-none stroke-current text-line"
          strokeWidth={1}
          strokeDasharray="2 4"
        />
        {Array.from({ length: 72 }, (_, i) => {
          const deg = i * 5;
          const major = deg % 45 === 0;
          const a = polar(deg, R);
          const b = polar(deg, R - (major ? 7 : 3));
          return (
            <line
              key={deg}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              strokeWidth={major ? 1.4 : 0.8}
              className={cx("stroke-current", major ? "text-muted" : "text-line-strong")}
            />
          );
        })}
        {faces.map((deg, i) => (
          <path
            key={i}
            d={wedge(deg, type === "A" ? 38 : 24, R - 10)}
            className={cx(
              "fill-current",
              i === 0 ? "text-brand-orange-text/30" : "text-brand-blue-text/25",
            )}
          />
        ))}
        {COMPASS.map(({ deg, label }) => {
          const p = polar(deg, R - 26);
          return (
            <text
              key={label}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              className={cx(
                "fill-current font-label text-[12px] font-semibold",
                label === "N" ? "text-brand-red-text" : "text-muted-2",
              )}
            >
              {label}
            </text>
          );
        })}
        {heading !== null && !noScreen ? (
          <>
            <line
              x1={C}
              y1={C}
              x2={polar(heading, R - 4).x}
              y2={polar(heading, R - 4).y}
              strokeWidth={2.4}
              strokeLinecap="round"
              className="stroke-current text-brand-orange-text"
            />
            <circle
              cx={polar(heading, R - 4).x}
              cy={polar(heading, R - 4).y}
              r={5}
              className="fill-current text-brand-orange-text"
            />
          </>
        ) : null}
        <circle cx={C} cy={C} r={4} className="fill-current text-ink-strong" />
      </svg>
      <p className="text-center text-xs text-muted tabular" aria-hidden="true">
        {noScreen
          ? "Sans écran"
          : heading === null
            ? "Non déclarée"
            : `${Math.round(heading)}° · ${bearingLabel(heading)}`}
      </p>
    </div>
  );
}

/** « orienté nord-est (45°) » for helper text. */
export function headingSentence(deg: number): string {
  const d = Math.round(normalizeHeading(deg));
  return `Écran principal orienté ${bearingName(d)} (${d}°)`;
}

export const COMPASS_POINTS = COMPASS;
