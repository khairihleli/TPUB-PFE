import type { Metadata } from "next";

import { OverviewView } from "@/components/admin/overview-view";

export const metadata: Metadata = {
  title: "Vue d'ensemble",
};

export default function Page() {
  return <OverviewView />;
}
