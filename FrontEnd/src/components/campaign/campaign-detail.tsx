"use client";

import {
  Activity,
  ArrowRight,
  CalendarRange,
  Check,
  CopyPlus,
  Flag,
  Hourglass,
  Mail,
  MonitorPlay,
  PencilLine,
  RefreshCw,
  ScanSearch,
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
import { CampaignNotFound, FactGrid } from "@/components/campaign/campaign-ui";
import { CreativeDropzone } from "@/components/campaign/creative-dropzone";
import { clearLocalCreative, useLocalCreative } from "@/components/campaign/creative-store";
import { DuplicateCampaignDialog } from "@/components/campaign/duplicate-campaign-dialog";
import { EstimateInvoice } from "@/components/campaign/estimate-invoice";
import { ReservationList } from "@/components/campaign/reservation-list";
import {
  OrientationToggle,
  ScreenMockup,
  type ScreenOrientation,
} from "@/components/campaign/screen-mockup";
import { useSubmitFlow } from "@/components/campaign/use-submit-flow";
import { useDocumentTitle } from "@/components/shell/breadcrumbs";
import { useCommandPalette, useRecordRecent } from "@/components/shell/command-palette";
import { useOptionalSessionContext } from "@/components/shell/session-context";
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
import { RESERVATION_HINT, REVIEW_WAIT_SENTENCE, SUPPORT_HOURS } from "@/content/glossary";
import { CONTACT } from "@/content/site";
import { campaignsApi } from "@/lib/api/endpoints";
import type { CampaignResponse, CampaignStatus } from "@/lib/api/types";
import {
  CAMPAIGN_STEPS,
  type CampaignDisplayStatus,
  getCampaignDisplayStatus,
  getCampaignStatusMeta,
  getCampaignTimeCue,
  isAwaitingAdmin,
} from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import {
  formatDate,
  formatDateRange,
  formatDateRangeLong,
  formatDateTime,
  formatNumber,
  formatRelative,
  formatTime,
  formatTimeRange,
  formatTND,
  todayISO,
} from "@/lib/format";
import { invalidate, resourceKeys } from "@/lib/resource-cache";
import { routes } from "@/lib/routes";
import { useResource } from "@/lib/use-resource";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function capitalize(s: string): string {
  return s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}` : s;
}

/** mailto: TPUB with a prefilled subject/body (no upload or messaging endpoint exists). */
export function tpubMailto(subject: string, body: string): string {
  return `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** « 2 créneaux bloqués du mer. 14 oct. au mar. 20 oct. 2026 seront libérés. Action définitive. » */
export function deleteDescription(
  campaign: Pick<CampaignResponse, "startDate" | "endDate">,
  activeCount: number,
): string {
  if (activeCount === 0)
    return "Aucun créneau n'est bloqué pour cette campagne. Action définitive.";
  const range = formatDateRangeLong(campaign.startDate, campaign.endDate, {
    weekday: "short",
    withDuration: false,
  });
  const what =
    activeCount === 1 ? "1 créneau bloqué" : `${formatNumber(activeCount)} créneaux bloqués`;
  const verb = activeCount === 1 ? "sera libéré" : "seront libérés";
  return `${what}${range ? ` ${range}` : ""} ${verb}. Action définitive.`;
}

type StepState = "done" | "current" | "live" | "upcoming" | "failed";

interface CampaignStepView {
  label: string;
  description: string;
  state: StepState;
}

const STEP_DESCRIPTIONS = [
  "Modifiable jusqu'à l'envoi",
  "Contrôle automatique du contenu",
  "Examen par l'équipe TPUB",
  "Sur les créneaux réservés",
] as const;

/**
 * Stepper truth (UX-PLAN §6.4): a validated campaign whose start date is in the future shows
 * « Validation TPUB ✓ » and a Diffusion step « Dans 5 jours » that is NOT current; ACTIVE in its
 * window marks Diffusion current (live).
 */
export function campaignStepViews(
  campaign: Pick<CampaignResponse, "status" | "startDate" | "endDate">,
  today: string = todayISO(),
  now: Date = new Date(),
): CampaignStepView[] {
  const display = getCampaignDisplayStatus(campaign, today);
  const states: StepState[] = (() => {
    switch (display) {
      case "BROUILLON":
        return ["current", "upcoming", "upcoming", "upcoming"];
      case "PENDING_AI_CHECK":
        return ["done", "current", "upcoming", "upcoming"];
      case "REJECTED_BY_AI":
        return ["done", "failed", "upcoming", "upcoming"];
      case "APPROVED_BY_AI":
      case "REVIEW_REQUIRED":
        return ["done", "done", "current", "upcoming"];
      case "BLOCKED":
        return ["done", "done", "failed", "upcoming"];
      case "SCHEDULED":
        return ["done", "done", "done", "upcoming"];
      case "VALIDATED_BY_ADMIN":
        return campaign.startDate && campaign.startDate > today
          ? ["done", "done", "done", "upcoming"]
          : ["done", "done", "done", "live"];
      case "ACTIVE":
        return ["done", "done", "done", "live"];
      case "TERMINATED":
      case "ENDED":
        return ["done", "done", "done", "done"];
    }
  })();

  return CAMPAIGN_STEPS.map((label, i) => {
    let description: string = STEP_DESCRIPTIONS[i] ?? "";
    if (i === 3) {
      if (states[3] === "upcoming" && states[2] === "done" && campaign.startDate) {
        description = capitalize(formatRelative(campaign.startDate, now));
      } else if (states[3] === "live") {
        description = campaign.endDate
          ? `En cours jusqu'au ${formatDate(campaign.endDate, "medium")}`
          : "En cours";
      } else if (states[3] === "done" && campaign.endDate) {
        description = `Terminée le ${formatDate(campaign.endDate, "medium")}`;
      }
    }
    return { label, description, state: states[i] as StepState };
  });
}

const STEP_SR: Record<StepState, string> = {
  done: "Terminée",
  current: "En cours",
  live: "En cours",
  upcoming: "À venir",
  failed: "Interrompue",
};

function CampaignStepper({ steps }: { steps: readonly CampaignStepView[] }) {
  return (
    <ol aria-label="Étapes de la campagne" className="flex w-full items-start">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        const active = step.state === "current" || step.state === "live";
        return (
          <li
            key={step.label}
            aria-current={active ? "step" : undefined}
            className="relative flex flex-1 flex-col items-center text-center"
          >
            {!last ? (
              <span
                aria-hidden="true"
                className={cx(
                  "absolute top-[15px] left-[calc(50%+22px)] h-px w-[calc(100%-44px)]",
                  step.state === "done" ? "bg-brand-blue-text/60" : "bg-line-strong",
                )}
              />
            ) : null}
            <span
              aria-hidden="true"
              className={cx(
                "relative z-[1] inline-flex size-[31px] shrink-0 items-center justify-center rounded-full border font-label text-[0.8125rem] font-semibold",
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
            <span className="mt-2.5 px-1">
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
              <span className="mt-0.5 hidden text-[0.8125rem] leading-snug text-muted sm:block">
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
  /** PENDING_AI_CHECK polled for 2 minutes, then stopped. */
  pendingWindowOver: boolean;
}

function pollingNote(status: CampaignStatus, pendingWindowOver: boolean): string | null {
  if (status === "PENDING_AI_CHECK") {
    return pendingWindowOver
      ? "Actualisation automatique arrêtée : utilisez « Actualiser » pour vérifier le résultat."
      : "Actualisation automatique toutes les 10 secondes pendant 2 minutes.";
  }
  if (isAwaitingAdmin(status)) {
    return "Actualisation automatique chaque minute tant que cette page est ouverte.";
  }
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

/** True when every significant word of `hint` already appears in `sentence` (accent/case-insensitive). */
export function sentenceCovers(sentence: string, hint: string): boolean {
  const words = new Set(significantWords(sentence));
  const needed = significantWords(hint);
  return needed.length > 0 && needed.every((w) => words.has(w));
}

function StatusCard({
  campaign,
  today,
  activeCount,
  freshness,
}: {
  campaign: CampaignResponse;
  today: string;
  activeCount: number;
  freshness: Freshness;
}) {
  const meta = getCampaignStatusMeta(campaign, { audience: "annonceur", today });
  const cue = getCampaignTimeCue(campaign, today);
  const steps = useMemo(() => campaignStepViews(campaign, today), [campaign, today]);
  const note = pollingNote(campaign.status, freshness.pendingWindowOver);
  const draftNext =
    campaign.status === "BROUILLON"
      ? activeCount === 0
        ? "Prochaine étape : réservez au moins un Porteur, puis soumettez la campagne."
        : "Prochaine étape : vérifiez la campagne puis soumettez-la à la modération."
      : null;

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
            // The sentence below usually says it already (« Vous pouvez tout modifier. »,
            // « L'analyse est favorable. »): the pill hint only shows when it adds something.
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
        </div>
        <p className="max-w-[72ch] text-[0.9375rem] leading-relaxed text-ink-soft">
          {meta.description}
          {isAwaitingAdmin(campaign.status) && !meta.description.includes(REVIEW_WAIT_SENTENCE)
            ? ` ${REVIEW_WAIT_SENTENCE}`
            : ""}
        </p>
        {isAwaitingAdmin(campaign.status) ? (
          <p className="text-[0.8125rem] leading-relaxed text-muted">
            Rien n&apos;est diffusé sans la validation de l&apos;équipe TPUB ; vos créneaux sont
            alors confirmés.
          </p>
        ) : null}
        {draftNext ? (
          <p className="text-[0.8125rem] leading-relaxed text-muted">{draftNext}</p>
        ) : null}
        {note ? (
          <p className="text-[0.8125rem] leading-relaxed text-muted" data-testid="polling-note">
            {note}
          </p>
        ) : null}
      </div>

      <div className="mt-6 border-t border-line pt-6">
        <CampaignStepper steps={steps} />
      </div>
    </SectionCard>
  );
}

function NextStepCard({
  campaign,
  display,
  today,
  onDuplicate,
}: {
  campaign: CampaignResponse;
  display: CampaignDisplayStatus;
  today: string;
  onDuplicate: () => void;
}) {
  const reference = campaignReference(campaign.id);
  const period = formatDateRangeLong(campaign.startDate, campaign.endDate, { withDuration: false });

  if (
    (display === "SCHEDULED" || display === "VALIDATED_BY_ADMIN") &&
    campaign.startDate &&
    campaign.startDate > today
  ) {
    const href = tpubMailto(
      `Visuel de la campagne ${reference} — ${campaign.name}`,
      `Bonjour,\n\nVous trouverez ci-joint le visuel de la campagne « ${campaign.name} » (${reference})${period ? `, diffusée ${period}` : ""}.\n\nCordialement`,
    );
    return (
      <SectionCard
        id="prochaine-etape"
        icon={Flag}
        title="Prochaine étape"
        description={`Envoyez votre visuel à TPUB avant le ${formatDate(campaign.startDate, "long")}.`}
      >
        <p className="max-w-[72ch] text-[0.875rem] leading-relaxed text-muted">
          Le dépôt de fichiers en ligne n&apos;est pas encore disponible : joignez le visuel à un
          e-mail en rappelant la référence {reference}. L&apos;équipe TPUB répond en jours ouvrés (
          {SUPPORT_HOURS}).
        </p>
        <Button asChild variant="primary" className="mt-4">
          <a href={href}>
            <Mail aria-hidden="true" />
            Envoyer le visuel par e-mail
          </a>
        </Button>
      </SectionCard>
    );
  }

  if (display === "BLOCKED") {
    const href = tpubMailto(
      `Motif du refus — ${reference}`,
      `Bonjour,\n\nPouvez-vous m'indiquer le motif du refus de la campagne « ${campaign.name} » (${reference}) ?\n\nCordialement`,
    );
    return (
      <SectionCard
        id="prochaine-etape"
        icon={Flag}
        title="Prochaine étape"
        description="Contactez TPUB pour connaître le motif du refus."
      >
        <p className="max-w-[72ch] text-[0.875rem] leading-relaxed text-muted">
          Cette campagne ne sera pas diffusée et ses créneaux ont été libérés. Vous pouvez la
          dupliquer pour préparer une nouvelle version.
        </p>
        <Button asChild variant="secondary" className="mt-4">
          <a href={href}>
            <Mail aria-hidden="true" />
            Contacter TPUB
          </a>
        </Button>
      </SectionCard>
    );
  }

  if (display === "REJECTED_BY_AI") {
    return (
      <SectionCard
        id="prochaine-etape"
        icon={Flag}
        title="Prochaine étape"
        description="Dupliquez la campagne pour la corriger."
      >
        <p className="max-w-[72ch] text-[0.875rem] leading-relaxed text-muted">
          Une campagne à corriger ne peut pas être soumise à nouveau. La copie reprend ses
          informations : corrigez-la selon les recommandations du rapport IA, puis soumettez-la.
        </p>
        <Button
          variant="secondary"
          className="mt-4"
          iconLeft={<CopyPlus aria-hidden="true" />}
          onClick={onDuplicate}
        >
          Dupliquer et corriger
        </Button>
      </SectionCard>
    );
  }

  return null;
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
      description="Analyse automatique de conformité, de risque et de qualité."
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
                ? "Le résultat n'est pas encore disponible. Actualisez la page dans quelques minutes, ou relancez l'analyse."
                : "Le résultat s'affiche ici dès qu'il est prêt (actualisation automatique pendant 2 minutes)."
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
            description="L'analyse IA démarre à la soumission de la campagne."
          />
        )
      ) : (
        <ErrorState scope="section" error={ai.error} title="Rapport IA indisponible" />
      )}
    </SectionCard>
  );
}

function PreviewCard({
  campaign,
  display,
  location,
}: {
  campaign: CampaignResponse;
  display: CampaignDisplayStatus;
  location?: string;
}) {
  const creative = useLocalCreative(campaign.id);
  const [orientation, setOrientation] = useState<ScreenOrientation>("landscape");
  // A refused or finished campaign will not air: no point previewing a new visual for it.
  const canPreviewNew = display !== "BLOCKED" && display !== "TERMINATED" && display !== "ENDED";
  return (
    <SectionCard
      id="apercu"
      icon={MonitorPlay}
      title="Aperçu à l'écran"
      description="Prévisualisation locale du visuel."
    >
      <div className="mb-5 flex justify-center">
        <OrientationToggle value={orientation} onChange={setOrientation} />
      </div>
      <ScreenMockup
        creative={creative}
        orientation={orientation}
        campaignName={campaign.name}
        objective={campaign.objective}
        location={location}
      />
      {canPreviewNew ? (
        <div className="mt-5">
          <CreativeDropzone campaignId={campaign.id} compact />
          <p className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
            Rien n&apos;est envoyé depuis cette page : le fichier reste sur cet appareil. Le dépôt
            en ligne n&apos;est pas encore disponible.
          </p>
        </div>
      ) : null}
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
  const { campaign, reservations, ai, lookups } = data;
  const [today] = useState(() => todayISO());

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const flow = useSubmitFlow(() => reload());

  useDocumentTitle(campaign.name);

  const joined = useMemo(() => joinReservations(reservations, lookups), [reservations, lookups]);
  const active: JoinedReservation[] = activeReservations(joined);
  const actions = getCampaignActions(campaign.status, { reservationCount: active.length });
  const display = getCampaignDisplayStatus(campaign, today);
  const flowActive = flow.state.phase !== "idle";
  const busy = flow.state.phase === "submitting" || flow.state.phase === "analysing";
  const firstLocation = active[0]?.zoneName;
  const isDraft = campaign.status === "BROUILLON";
  const hasTemporary = joined.some((r) => r.reservationStatus === "TEMPORAIRE");

  const remove = async () => {
    await campaignsApi.remove(campaign.id);
    clearLocalCreative(campaign.id);
    invalidate(resourceKeys.campaignsMine);
    invalidate(resourceKeys.reservationsByCampaign(campaign.id));
    toast({
      title: "Campagne supprimée",
      description:
        active.length > 0
          ? "Ses créneaux bloqués ont été libérés."
          : "Elle n'apparaît plus dans vos campagnes.",
      variant: "success",
    });
    router.push(routes.espace.campaigns());
  };

  // Header actions (UX-PLAN §12.A2.2): one primary, secondary, overflow with delete last.
  const primaryAction = isDraft ? (
    <Button asChild variant="primary">
      <Link
        href={routes.espace.wizard(campaign.id, active.length > 0 ? "verification" : "porteurs")}
      >
        Finaliser
        <ArrowRight aria-hidden="true" />
      </Link>
    </Button>
  ) : actions.duplicate ? (
    <Button
      variant="primary"
      iconLeft={<CopyPlus aria-hidden="true" />}
      onClick={() => setDuplicateOpen(true)}
      disabled={busy}
    >
      Dupliquer et corriger
    </Button>
  ) : undefined;

  const secondaryActions: MenuAction[] | undefined = isDraft
    ? [
        {
          label: "Modifier les détails",
          href: routes.espace.wizard(campaign.id, "details"),
          icon: <PencilLine aria-hidden="true" />,
        },
      ]
    : undefined;

  const overflow: MenuAction[] = [];
  if (isDraft) {
    overflow.push({
      label: "Dupliquer",
      onSelect: () => setDuplicateOpen(true),
      icon: <CopyPlus aria-hidden="true" />,
      disabled: busy,
    });
  } else if (actions.edit) {
    overflow.push({
      label: "Modifier les informations",
      href: routes.espace.campaignEdit(campaign.id),
      icon: <PencilLine aria-hidden="true" />,
    });
  }
  if (actions.remove) {
    overflow.push({
      label: "Supprimer",
      tone: "danger",
      onSelect: () => setDeleteOpen(true),
      icon: <Trash2 aria-hidden="true" />,
      disabled: busy,
    });
  }

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
        secondaryActions={secondaryActions}
        overflowActions={overflow.length > 0 ? overflow : undefined}
        overflowLabel="Plus d'actions"
      />

      <div className="flex flex-col gap-6">
        <StatusCard
          campaign={campaign}
          today={today}
          activeCount={active.length}
          freshness={freshness}
        />

        <NextStepCard
          campaign={campaign}
          display={display}
          today={today}
          onDuplicate={() => setDuplicateOpen(true)}
        />

        {/* Relaunched AI check */}
        {flow.state.phase === "done" ? (
          <AiResultPanel
            headingAs="h2"
            report={flow.state.report}
            actions={
              flow.state.report.aiStatus === "REJECTED" ? (
                <Button
                  variant="primary"
                  iconLeft={<CopyPlus aria-hidden="true" />}
                  onClick={() => setDuplicateOpen(true)}
                >
                  Dupliquer et corriger
                </Button>
              ) : null
            }
          />
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
                    label: "Budget déclaré",
                    value: <span className="tabular">{formatTND(campaign.budget)}</span>,
                  },
                  {
                    label: "Période",
                    value: (
                      <span className="tabular">
                        {formatDateRange(campaign.startDate, campaign.endDate, "medium")}
                      </span>
                    ),
                  },
                  {
                    label: "Plage horaire",
                    value: (
                      <span className="tabular">
                        {formatTimeRange(campaign.startTime, campaign.endTime)}
                      </span>
                    ),
                  },
                  // Same medium format as « Soumise le », the créneaux and the lists.
                  { label: "Créée le", value: formatDate(campaign.createdAt, "medium") },
                  {
                    label: "Soumise le",
                    value: campaign.submittedAt
                      ? formatDateTime(campaign.submittedAt)
                      : "Pas encore soumise",
                  },
                  {
                    label: "Validée le",
                    value: campaign.validatedAt ? formatDateTime(campaign.validatedAt) : "—",
                  },
                  {
                    label: "Objectif",
                    value: campaign.objective?.trim() || "Non renseigné",
                    wide: true,
                  },
                ]}
              />
            </SectionCard>

            <SectionCard
              id="creneaux"
              icon={MonitorPlay}
              title="Créneaux réservés"
              description="Porteurs bloqués pour la période de la campagne."
              aside={
                <>
                  {actions.resume && joined.length > 0 ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={routes.espace.wizard(campaign.id, "porteurs")}>
                        Ajouter des Porteurs
                      </Link>
                    </Button>
                  ) : null}
                  {joined.length > 0 ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={routes.espace.reservations({ campagne: campaign.id })}>
                        Tout voir dans Réservations
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : null}
                </>
              }
            >
              {joined.length > 0 ? (
                <>
                  <ReservationList reservations={joined} longStatus />
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
                  title="Aucun créneau réservé"
                  description={
                    actions.resume
                      ? "Choisissez des Porteurs : les dates et heures de la campagne s'appliquent."
                      : "Aucun Porteur n'est rattaché à cette campagne."
                  }
                  action={
                    actions.resume ? (
                      <Button asChild variant="secondary" size="sm">
                        <Link href={routes.espace.wizard(campaign.id, "porteurs")}>
                          Choisir des Porteurs
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
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <PreviewCard campaign={campaign} display={display} location={firstLocation} />
            <EstimateInvoice campaign={campaign} reservations={joined} />
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
      <DuplicateCampaignDialog
        campaign={
          flow.state.phase === "done" && flow.state.report.aiStatus === "REJECTED"
            ? { ...campaign, status: "REJECTED_BY_AI" }
            : campaign
        }
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

/**
 * Polling window for PENDING_AI_CHECK: starts when the page first shows the status and ends
 * after 2 minutes (UX-PLAN §6.3). Returns true once the window is over.
 */
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

/** /espace/campagnes/[id] — only for ids found in /campaigns/mine. */
export function CampaignDetail({ idParam }: { idParam: string }) {
  const id = parseCampaignId(idParam);
  const [status, setStatus] = useState<CampaignStatus | null>(null);
  const pendingWindowOver = usePendingWindow(status, id);

  const { data, error, loading, reload, slow, lastUpdatedAt, revalidating } = useResource(
    id === null ? null : `campaign-detail-${id}`,
    (signal) => loadCampaignDetail(id, signal),
    {
      pollInterval: status ? pollIntervalFor(status, { pendingWindowOver }) : null,
    },
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
