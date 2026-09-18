"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { campaignsApi } from "@/lib/api/endpoints";
import type { CampaignResponse } from "@/lib/api/types";
import { invalidate, resourceKeys } from "@/lib/resource-cache";
import { routes } from "@/lib/routes";

export interface DuplicateCampaignDialogProps {
  campaign: Pick<CampaignResponse, "id" | "name" | "mediaCount">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * « Dupliquer » (contract §2.1 POST /campaigns/{id}/duplicate): the server creates a draft
 * « Copie de … » with the objective, budget, créneau, zones and (optionally) the media. Dates are
 * kept only when still to come; reservations are never copied, so the wizard opens on the zone
 * step.
 */
export function DuplicateCampaignDialog({
  campaign,
  open,
  onOpenChange,
}: DuplicateCampaignDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const hasMedia = (campaign.mediaCount ?? 0) > 0;
  const [includeMedia, setIncludeMedia] = useState(true);

  const duplicate = async () => {
    const copy = await campaignsApi.duplicate(campaign.id, {
      includeMedia: hasMedia && includeMedia,
    });
    invalidate(resourceKeys.campaignsMine);
    toast({
      title: "Campagne dupliquée",
      description: `« ${copy.name} » est un nouveau brouillon. Vérifiez la période puis réservez vos Porteurs.`,
      variant: "success",
    });
    router.push(routes.espace.wizard(copy.id, copy.startDate ? "porteurs" : "details"));
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="primary"
      title={`Dupliquer « ${campaign.name} » ?`}
      description="Un nouveau brouillon reprend l'objectif, le budget, le créneau et les zones. Les dates passées sont retirées et les réservations ne sont pas copiées."
      confirmLabel="Dupliquer"
      onConfirm={duplicate}
    >
      {hasMedia ? (
        <Checkbox
          checked={includeMedia}
          onChange={(e) => setIncludeMedia(e.target.checked)}
          label="Inclure les médias"
          description="Les visuels et vidéos sont copiés dans le nouveau brouillon."
        />
      ) : null}
    </ConfirmDialog>
  );
}
