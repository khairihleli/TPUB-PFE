import type { Metadata } from "next";
import { Suspense } from "react";

import { StatisticsView } from "@/components/espace/statistics-view";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Statistiques",
};

export default function Page() {
  // The period lives in the URL (useSearchParams): Suspense boundary required.
  return (
    <Suspense
      fallback={
        <LoadingRegion label="Chargement des statistiques…" className="flex flex-col gap-5">
          <Skeleton className="h-10 w-56 rounded-control" />
          <Skeleton className="h-72 rounded-card" />
        </LoadingRegion>
      }
    >
      <StatisticsView />
    </Suspense>
  );
}
