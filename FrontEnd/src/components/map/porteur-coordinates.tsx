"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cx } from "@/lib/cx";
import { formatLatLng, openStreetMapUrl } from "@/lib/network/geo";

/** « 36,7995° N » — display only (VD-18); the clipboard keeps dot decimals. */
export function formatAxisFr(value: number, positive: string, negative: string): string {
  if (!Number.isFinite(value)) return "—";
  return `${Math.abs(value).toFixed(4).replace(".", ",")}° ${value < 0 ? negative : positive}`;
}

export interface PorteurCoordinatesProps {
  latitude: number;
  longitude: number;
  /** Porteur name, completes the accessible names of the actions. */
  name?: string;
  /** "card" = compact (mini card), "panel" = studio / admin inspector. */
  variant?: "card" | "panel";
  className?: string;
}

type CopyState = "idle" | "copied" | "failed";

/**
 * Exact position of a Porteur: latitude / longitude in French format (« 36,7995° N »), « Copier les coordonnées »
 * (clipboard + inline confirmation) and « Ouvrir dans OpenStreetMap » (new tab).
 */
export function PorteurCoordinates({
  latitude,
  longitude,
  name,
  variant = "panel",
  className,
}: PorteurCoordinatesProps) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const valid = Number.isFinite(latitude) && Number.isFinite(longitude);
  const text = formatLatLng(latitude, longitude);
  const card = variant === "card";

  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2600);
  };

  const copyName = name ? ` du Porteur ${name}` : "";
  const linkName = name ? ` : Porteur ${name}` : "";
  const action = cx(
    "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-control border border-line-strong font-label font-semibold text-ink transition-colors hover:bg-overlay-hover hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-3.5 [&_svg]:shrink-0",
    card ? "min-h-8 px-2 text-[0.75rem]" : "min-h-9 px-3 text-xs",
  );

  return (
    <div className={cx("flex flex-col", card ? "gap-2" : "gap-2.5", className)}>
      <dl
        className={cx(
          "grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5",
          card ? "text-xs" : "text-[0.8125rem]",
        )}
      >
        <dt className="text-muted-2">Latitude</dt>
        <dd className="text-ink-soft tabular select-all" data-coordinate="latitude">
          {formatAxisFr(latitude, "N", "S")}
        </dd>
        <dt className="text-muted-2">Longitude</dt>
        <dd className="text-ink-soft tabular select-all" data-coordinate="longitude">
          {formatAxisFr(longitude, "E", "O")}
        </dd>
      </dl>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!valid}
          aria-label={`Copier les coordonnées${copyName}`}
          className={action}
        >
          {state === "copied" ? (
            <Check aria-hidden="true" className="text-success" />
          ) : (
            <Copy aria-hidden="true" />
          )}
          <span aria-hidden="true">
            {state === "copied" ? "Copiées" : "Copier les coordonnées"}
          </span>
        </button>
        {valid ? (
          <a
            href={openStreetMapUrl(latitude, longitude)}
            target="_blank"
            rel="noopener noreferrer"
            className={action}
          >
            <ExternalLink aria-hidden="true" />
            Ouvrir dans OpenStreetMap
            <span className="sr-only">{linkName} (nouvel onglet)</span>
          </a>
        ) : null}
      </div>
      <p
        role="status"
        aria-live="polite"
        className={cx(
          "text-[0.75rem] leading-snug empty:sr-only",
          state === "failed" ? "text-warning" : "text-success",
        )}
      >
        {state === "copied"
          ? `Coordonnées copiées : ${text}`
          : state === "failed"
            ? `Copie impossible : sélectionnez les coordonnées ${text}.`
            : ""}
      </p>
    </div>
  );
}
