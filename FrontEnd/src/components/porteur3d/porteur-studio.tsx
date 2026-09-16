"use client";

import dynamic from "next/dynamic";

import { PorteurStudioSkeleton } from "@/components/porteur3d/studio-skeleton";

/**
 * Studio 3D of a Porteur (plain three.js). Loaded client-side only (`ssr: false`) so three.js never
 * reaches server bundles or pages that do not render the studio.
 *
 * Props: `PorteurStudioProps` (`@/components/porteur3d/types`).
 */
export const PorteurStudio = dynamic(
  () => import("@/components/porteur3d/porteur-studio-canvas").then((m) => m.PorteurStudioCanvas),
  { ssr: false, loading: () => <PorteurStudioSkeleton /> },
);
