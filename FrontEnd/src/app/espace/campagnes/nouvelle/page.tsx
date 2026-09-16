import type { Metadata } from "next";
import { Suspense } from "react";

import { CampaignWizard, WizardSkeleton } from "@/components/campaign/campaign-wizard";

export const metadata: Metadata = {
  title: "Nouvelle campagne",
};

export default function NewCampaignPage() {
  return (
    <Suspense fallback={<WizardSkeleton />}>
      <CampaignWizard />
    </Suspense>
  );
}
