import type { Metadata } from "next";

import { DashboardView } from "@/components/espace/dashboard-view";

export const metadata: Metadata = {
  title: "Tableau de bord",
};

export default function Page() {
  return <DashboardView />;
}
