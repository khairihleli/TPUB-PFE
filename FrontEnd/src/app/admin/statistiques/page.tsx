import type { Metadata } from "next";

import { StatisticsView } from "@/components/admin/statistics-view";

export const metadata: Metadata = {
  title: "Statistiques",
};

export default function Page() {
  return <StatisticsView />;
}
