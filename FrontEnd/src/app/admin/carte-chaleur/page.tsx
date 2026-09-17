import type { Metadata } from "next";

import { HeatmapView } from "@/components/admin/heatmap-view";

export const metadata: Metadata = {
  title: "Cartes de chaleur",
};

export default function Page() {
  return <HeatmapView />;
}
