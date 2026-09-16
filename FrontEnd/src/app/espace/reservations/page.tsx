import type { Metadata } from "next";
import { Suspense } from "react";

import { ReservationsView } from "@/components/espace/reservations-view";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Réservations",
};

export default function Page() {
  // Filters and sort live in the URL (useSearchParams): Suspense boundary required.
  return (
    <Suspense
      fallback={
        <LoadingRegion label="Chargement des réservations…" className="flex flex-col gap-5">
          <Skeleton className="h-10 w-56 rounded-control" />
          <Skeleton className="h-72 rounded-card" />
        </LoadingRegion>
      }
    >
      <ReservationsView />
    </Suspense>
  );
}
