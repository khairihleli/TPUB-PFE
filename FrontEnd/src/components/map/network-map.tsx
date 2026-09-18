"use client";

import dynamic from "next/dynamic";

import { cx } from "@/lib/cx";

import { NetworkMapSkeleton } from "@/components/map/network-map-skeleton";
import type { NetworkMapProps } from "@/components/map/types";

const DEFAULT_HEIGHT = "clamp(26rem, 72vh, 52rem)";

const LazyNetworkMap = dynamic(
  () => import("@/components/map/network-map-client").then((m) => m.NetworkMapClient),
  { ssr: false, loading: () => <NetworkMapSkeleton /> },
);

/**
 * Interactive network map of Tunisia (zones, Porteurs, tools). Client-only: MapLibre and the
 * map UI load in a separate chunk, never during SSR/prerender. The wrapper reserves the final
 * height so the skeleton → map swap causes no layout shift.
 */
export function NetworkMap({ height = DEFAULT_HEIGHT, className, ...props }: NetworkMapProps) {
  return (
    <div className={cx("relative isolate w-full", className)} style={{ height }}>
      <LazyNetworkMap {...props} />
    </div>
  );
}
