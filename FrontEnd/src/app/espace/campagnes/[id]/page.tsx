import type { Metadata } from "next";

import { CampaignDetail } from "@/components/campaign/campaign-detail";

export const metadata: Metadata = {
  title: "Détail de la campagne",
};

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The id is checked client-side against /campaigns/mine before anything is shown.
  return <CampaignDetail idParam={id} />;
}
