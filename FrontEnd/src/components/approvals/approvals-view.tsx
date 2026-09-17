"use client";

import { CheckCheck, Megaphone, RefreshCw, Siren } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ReadOnlyNotice } from "@/components/admin/admin-ui";
import {
  approverLine,
  progressLabel,
  reasonLabels,
} from "@/components/approvals/approval-model";
import { useSession } from "@/components/shell/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Field, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { approvalsApi } from "@/lib/api/endpoints-supervision";
import { presentError } from "@/lib/api/errors";
import type {
  PendingCampaignApproval,
  PendingEmergencyApproval,
} from "@/lib/api/types-supervision";
import { formatDate, formatDateTime } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

/** Page « Approbations » (docs/round2-contract.md §5.8): what waits for a second administrator. */
export function ApprovalsView() {
  const { role, canAct } = useSession();
  const { toast } = useToast();
  const { data, error, loading, reload } = useResource("admin:approvals", (signal) =>
    approvalsApi.pending({ signal }),
  );
  const [busy, setBusy] = useState<number | null>(null);
  const [refusing, setRefusing] = useState<PendingEmergencyApproval | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  const approveEmergency = async (item: PendingEmergencyApproval) => {
    setBusy(item.emergencyId);
    try {
      await approvalsApi.approveEmergency(item.emergencyId);
      toast({ title: `« ${item.title} » approuvé`, variant: "success" });
      reload();
    } catch (e) {
      toast({
        title: "Approbation impossible",
        description: presentError(e).message,
        variant: "danger",
      });
    } finally {
      setBusy(null);
    }
  };

  const refuseEmergency = async () => {
    if (!refusing) return;
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setReasonError("Motif de refus obligatoire (3 à 500 caractères).");
      return;
    }
    setBusy(refusing.emergencyId);
    try {
      await approvalsApi.refuseEmergency(refusing.emergencyId, trimmed);
      toast({ title: `« ${refusing.title} » refusé`, variant: "success" });
      setRefusing(null);
      setReason("");
      setReasonError(null);
      reload();
    } catch (e) {
      setReasonError(presentError(e).message);
    } finally {
      setBusy(null);
    }
  };

  const header = (
    <PageHeader
      title="Approbations"
      description="Validations de campagnes et messages prioritaires qui demandent un second administrateur."
      secondaryActions={
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<RefreshCw aria-hidden="true" />}
          onClick={reload}
          loading={loading && data !== undefined}
          loadingLabel="Actualisation…"
        >
          Actualiser
        </Button>
      }
    />
  );

  if (error) {
    return (
      <>
        {header}
        <ErrorState error={error} onRetry={reload} />
      </>
    );
  }

  if (loading && !data) {
    return (
      <>
        {header}
        <LoadingRegion label="Chargement des approbations…">
          <Skeleton className="mt-6 h-40 rounded-card" />
          <Skeleton className="mt-4 h-40 rounded-card" />
        </LoadingRegion>
      </>
    );
  }

  const campaigns = data?.campaigns ?? [];
  const emergencies = data?.emergencies ?? [];
  const empty = campaigns.length === 0 && emergencies.length === 0;

  return (
    <>
      {header}
      {!canAct ? <ReadOnlyNotice role={role} className="mb-8" /> : null}

      {empty ? (
        <EmptyState
          icon={<CheckCheck />}
          title="Aucune approbation en attente"
          description="Les validations sensibles apparaîtront ici dès qu'un administrateur en aura enregistré une."
        />
      ) : null}

      {campaigns.length > 0 ? (
        <SectionCard
          title="Campagnes"
          description="Validation avec dérogation IA ou risque élevé : deux administrateurs distincts."
          className="mt-6"
        >
          <ul className="flex flex-col gap-3">
            {campaigns.map((item: PendingCampaignApproval) => (
              <li key={item.campaignId} className="rounded-control border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Megaphone aria-hidden="true" className="size-4 text-muted" />
                  <span className="font-label font-semibold text-ink-strong">
                    {item.campaignName}
                  </span>
                  <Badge tone="warning">
                    {progressLabel(item.approvals, item.approvalsRequired)}
                  </Badge>
                  <span className="text-[0.8125rem] text-muted">
                    {item.clientName ?? "Annonceur inconnu"}
                  </span>
                  <span className="ml-auto text-xs text-muted tabular">
                    Depuis le {formatDateTime(item.requestedAt)}
                  </span>
                </div>
                <p className="mt-1 text-[0.8125rem] text-muted">
                  Motif : {reasonLabels(item.reasons, item.riskScore, item.riskThreshold).join(" · ")}
                </p>
                {item.approvals.length > 0 ? (
                  <p className="text-[0.8125rem] text-muted">
                    Approuvée par {approverLine(item.approvals)}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant={item.canApprove ? "primary" : "secondary"}>
                    <Link href={`/admin/moderation?examen=${item.campaignId}`}>
                      {item.canApprove ? "Ouvrir et approuver" : "Consulter l'examen"}
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {emergencies.length > 0 ? (
        <SectionCard
          title="Messages prioritaires"
          description="Un message reste hors antenne tant que les approbations ne sont pas réunies."
          className="mt-6"
        >
          <ul className="flex flex-col gap-3">
            {emergencies.map((item) => (
              <li key={item.emergencyId} className="rounded-control border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Siren aria-hidden="true" className="size-4 text-muted" />
                  <span className="font-label font-semibold text-ink-strong">{item.title}</span>
                  <Badge tone="warning">
                    {progressLabel(item.approvals, item.approvalsRequired)}
                  </Badge>
                  <span className="text-[0.8125rem] text-muted">
                    {item.zoneName ?? "Zone inconnue"} · du {formatDate(item.startDate)} au{" "}
                    {formatDate(item.endDate)}
                  </span>
                  <span className="ml-auto text-xs text-muted tabular">
                    Créé par {item.createdByName ?? "un administrateur"}
                  </span>
                </div>
                {item.approvals.length > 0 ? (
                  <p className="mt-1 text-[0.8125rem] text-muted">
                    Approuvé par {approverLine(item.approvals)}
                  </p>
                ) : null}
                {item.canApprove ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      loading={busy === item.emergencyId}
                      loadingLabel="Approbation en cours"
                      onClick={() => void approveEmergency(item)}
                    >
                      Approuver
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setRefusing(item);
                        setReason("");
                        setReasonError(null);
                      }}
                    >
                      Refuser
                    </Button>
                  </div>
                ) : (
                  <p className="mt-2 text-[0.8125rem] text-muted">
                    Vous avez déjà approuvé ce message ou votre rôle ne permet pas de décider.
                  </p>
                )}
                {refusing?.emergencyId === item.emergencyId ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <Field label="Motif du refus" error={reasonError} hint="3 à 500 caractères.">
                      <Textarea
                        rows={3}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        maxLength={500}
                      />
                    </Field>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="danger"
                        loading={busy === item.emergencyId}
                        loadingLabel="Refus en cours"
                        onClick={() => void refuseEmergency()}
                      >
                        Confirmer le refus
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRefusing(null)}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </>
  );
}
