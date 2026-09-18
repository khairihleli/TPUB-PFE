import type { Metadata } from "next";
import { Suspense } from "react";

import { SupervisionView } from "@/components/supervision/supervision-view";

export const metadata: Metadata = {
  title: "Supervision",
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SupervisionView />
    </Suspense>
  );
}
