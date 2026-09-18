import type { Metadata } from "next";

import { CampaignEdit } from "@/components/campaign/campaign-edit";

export const metadata: Metadata = {
  title: "Modifier la campagne",
};

export default async function CampaignEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The id is checked client-side against /campaigns/mine before anything is shown.
  return <CampaignEdit idParam={id} />;
}
