"use client";

import {
  Activity,
  ArrowRight,
  CalendarRange,
  Check,
  CopyPlus,
  Hourglass,
  Images,
  MonitorPlay,
  PencilLine,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  Send,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AiReportBody, AiResultPanel, SubmitFlowStatus } from "@/components/campaign/ai-analysis";
import { getCampaignActions, parseCampaignId } from "@/components/campaign/campaign-actions";
import {
  activeReservations,
  type AiReportState,
  type CampaignDetailData,
  campaignReference,
  isCampaignNotFound,
  joinReservations,
  type JoinedReservation,
  loadCampaignDetail,
  PENDING_POLL_WINDOW_MS,
  pollIntervalFor,
} from "@/components/campaign/campaign-data";
import { lastActivityAt } from "@/components/campaign/campaign-list-model";
import { CampaignStatsCard } from "@/components/campaign/campaign-stats-card";
import { CampaignNotFound, FactGrid } from "@/components/campaign/campaign-ui";
import { CampaignZonesMap } from "@/components/campaign/campaign-zones-map";
import { DuplicateCampaignDialog } from "@/components/campaign/duplicate-campaign-dialog";
import { EstimateInvoice } from "@/components/campaign/estimate-invoice";
import { MediaGallery } from "@/components/campaign/media-gallery";
import { previewKind } from "@/components/campaign/media-model";
import { ReservationList } from "@/components/campaign/reservation-list";
import {
  OrientationToggle,
  ScreenMockup,
  type ScreenOrientation,
} from "@/components/campaign/screen-mockup";
import { aiOutcomeOf, useSubmitFlow } from "@/components/campaign/use-submit-flow";
import { useDocumentTitle } from "@/components/shell/breadcrumbs";
import { useCommandPalette, useRecordRecent } from "@/components/shell/command-palette";
import { useOptionalSessionContext } from "@/components/shell/session-context";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { MenuAction } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { LoadingRegion, Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { RESERVATION_HINT, REVIEW_WAIT_SENTENCE } from "@/content/glossary";
import { CONTACT } from "@/content/site";
import { campaignsApi, reservationsApi } from "@/lib/api/endpoints";
import { presentError } from "@/lib/api/errors";
import type { CampaignResponse, CampaignStatus } from "@/lib/api/types";
import {
  AI_SECTOR_LABEL,
  CAMPAIGN_TIMELINE_STEPS,
  getCampaignStatusMeta,
  getCampaignTimeCue,
  getCampaignTimelineStep,
  isAwaitingAdmin,
  TERMINATION_REASON_LABEL,
} from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import {
  formatDate,
  formatDateRange,
  formatDateRangeLong,
  formatDateTime,
  formatNumber,
  formatTime,
  formatTND,
  todayISO,
} from "@/lib/format";
import { invalidate, resourceKeys } from "@/lib/resource-cache";
import { routes } from "@/lib/routes";
import { formatSlot } from "@/lib/time-slots";
import { useResource } from "@/lib/use-resource";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** mailto: TPUB with a prefilled subject/body. */
export function tpubMailto(subject: string, body: string): string {
  return `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** « 2 réservations du mer. 14 oct. au mar. 20 oct. 2026 seront libérées. Action définitive. » */
export function deleteDescription(
  campaign: Pick<CampaignResponse, "startDate" | "endDate">,
  activeCount: number,
): string {
  if (activeCount === 0)
    return "Aucun Porteur n'est réservé pour cette campagne. Action définitive.";
  const range = formatDateRangeLong(campaign.startDate, campaign.endDate, {
    weekday: "short",
    withDuration: false,
  });
  const what = activeCount === 1 ? "1 réservation" : `${formatNumber(activeCount)} réservations`;
  const verb = activeCount === 1 ? "sera libérée" : "seront libérées";
  return `${what}${range ? ` ${range}` : ""} ${verb}, ainsi que les médias. Action définitive.`;
}

type StepState = "done" | "current" | "live" | "upcoming" | "failed";

export interface TimelineStepView {
  label: string;
  description: string;
  state: StepState;
}

/**
 * Lifecycle timeline (contract §5 F1): Brouillon → Analyse IA → Validation TPUB → Programmée →
 * En diffusion → Terminée. REJECTED_BY_AI / BLOCKED stop in red at their step.
 */
export function campaignTimelineViews(
  campaign: Pick<
    CampaignResponse,
    | "status"
    | "startDate"
    | "endDate"
    | "validatedAt"
    | "activatedAt"
    | "terminatedAt"
    | "terminationReason"
    | "submittedAt"
  >,
): TimelineStepView[] {
  const { index, state } = getCampaignTimelineStep(campaign.status);
  const descriptions: string[] = [
    "Modifiable jusqu'à l'envoi",
    campaign.submittedAt
      ? `Soumise le ${formatDate(campaign.submittedAt, "medium")}`
      : "Contrôle automatique",
    campaign.validatedAt
      ? `Validée le ${formatDate(campaign.validatedAt, "medium")}`
      : "Examen par TPUB",
    campaign.startDate
      ? `À partir du ${formatDate(campaign.startDate, "medium")}`
      : "Date de début",
    campaign.activatedAt
      ? `Depuis le ${formatDate(campaign.activatedAt, "medium")}`
      : campaign.endDate
        ? `Jusqu'au ${formatDate(campaign.endDate, "medium")}`
        : "Sur les Porteurs réservés",
    campaign.terminationReason
      ? TERMINATION_REASON_LABEL[campaign.terminationReason]
      : campaign.terminatedAt
        ? `Le ${formatDate(campaign.terminatedAt, "medium")}`
        : "Fin de période ou de budget",
  ];
  return CAMPAIGN_TIMELINE_STEPS.map((label, i) => {
    let s: StepState;
    if (state === "complete") s = "done";
    else if (i < index) s = "done";
    else if (i === index)
      s = state === "failed" ? "failed" : campaign.status === "ACTIVE" ? "live" : "current";
    else s = "upcoming";
    return { label, description: descriptions[i] ?? "", state: s };
  });
}

const STEP_SR: Record<StepState, string> = {
  done: "Terminée",
  current: "En cours",
  live: "En cours",
  upcoming: "À venir",
  failed: "Interrompue",
};

function CampaignTimeline({ steps }: { steps: readonly TimelineStepView[] }) {
  return (
    <ol
      aria-label="Étapes de la campagne"
      className="grid grid-cols-2 gap-y-5 sm:grid-cols-3 lg:grid-cols-6"
    >
      {steps.map((step, i) => {
        const active = step.state === "current" || step.state === "live";
        return (
          <li
            key={step.label}
            aria-current={active ? "step" : undefined}
            className="flex flex-col items-center text-center"
          >
            <span
              aria-hidden="true"
              className={cx(
                "inline-flex size-[31px] shrink-0 items-center justify-center rounded-full border font-label text-[0.8125rem] font-semibold",
                step.state === "failed" && "border-danger/60 bg-danger/15 text-danger",
                step.state === "done" && "border-brand-blue bg-brand-blue text-on-brand",
                step.state === "current" &&
                  "border-brand-blue-text bg-blue-soft text-brand-blue-text shadow-[0_0_0_4px_var(--color-blue-soft)]",
                step.state === "live" && "border-success/60 bg-success/15 text-success",
                step.state === "upcoming" && "border-line-strong bg-surface text-muted",
              )}
            >
              {step.state === "failed" ? (
                <X className="size-4" />
              ) : step.state === "done" ? (
                <Check className="size-4" />
              ) : step.state === "live" ? (
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-success" />
                </span>
              ) : (
                i + 1
              )}
            </span>
            <span className="mt-2 px-1">
              <span
                className={cx(
                  "block font-label text-[0.8125rem] leading-snug font-semibold",
                  step.state === "failed"
                    ? "text-danger"
                    : active
                      ? "text-ink-strong"
                      : step.state === "done"
                        ? "text-ink-soft"
                        : "text-muted",
                )}
              >
                {step.label}
              </span>
              <span className="sr-only"> — {STEP_SR[step.state]}</span>
              <span className="mt-0.5 block text-[0.75rem] leading-snug text-muted">
                {step.description}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function DetailSkeleton({ slow, onRetry }: { slow?: boolean; onRetry?: () => void }) {
  return (
    <LoadingRegion label="Chargement de la campagne…" slow={slow} onRetry={onRetry}>
      <div className="mb-8 flex flex-col gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-80 max-w-full" />
      </div>
      <Skeleton className="h-40 w-full rounded-card" />
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonCard />
      </div>
    </LoadingRegion>
  );
}

function RecordRecent({ campaign }: { campaign: Pick<CampaignResponse, "id" | "name"> }) {
  useRecordRecent({
    label: campaign.name,
    href: routes.espace.campaign(campaign.id),
    kind: "campagne",
  });
  return null;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

interface Freshness {
  lastUpdatedAt: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
  pendingWindowOver: boolean;
}

function pollingNote(status: CampaignStatus, pendingWindowOver: boolean): string | null {
  if (status === "PENDING_AI_CHECK") {
    return pendingWindowOver
      ? "Actualisation automatique arrêtée : utilisez « Actualiser » pour vérifier le résultat."
      : "Actualisation automatique toutes les 10 secondes pendant 2 minutes.";
  }
  if (isAwaitingAdmin(status))
    return "Actualisation automatique chaque minute tant que cette page est ouverte.";
  return null;
}

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4);
}

/** True when every significant word of `hint` already appears in `sentence`. */
export function sentenceCovers(sentence: string, hint: string): boolean {
  const words = new Set(significantWords(sentence));
  const needed = significantWords(hint);
  return needed.length > 0 && needed.every((w) => words.has(w));
}

function StatusCard({
  campaign,
  today,
  freshness,
}: {
  campaign: CampaignResponse;
  today: string;
  freshness: Freshness;
}) {
  const meta = getCampaignStatusMeta(campaign, { audience: "annonceur", today });
  const cue = getCampaignTimeCue(campaign, today);
  const steps = useMemo(() => campaignTimelineViews(campaign), [campaign]);
  const note = pollingNote(campaign.status, freshness.pendingWindowOver);

  return (
    <SectionCard
      id="suivi"
      icon={Activity}
      title="Suivi de la campagne"
      aside={
        <div className="flex items-center gap-1">
          {freshness.lastUpdatedAt ? (
            <p className="text-[0.8125rem] whitespace-nowrap text-muted tabular">
              Mis à jour à {formatTime(freshness.lastUpdatedAt)}
            </p>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            aria-label="Actualiser"
            title="Actualiser"
            loading={freshness.refreshing}
            loadingLabel="Actualisation en cours"
            onClick={freshness.onRefresh}
            className="px-2.5"
          >
            <RefreshCw aria-hidden="true" />
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StatusPill
            type="campaign"
            campaign={campaign}
            audience="annonceur"
            today={today}
            showHint={Boolean(meta.hint) && !sentenceCovers(meta.description, meta.hint ?? "")}
          />
          {cue ? (
            <p
              className={cx(
                "text-[0.8125rem]",
                cue.tone === "warning"
                  ? "text-warning"
                  : cue.tone === "danger"
                    ? "text-danger"
                    : "text-ink-soft",
              )}
            >
              {cue.label}
            </p>
          ) : null}
          {campaign.terminationReason ? (
            <Badge tone="muted" size="sm">
              {TERMINATION_REASON_LABEL[campaign.terminationReason]}
            </Badge>
          ) : null}
        </div>
        <p className="max-w-[72ch] text-[0.9375rem] leading-relaxed text-ink-soft">
          {meta.description}
          {isAwaitingAdmin(campaign.status) && !meta.description.includes(REVIEW_WAIT_SENTENCE)
            ? ` ${REVIEW_WAIT_SENTENCE}`
            : ""}
        </p>
        {note ? (
          <p className="text-[0.8125rem] leading-relaxed text-muted" data-testid="polling-note">
            {note}
          </p>
        ) : null}
      </div>
      <div className="mt-6 border-t border-line pt-6">
        <CampaignTimeline steps={steps} />
      </div>
    </SectionCard>
  );
}

/** « Motif du refus TPUB » and the admin comment (contract §2.1). */
function DecisionNotes({ campaign }: { campaign: CampaignResponse }) {
  const refused = campaign.status === "BLOCKED" || campaign.status === "REJECTED_BY_AI";
  if (!campaign.rejectionReason && !campaign.adminComment) return null;
  return (
    <div className="flex flex-col gap-3">
      {campaign.rejectionReason ? (
        <Alert
          tone={refused ? "danger" : "warning"}
          live="none"
          icon={<ShieldAlert />}
          title={refused ? "Motif du refus TPUB" : "Motif du dernier refus"}
        >
          {campaign.rejectionReason}
          {refused ? (
            <p className="mt-1 text-[0.8125rem] text-muted">
              Corrigez la campagne selon ce motif : elle repasse en brouillon et peut être soumise à
              nouveau.
            </p>
          ) : null}
        </Alert>
      ) : null}
      {campaign.adminComment ? (
        <Alert tone="info" live="none" title="Commentaire de TPUB">
          {campaign.adminComment}
        </Alert>
      ) : null}
    </div>
  );
}

function AiReportSection({
  ai,
  campaign,
  flowActive,
  canRunAi,
  busy,
  onRunAi,
  pendingWindowOver,
}: {
  ai: AiReportState;
  campaign: CampaignResponse;
  flowActive: boolean;
  canRunAi: boolean;
  busy: boolean;
  onRunAi: () => void;
  pendingWindowOver: boolean;
}) {
  if (flowActive) return null;
  return (
    <SectionCard
      id="rapport-ia"
      icon={ScanSearch}
      title="Rapport IA"
      description={
        ai.kind === "report" && ai.report.preview
          ? "Pré-analyse du brouillon (indicative)."
          : "Analyse automatique de conformité, de risque et de qualité."
      }
      aside={
        ai.kind === "report" ? <StatusPill type="ai" status={ai.report.aiStatus} size="sm" /> : null
      }
    >
      {ai.kind === "report" ? (
        <AiReportBody report={ai.report} />
      ) : ai.kind === "none" ? (
        campaign.status === "PENDING_AI_CHECK" ? (
          <EmptyState
            compact
            icon={<Hourglass />}
            title="Analyse en cours"
            description={
              pendingWindowOver
                ? "Le résultat n'est pas encore disponible. Relancez l'analyse ou actualisez la page."
                : "Le résultat s'affiche ici dès qu'il est prêt."
            }
            action={
              canRunAi ? (
                <Button
                  variant="secondary"
                  iconLeft={<ScanSearch aria-hidden="true" />}
                  onClick={onRunAi}
                  disabled={busy}
                >
                  Relancer l&apos;analyse
                </Button>
              ) : undefined
            }
          />
        ) : (
          <EmptyState
            compact
            icon={<ScanSearch />}
            title="Aucune analyse pour cette campagne"
            description="L'analyse IA démarre à la soumission. Une pré-analyse est possible à l'étape « Contenu » de l'assistant."
          />
        )
      ) : (
        <ErrorState scope="section" error={ai.error} title="Rapport IA indisponible" />
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Detail view
// ---------------------------------------------------------------------------

function DetailView({
  data,
  reload,
  freshness,
}: {
  data: CampaignDetailData;
  reload: () => void;
  freshness: Freshness;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const session = useOptionalSessionContext();
  const { campaign, reservations, ai, media, estimate } = data;
  const [today] = useState(() => todayISO());

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [orientation, setOrientation] = useState<ScreenOrientation>("landscape");
  const [previewId, setPreviewId] = useState<number | null>(null);
  const flow = useSubmitFlow(() => reload());

  useDocumentTitle(campaign.name);

  const joined: JoinedReservation[] = useMemo(() => joinReservations(reservations), [reservations]);
  const active = activeReservations(joined);
  const actions = getCampaignActions(campaign, { reservationCount: active.length });
  const flowActive = flow.state.phase !== "idle";
  const busy = flow.state.phase === "submitting";
  const isDraft = campaign.status === "BROUILLON";
  const hasTemporary = joined.some((r) => r.reservationStatus === "TEMPORAIRE");
  const mediaList = media.ok ? media.value : [];
  const previewMedia = mediaList.find((m) => m.id === previewId) ?? mediaList[0] ?? null;

  const remove = async () => {
    await campaignsApi.remove(campaign.id);
    invalidate(resourceKeys.campaignsMine);
    invalidate(resourceKeys.reservationsByCampaign(campaign.id));
    toast({
      title: "Campagne supprimée",
      description:
        active.length > 0
          ? "Ses réservations ont été libérées."
          : "Elle n'apparaît plus dans vos campagnes.",
      variant: "success",
    });
    router.push(routes.espace.campaigns());
  };

  const reopen = async () => {
    await campaignsApi.reopen(campaign.id);
    invalidate(resourceKeys.campaignsMine);
    toast({
      title: "Campagne remise en brouillon",
      description: "Corrigez le contenu, la zone ou les Porteurs, puis soumettez-la à nouveau.",
      variant: "success",
    });
    router.push(routes.espace.wizard(campaign.id, "contenu"));
  };

  const cancelReservation = async (r: JoinedReservation) => {
    setCancellingId(r.id);
    try {
      await reservationsApi.cancel(r.id, "Annulée par l'annonceur");
      invalidate(resourceKeys.campaignsMine);
      invalidate(resourceKeys.reservationsByCampaign(campaign.id));
      toast({ title: `Réservation annulée : ${r.supportName}`, variant: "success" });
      reload();
    } catch (e) {
      toast({
        title: "Annulation impossible",
        description: presentError(e).message,
        variant: "danger",
      });
    } finally {
      setCancellingId(null);
    }
  };

  // Header actions: one primary, secondaries, overflow with delete last.
  const primaryAction = isDraft ? (
    <Button asChild variant="primary">
      <Link
        href={routes.espace.wizard(campaign.id, active.length > 0 ? "verification" : "contenu")}
      >
        Finaliser
        <ArrowRight aria-hidden="true" />
      </Link>
    </Button>
  ) : actions.reopen ? (
    <Button
      variant="primary"
      iconLeft={<RotateCcw aria-hidden="true" />}
      onClick={() => setReopenOpen(true)}
      disabled={busy}
    >
      Corriger
    </Button>
  ) : undefined;

  const secondaryActions: MenuAction[] = [];
  if (isDraft && actions.submit) {
    secondaryActions.push({
      label: "Soumettre",
      href: routes.espace.wizard(campaign.id, "verification"),
      icon: <Send aria-hidden="true" />,
    });
  }
  if (actions.edit) {
    secondaryActions.push(
      isDraft
        ? {
            label: "Modifier",
            href: routes.espace.wizard(campaign.id, "details"),
            icon: <PencilLine aria-hidden="true" />,
          }
        : {
            label: "Modifier",
            onSelect: () => setEditConfirmOpen(true),
            icon: <PencilLine aria-hidden="true" />,
          },
    );
  }

  const overflow: MenuAction[] = [
    {
      label: "Dupliquer",
      onSelect: () => setDuplicateOpen(true),
      icon: <CopyPlus aria-hidden="true" />,
      disabled: busy,
    },
  ];
  if (actions.remove) {
    overflow.push({
      label: "Supprimer",
      tone: "danger",
      onSelect: () => setDeleteOpen(true),
      icon: <Trash2 aria-hidden="true" />,
      disabled: busy,
    });
  }

  const flowOutcome =
    flow.state.phase === "done"
      ? (flow.state.report?.aiStatus ??
        (flow.state.campaign ? aiOutcomeOf(flow.state.campaign.status) : null))
      : null;

  return (
    <>
      {session ? <RecordRecent campaign={campaign} /> : null}
      <PageHeader
        eyebrow={campaignReference(campaign.id)}
        breadcrumbs={[
          { label: "Campagnes", href: routes.espace.campaigns() },
          { label: campaign.name },
        ]}
        title={<span className="break-words">{campaign.name}</span>}
        meta={<StatusPill type="campaign" campaign={campaign} audience="annonceur" today={today} />}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions.length > 0 ? secondaryActions : undefined}
        overflowActions={overflow}
        overflowLabel="Plus d'actions"
      />

      <div className="flex flex-col gap-6">
        <StatusCard campaign={campaign} today={today} freshness={freshness} />
        <DecisionNotes campaign={campaign} />

        {flow.state.phase === "done" ? (
          <AiResultPanel headingAs="h2" report={flow.state.report} outcome={flowOutcome} />
        ) : (
          <SubmitFlowStatus
            state={flow.state}
            campaignName={campaign.name}
            objective={campaign.objective}
            onRetry={() => void flow.retry()}
          />
        )}

        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <SectionCard id="parametres" icon={CalendarRange} title="Paramètres">
              <FactGrid
                items={[
                  {
                    label: "Budget",
                    value: <span className="tabular">{formatTND(campaign.budget)}</span>,
                  },
                  {
                    label: "Budget consommé",
                    value: (
                      <span className="tabular">
                        {formatTND(campaign.consumedBudget)}
                        {campaign.remainingBudget !== undefined ? (
                          <span className="text-muted">
                            {" "}
                            · reste {formatTND(campaign.remainingBudget)}
                          </span>
                        ) : null}
                      </span>
                    ),
                  },
                  {
                    label: "Période",
                    value: (
                      <span className="tabular">
                        {formatDateRange(campaign.startDate, campaign.endDate, "medium")}
                      </span>
                    ),
                  },
                  { label: "Créneau", value: formatSlot(campaign.startTime, campaign.endTime) },
                  {
                    label: "Estimation",
                    value: (
                      <span className="tabular">
                        {formatNumber(campaign.estimatedViews)} affichages ·{" "}
                        {formatTND(campaign.estimatedCost ?? 0)}
                      </span>
                    ),
                  },
                  {
                    label: "Analyse IA",
                    value:
                      campaign.aiRiskScore !== null && campaign.aiRiskScore !== undefined
                        ? `Risque ${campaign.aiRiskScore}/100 · qualité ${campaign.aiQualityScore ?? "—"}/100${campaign.aiSector ? ` · ${AI_SECTOR_LABEL[campaign.aiSector]}` : ""}`
                        : "Pas encore analysée",
                  },
                  { label: "Créée le", value: formatDate(campaign.createdAt, "medium") },
                  {
                    label: "Soumise le",
                    value: campaign.submittedAt
                      ? formatDateTime(campaign.submittedAt)
                      : "Pas encore soumise",
                  },
                  {
                    label: "Objectif",
                    value: campaign.objective?.trim() || "Non renseigné",
                    wide: true,
                  },
                ]}
              />
              {campaign.duplicatedFromId ? (
                <p className="mt-3 text-[0.8125rem] text-muted">
                  Copie de la campagne{" "}
                  <Link
                    href={routes.espace.campaign(campaign.duplicatedFromId)}
                    className="text-brand-blue-text hover:underline"
                  >
                    {campaignReference(campaign.duplicatedFromId)}
                  </Link>
                  .
                </p>
              ) : null}
            </SectionCard>

            <SectionCard
              id="medias"
              icon={Images}
              title="Médias"
              description="Visuels et vidéos diffusés sur les Porteurs."
              aside={
                isDraft ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link href={routes.espace.wizard(campaign.id, "contenu")}>
                      Gérer les médias
                    </Link>
                  </Button>
                ) : null
              }
            >
              {!media.ok ? (
                <ErrorState
                  scope="section"
                  error={media.error}
                  onRetry={reload}
                  title="Médias indisponibles"
                />
              ) : mediaList.length === 0 ? (
                <EmptyState
                  compact
                  icon={<Images />}
                  title="Aucun média"
                  description="La campagne n'a pas de visuel : l'écran affiche un contenu générique."
                />
              ) : (
                <MediaGallery
                  campaignId={campaign.id}
                  media={mediaList}
                  playable
                  selectedId={previewMedia?.id ?? null}
                  onSelect={(m) => setPreviewId(m.id)}
                />
              )}
            </SectionCard>

            <CampaignZonesMap campaign={campaign} reservations={reservations} />

            <SectionCard
              id="reservations"
              icon={MonitorPlay}
              title="Porteurs réservés"
              description="Réservations de la campagne sur sa période et son créneau."
              aside={
                <>
                  {isDraft ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={routes.espace.wizard(campaign.id, "porteurs")}>
                        Gérer les Porteurs
                      </Link>
                    </Button>
                  ) : null}
                  {joined.length > 0 ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={routes.espace.reservations({ campagne: campaign.id })}>
                        Tout voir
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : null}
                </>
              }
            >
              {joined.length > 0 ? (
                <>
                  <ReservationList
                    reservations={joined}
                    longStatus
                    showCost
                    onCancel={(r) => void cancelReservation(r)}
                    cancellingId={cancellingId}
                  />
                  {hasTemporary ? (
                    <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
                      {RESERVATION_HINT.TEMPORAIRE}
                    </p>
                  ) : null}
                </>
              ) : (
                <EmptyState
                  compact
                  icon={<MonitorPlay />}
                  title="Aucun Porteur réservé"
                  description={
                    isDraft
                      ? "Placez votre zone sur la carte puis réservez les Porteurs disponibles."
                      : "Aucun Porteur n'est rattaché à cette campagne."
                  }
                  action={
                    isDraft ? (
                      <Button asChild variant="secondary" size="sm">
                        <Link href={routes.espace.wizard(campaign.id, "porteurs")}>
                          Choisir la zone et les Porteurs
                        </Link>
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </SectionCard>

            <AiReportSection
              ai={ai}
              campaign={campaign}
              flowActive={flowActive}
              canRunAi={actions.runAiCheck}
              busy={busy}
              onRunAi={() => void flow.start(campaign)}
              pendingWindowOver={freshness.pendingWindowOver}
            />

            <CampaignStatsCard campaign={campaign} />
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <SectionCard id="apercu" icon={MonitorPlay} title="Aperçu à l'écran">
              <div className="mb-5 flex justify-center">
                <OrientationToggle value={orientation} onChange={setOrientation} />
              </div>
              <ScreenMockup
                creative={
                  previewMedia
                    ? {
                        url: previewMedia.url,
                        kind: previewKind(previewMedia.fileType),
                        name: previewMedia.fileName,
                      }
                    : null
                }
                orientation={orientation}
                campaignName={campaign.name}
                objective={campaign.objective}
                location={active[0]?.zoneName}
              />
            </SectionCard>
            <EstimateInvoice
              campaignId={campaign.id}
              estimate={estimate.ok ? estimate.value : null}
              error={estimate.ok ? null : estimate.error}
              onRetry={reload}
            />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        tone="danger"
        title={`Supprimer « ${campaign.name} » ?`}
        description={deleteDescription(campaign, active.length)}
        confirmLabel="Supprimer"
        onConfirm={remove}
      />
      <ConfirmDialog
        open={editConfirmOpen}
        onOpenChange={setEditConfirmOpen}
        tone="primary"
        title="Modifier la campagne ?"
        description="La campagne repassera en brouillon à l'enregistrement : il faudra la soumettre à nouveau (analyse IA puis validation TPUB)."
        confirmLabel="Continuer"
        onConfirm={() => router.push(routes.espace.campaignEdit(campaign.id))}
      />
      <ConfirmDialog
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        tone="primary"
        title="Corriger la campagne ?"
        description="La campagne repasse en brouillon : corrigez son contenu, sa zone ou ses Porteurs, puis soumettez-la à nouveau."
        confirmLabel="Remettre en brouillon"
        onConfirm={reopen}
      />
      <DuplicateCampaignDialog
        campaign={campaign}
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Not found
// ---------------------------------------------------------------------------

function NotFoundView() {
  const { open } = useCommandPalette();
  useDocumentTitle("Campagne introuvable");
  const { data } = useResource("campaigns-mine", (signal) => campaignsApi.mine({ signal }), {
    cacheKey: resourceKeys.campaignsMine,
    revalidateOnFocus: false,
  });
  const recent = useMemo(
    () =>
      [...(data ?? [])]
        .sort((a, b) => Date.parse(lastActivityAt(b)) - Date.parse(lastActivityAt(a)))
        .slice(0, 3),
    [data],
  );
  return (
    <>
      <PageHeader
        title="Campagne introuvable"
        breadcrumbs={[
          { label: "Campagnes", href: routes.espace.campaigns() },
          { label: "Introuvable" },
        ]}
      />
      <CampaignNotFound recent={recent} onSearch={() => open()} showTitle={false} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/** Polling window for PENDING_AI_CHECK: returns true once the 2-minute window is over. */
function usePendingWindow(status: CampaignStatus | null, campaignId: number | null): boolean {
  const token = status === "PENDING_AI_CHECK" && campaignId !== null ? String(campaignId) : null;
  const [overFor, setOverFor] = useState<string | null>(null);
  useEffect(() => {
    if (token === null) return;
    const timer = setTimeout(() => setOverFor(token), PENDING_POLL_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [token]);
  return token !== null && overFor === token;
}

/** /espace/campagnes/[id] */
export function CampaignDetail({ idParam }: { idParam: string }) {
  const id = parseCampaignId(idParam);
  const [status, setStatus] = useState<CampaignStatus | null>(null);
  const pendingWindowOver = usePendingWindow(status, id);

  const { data, error, loading, reload, slow, lastUpdatedAt, revalidating } = useResource(
    id === null ? null : `campaign-detail-${id}`,
    (signal) => loadCampaignDetail(id, signal),
    { pollInterval: status ? pollIntervalFor(status, { pendingWindowOver }) : null },
  );

  const current = id !== null && data?.campaign.id === id ? data : null;
  const currentStatus = current?.campaign.status ?? null;
  if (currentStatus !== status) setStatus(currentStatus);

  if (current) {
    return (
      <DetailView
        data={current}
        reload={reload}
        freshness={{
          lastUpdatedAt: lastUpdatedAt ?? null,
          refreshing: loading || Boolean(revalidating),
          onRefresh: reload,
          pendingWindowOver,
        }}
      />
    );
  }
  if (id !== null && (loading || !error)) return <DetailSkeleton slow={slow} onRetry={reload} />;
  if (id === null || isCampaignNotFound(error)) return <NotFoundView />;
  return (
    <>
      <PageHeader
        title="Détail de la campagne"
        breadcrumbs={[{ label: "Campagnes", href: routes.espace.campaigns() }, { label: "Détail" }]}
      />
      <ErrorState
        error={error}
        onRetry={reload}
        backHref={routes.espace.campaigns()}
        backLabel="Mes campagnes"
      />
    </>
  );
}
