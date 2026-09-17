"use client";

import { useMemo } from "react";

import { encodeQr, qrSvgPath } from "@/lib/qr-code";
import { cx } from "@/lib/cx";

export interface QrCodeSvgProps {
  value: string;
  /** Accessible description of what the code contains (the value itself is never announced). */
  label: string;
  className?: string;
}

const QUIET_ZONE = 4;

/**
 * QR code drawn client-side as an SVG (dependency-free encoder `@/lib/qr-code`). Always dark
 * modules on a white plate, whatever the theme: phone cameras need that contrast.
 */
export function QrCodeSvg({ value, label, className }: QrCodeSvgProps) {
  const drawing = useMemo(() => {
    try {
      const matrix = encodeQr(value, "M");
      return { path: qrSvgPath(matrix, QUIET_ZONE), extent: matrix.size + QUIET_ZONE * 2 };
    } catch {
      return null;
    }
  }, [value]);

  if (!drawing) {
    return (
      <p role="alert" className={cx("text-sm text-danger", className)}>
        QR code impossible à générer : utilisez la saisie manuelle.
      </p>
    );
  }

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${drawing.extent} ${drawing.extent}`}
      shapeRendering="crispEdges"
      className={cx("block aspect-square rounded-control bg-white", className)}
    >
      <rect width={drawing.extent} height={drawing.extent} fill="#ffffff" />
      <path d={drawing.path} fill="#000000" />
    </svg>
  );
}
