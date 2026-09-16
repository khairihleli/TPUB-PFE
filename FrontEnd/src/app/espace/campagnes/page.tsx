import type { Metadata } from "next";
import { Suspense } from "react";

import { CampaignList, CampaignListSkeleton } from "@/components/campaign/campaign-list";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Campagnes",
};

export default function CampaignsPage() {
  return (
    <>
      <PageHeader
        title="Campagnes"
        description="Suivez chaque campagne, du brouillon à la diffusion validée par l'équipe TPUB."
      />
      {/* useUrlState (?statut=&q=&tri=) reads the search params: Suspense boundary required. */}
      <Suspense fallback={<CampaignListSkeleton />}>
        <CampaignList />
      </Suspense>
    </>
  );
}
