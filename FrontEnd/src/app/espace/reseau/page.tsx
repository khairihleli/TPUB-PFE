import type { Metadata } from "next";
import { Suspense } from "react";

import { ExplorerSkeleton, NetworkExplorer } from "@/components/network/network-explorer";

export const metadata: Metadata = {
  title: "Réseau & Studio 3D",
};

/** Network explorer: map, Porteurs, Studio 3D and booking (URL state: ?zone ?porteur ?vue ?fond). */
export default function Page() {
  return (
    <Suspense fallback={<ExplorerSkeleton />}>
      <NetworkExplorer />
    </Suspense>
  );
}
