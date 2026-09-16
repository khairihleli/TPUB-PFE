"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { clearLocalCreative } from "@/components/campaign/creative-store";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { campaignsApi } from "@/lib/api/endpoints";
import type { CampaignResponse } from "@/lib/api/types";
import { isEditable } from "@/lib/campaign-status";
import { invalidate, resourceKeys } from "@/lib/resource-cache";
import { routes } from "@/lib/routes";

export interface DuplicateCampaignDialogProps {
  campaign: CampaignResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * « Dupliquer et corriger » (contract §7.13): REJECTED_BY_AI cannot be resubmitted, so a new
 * draft is POSTed with the same fields and the wizard opens on step 2 (Porteurs).
 * A campaign rejected by the AI keeps its TEMPORAIRE reservations: they would conflict with the
 * copy on the same Porteurs, so deleting the original (which frees them) is offered.
 * Also used for a plain « Dupliquer » of a draft.
 */
export function DuplicateCampaignDialog({
  campaign,
  open,
  onOpenChange,
}: DuplicateCampaignDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const canDeleteOriginal = isEditable(campaign.status);
  const toCorrect = campaign.status === "REJECTED_BY_AI" || campaign.status === "BLOCKED";
  const [deleteOriginal, setDeleteOriginal] = useState(false);

  const duplicate = async () => {
    const copy = await campaignsApi.duplicate(campaign);
    let deleted = false;
    if (canDeleteOriginal && deleteOriginal) {
      try {
        await campaignsApi.remove(campaign.id);
        clearLocalCreative(campaign.id);
        invalidate(resourceKeys.reservationsByCampaign(campaign.id));
        deleted = true;
      } catch {
        toast({
          title: "Copie créée, suppression de l'original impossible",
          description: "Vous pourrez supprimer la campagne d'origine depuis sa page.",
          variant: "warning",
        });
      }
    }
    invalidate(resourceKeys.campaignsMine);
    toast({
      title: "Campagne dupliquée",
      description: deleted
        ? "La campagne d'origine a été supprimée et ses créneaux libérés. Choisissez vos Porteurs."
        : "Un nouveau brouillon a été créé avec les mêmes informations. Choisissez vos Porteurs.",
      variant: "success",
    });
    router.push(routes.espace.wizard(copy.id, "porteurs"));
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="primary"
      title={toCorrect ? "Dupliquer et corriger ?" : `Dupliquer « ${campaign.name} » ?`}
      description={
        toCorrect
          ? "Un nouveau brouillon est créé avec le même nom, objectif, budget, période et plage horaire. Vous choisirez ensuite vos Porteurs, puis pourrez corriger le contenu avant de le soumettre."
          : "Un nouveau brouillon est créé avec le même nom, objectif, budget, période et plage horaire. Les créneaux ne sont pas copiés : vous choisirez vos Porteurs."
      }
      confirmLabel="Dupliquer"
      onConfirm={duplicate}
    >
      {canDeleteOriginal ? (
        <Checkbox
          checked={deleteOriginal}
          onChange={(e) => setDeleteOriginal(e.target.checked)}
          label="Supprimer la campagne d'origine"
          description="Recommandé pour réserver les mêmes Porteurs : ses créneaux restent bloqués tant qu'elle existe. Cette suppression est définitive."
        />
      ) : null}
    </ConfirmDialog>
  );
}
