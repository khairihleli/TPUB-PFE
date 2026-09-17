"use client";

import {
  ArrowLeft,
  ArrowRight,
  CalendarRange,
  Check,
  CircleCheck,
  CircleX,
  ClipboardCopy,
  FileClock,
  Gauge,
  ImageIcon,
  MapPinned,
  ScanSearch,
  ShieldOff,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { FactList, IdChip } from "@/components/admin/admin-ui";
import {
  BLOCK_DIFFUSION_TEXT,
  DECISION_FINAL_TEXT,
  OVERRIDE_ACK,
  OVERRIDE_TEXT,
  OVERRIDE_TITLE,
  REJECT_REASON_HINT,
  REJECT_REASON_MAX,
} from "@/components/admin/decision-dialogs";
import {
  advertiserName,
  applyReasonPreset,
  campaignReference,
  canAdminReject,
  canDecide,
  canEditPriority,
  canRunAiCheck,
  COMMENT_MAX,
  parsePriority,
  REJECT_REASON_PRESETS,
  refusalMessage,
  rejectBlocksDiffusion,
  rejectReasonError,
  validationBody,
  validationNeedsOverride,
} from "@/components/admin/moderation-model";
import { useShortcut } from "@/components/shell/shortcuts";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { EstimateTag } from "@/components/ui/estimate-tag";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Kbd } from "@/components/ui/kbd";
import { ScoreMeter } from "@/components/ui/score-meter";
import { LoadingRegion, Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { NetworkMap } from "@/components/map";
import { ESTIMATE_COST_RULE, ESTIMATE_VIEWS_RULE } from "@/content/glossary";
import {
  adminApi,
  aiApi,
  campaignsApi,
  estimatesApi,
  mediaApi,
  reservationsApi,
  supportsApi,
} from "@/lib/api/endpoints";
import { isNoAiReportError, presentError } from "@/lib/api/errors";
import type {
  AiIssue,
  AiReport,
  CampaignResponse,
  MediaFileResponse,
  SupportResponse,
  ZoneResponse,
} from "@/lib/api/types";
import {
  AI_CONTENT_TYPE_LABEL,
  AI_ENGINE_LABEL,
  AI_ISSUE_SOURCE_LABEL,
  AI_SECTOR_LABEL,
  AI_SEVERITY,
  aiDecisionMeta,
  CLIENT_VALIDATION_STATUS,
  MEDIA_TYPE_LABEL,
  OCR_ENGINE_LABEL,
  TERMINATION_REASON_LABEL,
} from "@/lib/campaign-status";
import {
  formatDate,
  formatDateRange,
  formatDateTime,
  formatNumber,
  formatTND,
  formatTimeRange,
} from "@/lib/format";
import { fetchCached, resourceKeys } from "@/lib/resource-cache";
import { routes } from "@/lib/routes";
import { useResource } from "@/lib/use-resource";

const SHORTCUT_SECTION = "Examen de modération";

async function loadReport(id: number, signal: AbortSignal): Promise<AiReport | null> {
  try {
    return await aiApi.report(id, { signal });
  } catch (e) {
    if (isNoAiReportError(e)) return null;
    throw e;
  }
}

async function loadPlan(id: number, signal: AbortSignal) {
  const [reservations, estimate, supports] = await Promise.all([
    reservationsApi.byCampaign(id, { signal }),
    estimatesApi.campaign(id, { signal }).catch(() => null),
    fetchCached(resourceKeys.supportsAll, (s) => supportsApi.all({ signal: s }), { signal }).catch(
      () => [] as SupportResponse[],
    ),
  ]);
  return { reservations, estimate, supports };
}

export type ReviewDecision =
  | { kind: "validated"; campaign: CampaignResponse }
  | { kind: "rejected"; campaign: CampaignResponse; reason: string };

export interface ReviewNavigation {
  /** 0-based position in the current list (-1 when the campaign is not in it). */
  index: number;
  total: number;
  /** « À traiter », « Toutes »… */
  listLabel: string;
  /** Campaigns still awaiting a decision, the current one excluded. */
  remaining: number;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  /** Next campaign awaiting a decision (after a refusal: « Campagne suivante »). */
  onNextDecidable: (() => void) | null;
}

export interface ReviewNotice {
  tone: "success" | "warning";
  title: string;
  text?: string;
}

export interface CampaignReviewDialogProps {
  campaign: CampaignResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ADMINISTRATEUR only. */
  canAct: boolean;
  /** The campaign changed (validated, rejected, analysed, priority): update the list. */
  onCampaignChange: (updated: CampaignResponse) => void;
  /** Called after a successful decision (the view moves to the next campaign). */
  onDecided?: (decision: ReviewDecision) => void;
  navigation?: ReviewNavigation | null;
  /** Result of the previous decision, shown at the top (« « X » validée »). */
  notice?: ReviewNotice | null;
}

/** Campaign file for the moderator: facts, media, AI report, zones, reservations, history. */
export function CampaignReviewDialog({
  campaign,
  open,
  onOpenChange,
  canAct,
  onCampaignChange,
  onDecided,
  navigation = null,
  notice = null,
}: CampaignReviewDialogProps) {
  // Escape reaches both Radix and the « Esc » shortcut: close once.
  const closingRef = useRef(false);
  useEffect(() => {
    if (open) closingRef.current = false;
  }, [open, campaign?.id]);
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onOpenChange(false);
  }, [onOpenChange]);

  if (!campaign) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else requestClose();
      }}
    >
      {open ? (
        <ReviewContent
          key={campaign.id}
          campaign={campaign}
          canAct={canAct}
          onClose={requestClose}
          onCampaignChange={onCampaignChange}
          onDecided={onDecided}
          navigation={navigation}
          notice={notice}
        />
      ) : null}
    </Dialog>
  );
}

type Mode = "idle" | "validating" | "rejecting";

function ReviewContent({
  campaign,
  canAct,
  onClose,
  onCampaignChange,
  onDecided,
  navigation,
  notice,
}: {
  campaign: CampaignResponse;
  canAct: boolean;
  onClose: () => void;
  onCampaignChange: (updated: CampaignResponse) => void;
  onDecided?: (decision: ReviewDecision) => void;
  navigation: ReviewNavigation | null;
  notice: ReviewNotice | null;
}) {
  const { toast } = useToast();
  const uid = useId().replace(/:/g, "");
  const report = useResource(`admin:report:${campaign.id}:${campaign.status}`, (signal) =>
    loadReport(campaign.id, signal),
  );
  const plan = useResource(`admin:plan:${campaign.id}:${campaign.status}`, (signal) =>
    loadPlan(campaign.id, signal),
  );
  const media = useResource(`admin:media:${campaign.id}`, (signal) =>
    mediaApi.list(campaign.id, { signal }),
  );
  const history = useResource(`admin:decisions:${campaign.id}:${campaign.status}`, (signal) =>
    aiApi.decisions({ campaignId: campaign.id, size: 20, sort: "createdAt,desc", signal }),
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // ---- decision state ------------------------------------------------------------------
  const [mode, setMode] = useState<Mode>("idle");
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [priority, setPriority] = useState("");
  const [override, setOverride] = useState(false);
  const [pending, setPending] = useState<"validate" | "reject" | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<{ reason: string } | null>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const overrideRef = useRef<HTMLInputElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  const decidable = canAct && canDecide(campaign.status) && !rejected;
  const blockable = canAct && canAdminReject(campaign.status) && !rejected;
  const blocksDiffusion = rejectBlocksDiffusion(campaign.status);
  const needsOverride = validationNeedsOverride(campaign.status);
  const reasonError = rejectReasonError(reason);

  const runAnalysis = async () => {
    if (analyzing) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const r = await aiApi.checkContent(campaign.id);
      report.setData(r);
      const updated = await campaignsApi.get(campaign.id);
      onCampaignChange(updated);
      history.reload();
      toast({ title: "Analyse IA relancée", variant: "success" });
    } catch (e) {
      setAnalyzeError(presentError(e).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const startValidate = () => {
    if (!decidable || pending) return;
    setMode("validating");
    setDecisionError(null);
    window.requestAnimationFrame(() =>
      (needsOverride ? overrideRef.current : commentRef.current)?.focus(),
    );
  };

  const validate = async () => {
    if (!decidable || pending) return;
    const check = validationBody(campaign, { comment, priority, override });
    if (!check.ok) {
      if (check.field === "override") {
        setOverrideError(check.message);
        overrideRef.current?.focus();
      } else {
        setDecisionError(check.message);
      }
      return;
    }
    setPending("validate");
    setDecisionError(null);
    try {
      const updated = await adminApi.validate(campaign.id, check.body);
      onCampaignChange(updated);
      toast({
        title: `« ${campaign.name} » validée${needsOverride ? " par dérogation" : ""}`,
        description:
          updated.status === "ACTIVE"
            ? "Réservations confirmées : la campagne est en diffusion."
            : updated.startDate
              ? `Réservations confirmées, diffusion à partir du ${formatDate(updated.startDate)}.`
              : "Réservations confirmées.",
        variant: needsOverride ? "warning" : "success",
      });
      setPending(null);
      setMode("idle");
      onDecided?.({ kind: "validated", campaign: updated });
    } catch (e) {
      setPending(null);
      setDecisionError(presentError(e).message);
    }
  };

  const startReject = () => {
    if (!blockable || pending) return;
    setMode("rejecting");
    setDecisionError(null);
    window.requestAnimationFrame(() => reasonRef.current?.focus());
  };

  const reject = async () => {
    if (!blockable || pending) return;
    if (reasonError) {
      reasonRef.current?.focus();
      return;
    }
    const trimmed = reason.trim();
    setPending("reject");
    setDecisionError(null);
    try {
      const updated = await adminApi.reject(campaign.id, trimmed);
      setRejected({ reason: trimmed });
      setPending(null);
      setMode("idle");
      onCampaignChange(updated);
      onDecided?.({ kind: "rejected", campaign: updated, reason: trimmed });
    } catch (e) {
      setPending(null);
      setDecisionError(presentError(e).message);
    }
  };

  const copyMessage = async () => {
    if (!rejected) return;
    try {
      await navigator.clipboard.writeText(refusalMessage(campaign, rejected.reason));
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  };

  // ---- keyboard (J / K / V / R / Esc) -----------------------------------------------------
  const shortcutOpts = { section: SHORTCUT_SECTION, allowInDialog: true } as const;
  useShortcut("j", () => navigation?.onNext?.(), {
    ...shortcutOpts,
    description: "Campagne suivante",
    when: () => Boolean(navigation?.onNext) && pending === null && mode === "idle",
  });
  useShortcut("k", () => navigation?.onPrevious?.(), {
    ...shortcutOpts,
    description: "Campagne précédente",
    when: () => Boolean(navigation?.onPrevious) && pending === null && mode === "idle",
  });
  useShortcut("v", startValidate, {
    ...shortcutOpts,
    description: "Valider",
    enabled: canAct,
    when: () => decidable && mode === "idle",
  });
  useShortcut("r", startReject, {
    ...shortcutOpts,
    description: "Refuser",
    enabled: canAct,
    when: () => blockable && mode === "idle",
  });
  useShortcut("escape", onClose, {
    ...shortcutOpts,
    description: "Fermer l'examen",
    when: () => pending === null,
  });

  const submitted = campaign.submittedAt
    ? `Soumise le ${formatDateTime(campaign.submittedAt)}`
    : `Créée le ${formatDateTime(campaign.createdAt)}`;
  const clientStatus = campaign.clientValidationStatus ?? null;

  const footer = rejected ? (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
      <Button variant="ghost" onClick={onClose} className="sm:mr-auto">
        Fermer
      </Button>
      {navigation?.onNextDecidable ? (
        <Button
          variant="primary"
          iconRight={<ArrowRight aria-hidden="true" />}
          onClick={navigation.onNextDecidable}
        >
          Campagne suivante · {navigation.remaining} restante{navigation.remaining > 1 ? "s" : ""}
        </Button>
      ) : (
        <Button variant="primary" onClick={onClose}>
          File traitée · Fermer
        </Button>
      )}
    </div>
  ) : mode === "rejecting" ? (
    <div className="flex w-full flex-col gap-3">
      {decisionError ? <Alert tone="danger">{decisionError}</Alert> : null}
      {blocksDiffusion ? (
        <Alert tone="warning" live="none">
          {BLOCK_DIFFUSION_TEXT}
        </Alert>
      ) : null}
      <Field
        label={blocksDiffusion ? "Motif du blocage" : "Motif du refus"}
        required
        hint={REJECT_REASON_HINT}
        id={`${uid}-motif`}
        error={reason.length > 0 ? reasonError : null}
      >
        <Textarea
          ref={reasonRef}
          value={reason}
          maxLength={REJECT_REASON_MAX}
          rows={3}
          placeholder="Ex. : allégation « gratuit » non justifiée dans l'objectif."
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Motifs fréquents" className="flex flex-wrap gap-1.5">
          {REJECT_REASON_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setReason((r) => applyReasonPreset(r, preset, REJECT_REASON_MAX));
                reasonRef.current?.focus();
              }}
              className="inline-flex min-h-9 items-center rounded-full border border-line-strong px-3 text-[0.8125rem] text-ink-soft transition-colors hover:border-muted-2 hover:bg-overlay-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-text"
            >
              {preset}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-2 tabular" aria-hidden="true">
          {reason.length}/{REJECT_REASON_MAX}
        </p>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="ghost"
          disabled={pending !== null}
          onClick={() => {
            setMode("idle");
            setReason("");
            setDecisionError(null);
          }}
        >
          {blocksDiffusion ? "Annuler le blocage" : "Annuler le refus"}
        </Button>
        <Button
          variant="danger"
          loading={pending === "reject"}
          loadingLabel={blocksDiffusion ? "Blocage en cours" : "Refus en cours"}
          iconLeft={
            blocksDiffusion ? <ShieldOff aria-hidden="true" /> : <CircleX aria-hidden="true" />
          }
          disabledReason={reasonError}
          onDisabledClick={() => reasonRef.current?.focus()}
          onClick={() => void reject()}
        >
          {blocksDiffusion ? "Bloquer la diffusion" : "Refuser la campagne"}
        </Button>
      </div>
    </div>
  ) : mode === "validating" ? (
    <div className="flex w-full flex-col gap-3">
      {decisionError ? <Alert tone="danger">{decisionError}</Alert> : null}
      {needsOverride ? (
        <Alert tone="warning" title={OVERRIDE_TITLE} live="none">
          {OVERRIDE_TEXT}
          <Checkbox
            ref={overrideRef}
            className="mt-2"
            label={OVERRIDE_ACK}
            checked={override}
            error={overrideError}
            onChange={(e) => {
              setOverride(e.target.checked);
              setOverrideError(null);
            }}
          />
        </Alert>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <Field
          label="Commentaire (optionnel)"
          hint={`Enregistré avec la décision. ${COMMENT_MAX} caractères maximum.`}
          id={`${uid}-commentaire`}
        >
          <Textarea
            ref={commentRef}
            rows={2}
            className="min-h-16"
            maxLength={COMMENT_MAX}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </Field>
        <Field
          label="Priorité (0–10)"
          hint={`Actuelle : ${formatNumber(campaign.priorityScore)}`}
          id={`${uid}-priorite`}
          error={
            priority.trim() !== "" && Number.isNaN(parsePriority(priority))
              ? "Entier de 0 à 10."
              : null
          }
        >
          <Input
            inputMode="numeric"
            value={priority}
            placeholder={String(campaign.priorityScore)}
            onChange={(e) => setPriority(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="ghost"
          disabled={pending !== null}
          onClick={() => {
            setMode("idle");
            setDecisionError(null);
          }}
        >
          Annuler
        </Button>
        <Button
          variant="primary"
          iconLeft={<CircleCheck aria-hidden="true" />}
          loading={pending === "validate"}
          loadingLabel="Validation en cours"
          disabledReason={
            needsOverride && !override ? "Cochez d'abord la dérogation à l'avis de l'IA." : null
          }
          onDisabledClick={() => overrideRef.current?.focus()}
          onClick={() => void validate()}
        >
          {needsOverride ? "Valider par dérogation" : "Confirmer la validation"}
        </Button>
      </div>
    </div>
  ) : decidable || blockable ? (
    <div className="flex w-full flex-col gap-3">
      {decisionError ? <Alert tone="danger">{decisionError}</Alert> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="ghost" onClick={onClose} className="sm:mr-auto">
          Fermer
        </Button>
        {blockable ? (
          <Button
            variant={decidable ? "secondary" : "danger"}
            iconLeft={
              blocksDiffusion ? <ShieldOff aria-hidden="true" /> : <CircleX aria-hidden="true" />
            }
            onClick={startReject}
          >
            {blocksDiffusion ? "Bloquer la diffusion" : "Refuser"}
          </Button>
        ) : null}
        {decidable ? (
          <Button
            variant="primary"
            iconLeft={<CircleCheck aria-hidden="true" />}
            onClick={startValidate}
          >
            Valider…
          </Button>
        ) : null}
      </div>
      <ShortcutHint canDecide={decidable} />
    </div>
  ) : (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {!canAct && canDecide(campaign.status) ? (
          <p className="text-[0.8125rem] text-muted sm:mr-auto">
            Décision réservée aux administrateurs.
          </p>
        ) : null}
        <Button variant="secondary" onClick={onClose}>
          Fermer
        </Button>
      </div>
      {navigation && (navigation.onNext || navigation.onPrevious) ? (
        <ShortcutHint canDecide={false} />
      ) : null}
    </div>
  );

  return (
    <DialogContent
      size="lg"
      title={campaign.name}
      dirty={
        mode !== "idle" &&
        (reason.trim().length > 0 || comment.trim().length > 0) &&
        pending === null
      }
      onDiscard={() => {
        setReason("");
        setComment("");
        setMode("idle");
      }}
      preventOutsideClose={pending !== null}
      description={
        <span className="flex flex-col gap-1.5">
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <IdChip id={campaign.id} />
            <span className="font-label font-semibold text-ink-soft">
              {advertiserName(campaign)}
            </span>
            {clientStatus && clientStatus !== "VALIDATED" ? (
              <Badge tone={CLIENT_VALIDATION_STATUS[clientStatus].tone} size="sm">
                Annonceur : {CLIENT_VALIDATION_STATUS[clientStatus].label.toLowerCase()}
              </Badge>
            ) : null}
            <span aria-hidden="true">·</span>
            <span className="tabular">{campaignReference(campaign.id)}</span>
            <span aria-hidden="true">·</span>
            <span>{submitted}</span>
          </span>
          {navigation && navigation.index >= 0 ? (
            <span className="text-[0.8125rem]">
              Campagne {navigation.index + 1} sur {navigation.total} · {navigation.listLabel}
            </span>
          ) : null}
        </span>
      }
      footer={footer}
    >
      <div className="flex flex-col gap-7">
        {notice ? (
          <Alert tone={notice.tone} title={notice.title} live="status">
            {notice.text}
          </Alert>
        ) : null}

        {rejected ? (
          <Alert
            tone="success"
            title={blocksDiffusion ? "Diffusion bloquée" : "Campagne refusée"}
            live="status"
            action={
              <Button
                size="sm"
                variant="secondary"
                iconLeft={
                  copy === "copied" ? (
                    <Check aria-hidden="true" />
                  ) : (
                    <ClipboardCopy aria-hidden="true" />
                  )
                }
                onClick={() => void copyMessage()}
              >
                {copy === "copied" ? "Message copié" : "Copier un e-mail pour l'annonceur"}
              </Button>
            }
          >
            Ses réservations ont été annulées. Le motif s&apos;affiche dans l&apos;espace de
            l&apos;annonceur, qui peut corriger la campagne et la soumettre de nouveau.
            {copy === "failed" ? (
              <label className="mt-3 flex flex-col gap-1.5">
                <span className="text-[0.8125rem] text-muted">
                  Copie impossible sur ce navigateur : sélectionnez le texte.
                </span>
                <textarea
                  readOnly
                  rows={6}
                  value={refusalMessage(campaign, rejected.reason)}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded-control border border-line-strong bg-overlay-inset p-3 text-[0.8125rem] text-ink"
                />
              </label>
            ) : null}
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <StatusPill type="campaign" campaign={campaign} audience="staff" />
          {campaign.aiOverride ? (
            <Badge tone="warning" size="sm">
              Validée par dérogation à l&apos;IA
            </Badge>
          ) : null}
          {campaign.terminationReason ? (
            <Badge tone="muted" size="sm">
              {TERMINATION_REASON_LABEL[campaign.terminationReason]}
            </Badge>
          ) : null}
        </div>

        {campaign.rejectionReason ? (
          <Alert tone="info" title="Motif du dernier refus" live="none">
            <span className="whitespace-pre-line">{campaign.rejectionReason}</span>
          </Alert>
        ) : null}
        {campaign.adminComment ? (
          <Alert tone="info" title="Commentaire de validation" live="none">
            <span className="whitespace-pre-line">{campaign.adminComment}</span>
          </Alert>
        ) : null}

        <section aria-labelledby={`${uid}-faits`}>
          <h3 id={`${uid}-faits`} className="sr-only">
            Informations de la campagne
          </h3>
          <FactList
            items={[
              {
                label: "Objectif (texte analysé par l'IA)",
                value: campaign.objective?.trim() ? (
                  <span className="whitespace-pre-line">{campaign.objective}</span>
                ) : (
                  <span className="text-muted">Non renseigné</span>
                ),
                wide: true,
              },
              { label: "Annonceur", value: advertiserName(campaign) },
              {
                label: "Budget",
                value: (
                  <span className="tabular">
                    {formatTND(campaign.budget)}
                    <span className="block text-[0.8125rem] text-muted">
                      Consommé {formatTND(campaign.consumedBudget)}
                      {campaign.remainingBudget != null
                        ? ` · reste ${formatTND(campaign.remainingBudget)}`
                        : ""}
                    </span>
                  </span>
                ),
              },
              { label: "Période", value: formatDateRange(campaign.startDate, campaign.endDate) },
              {
                label: "Plage horaire",
                value: formatTimeRange(campaign.startTime, campaign.endTime),
              },
              {
                label: "Affichages estimés",
                value: (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span className="tabular">{formatNumber(campaign.estimatedViews)}</span>
                    <EstimateTag rule={ESTIMATE_VIEWS_RULE} />
                  </span>
                ),
              },
              {
                label: "Priorité de diffusion",
                value: `${formatNumber(campaign.priorityScore)} / 10`,
              },
            ]}
          />
        </section>

        {canAct &&
        canEditPriority(campaign.status) &&
        rejectBlocksDiffusion(campaign.status) &&
        !rejected ? (
          <PriorityEditor campaign={campaign} onChange={onCampaignChange} />
        ) : null}

        <ReviewSection icon={ImageIcon} title="Médias" id={`${uid}-medias`}>
          {media.data ? (
            <MediaPreview files={media.data} />
          ) : media.error ? (
            <ErrorState error={media.error} onRetry={media.reload} scope="section" />
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </ReviewSection>

        <section
          aria-labelledby={`${uid}-ia`}
          className="rounded-card border border-line bg-overlay-inset p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3
              id={`${uid}-ia`}
              className="flex items-center gap-2 font-display text-base font-semibold text-ink-strong"
            >
              <ScanSearch aria-hidden="true" className="size-4.5 text-brand-orange-text" />
              Rapport d&apos;analyse IA
            </h3>
            {canAct && canRunAiCheck(campaign.status) && !rejected ? (
              <Button
                variant="secondary"
                size="sm"
                loading={analyzing}
                loadingLabel="Analyse en cours"
                iconLeft={<Sparkles aria-hidden="true" />}
                onClick={() => void runAnalysis()}
              >
                {report.data ? "Relancer l'analyse IA" : "Lancer l'analyse IA"}
              </Button>
            ) : null}
          </div>
          {analyzeError ? (
            <Alert tone="danger" className="mt-3">
              {analyzeError}
            </Alert>
          ) : null}
          <div className="mt-4" aria-live="polite">
            {report.data ? (
              <AiReportBlock report={report.data} />
            ) : report.error ? (
              <ErrorState error={report.error} onRetry={report.reload} scope="section" />
            ) : report.loading ? (
              <LoadingRegion label="Chargement du rapport IA…" className="flex flex-col gap-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <SkeletonText lines={2} />
              </LoadingRegion>
            ) : (
              <p className="text-sm leading-relaxed text-muted">
                {analyzing
                  ? "Analyse en cours… cela peut prendre quelques secondes."
                  : "Aucune analyse pour cette campagne."}
              </p>
            )}
          </div>
        </section>

        <ReviewSection icon={MapPinned} title="Zones ciblées" id={`${uid}-zones`}>
          <ZonesBlock
            campaign={campaign}
            supports={plan.data?.supports ?? []}
            reservedIds={(plan.data?.reservations ?? [])
              .filter(
                (r) => r.reservationStatus === "TEMPORAIRE" || r.reservationStatus === "CONFIRMEE",
              )
              .map((r) => r.supportId)}
          />
        </ReviewSection>

        <ReviewSection icon={CalendarRange} title="Réservations et estimation" id={`${uid}-resa`}>
          {plan.data ? (
            <ReservationsBlock data={plan.data} />
          ) : plan.error ? (
            <ErrorState error={plan.error} onRetry={plan.reload} scope="section" />
          ) : (
            <LoadingRegion label="Chargement des réservations…" className="flex flex-col gap-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </LoadingRegion>
          )}
        </ReviewSection>

        <ReviewSection
          icon={FileClock}
          title="Historique des décisions"
          id={`${uid}-historique`}
          aside={
            <Link
              href={routes.admin.journal({ onglet: "decisions-ia", campagne: campaign.id })}
              className="text-[0.8125rem] text-brand-blue-text hover:underline"
            >
              Journal complet
            </Link>
          }
        >
          {history.data ? (
            history.data.items.length === 0 ? (
              <p className="text-sm text-muted">Aucune décision enregistrée.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {history.data.items.map((d) => {
                  const meta = aiDecisionMeta(d.decisionType, d.decision);
                  return (
                    <li
                      key={d.id}
                      className="flex flex-col gap-1 rounded-control border border-line bg-surface px-3.5 py-2.5 sm:flex-row sm:items-center sm:gap-3"
                    >
                      <span className="flex items-center gap-2">
                        <Badge tone={meta.tone} size="sm">
                          {meta.label}
                        </Badge>
                        {d.preview ? (
                          <Badge tone="muted" size="sm">
                            Pré-analyse
                          </Badge>
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 text-[0.8125rem] text-ink-soft">
                        {d.reason ?? "—"}
                        {d.decidedByName ? (
                          <span className="text-muted"> · {d.decidedByName}</span>
                        ) : null}
                      </span>
                      <span className="text-[0.75rem] whitespace-nowrap text-muted tabular">
                        Risque {formatNumber(d.riskScore)} · qualité {formatNumber(d.qualityScore)}
                        {" · "}
                        {formatDateTime(d.createdAt)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )
          ) : history.error ? (
            <ErrorState error={history.error} onRetry={history.reload} scope="section" />
          ) : (
            <Skeleton className="h-12 w-full" />
          )}
        </ReviewSection>

        {navigation && (navigation.onPrevious || navigation.onNext) ? (
          <nav aria-label="Parcourir la file" className="flex flex-wrap justify-between gap-2">
            <Button
              size="sm"
              variant="ghost"
              iconLeft={<ArrowLeft aria-hidden="true" />}
              disabled={!navigation.onPrevious}
              onClick={() => navigation.onPrevious?.()}
            >
              Précédente
            </Button>
            <Button
              size="sm"
              variant="ghost"
              iconRight={<ArrowRight aria-hidden="true" />}
              disabled={!navigation.onNext}
              onClick={() => navigation.onNext?.()}
            >
              Suivante
            </Button>
          </nav>
        ) : null}

        {decidable ? (
          <p className="-mt-3 text-[0.8125rem] text-muted">{DECISION_FINAL_TEXT}</p>
        ) : null}
      </div>
    </DialogContent>
  );
}

function ReviewSection({
  icon: Icon,
  title,
  id,
  aside,
  children,
}: {
  icon: typeof ImageIcon;
  title: string;
  id: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          id={id}
          className="flex items-center gap-2 font-display text-base font-semibold text-ink-strong"
        >
          <Icon aria-hidden="true" className="size-4.5 text-brand-orange-text" />
          {title}
        </h3>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PriorityEditor({
  campaign,
  onChange,
}: {
  campaign: CampaignResponse;
  onChange: (updated: CampaignResponse) => void;
}) {
  const { toast } = useToast();
  const [value, setValue] = useState(String(campaign.priorityScore));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parsePriority(value);
  const invalid = parsed === null || Number.isNaN(parsed);
  const save = async () => {
    if (invalid || saving || parsed === null) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await adminApi.setPriority(campaign.id, parsed);
      onChange(updated);
      toast({ title: `Priorité enregistrée : ${parsed} / 10`, variant: "success" });
    } catch (e) {
      setError(presentError(e).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field
          label="Priorité de diffusion (0–10)"
          hint="Plus elle est élevée, plus la campagne passe souvent sur ses Porteurs."
          error={value.trim() !== "" && invalid ? "Entier de 0 à 10." : null}
          className="w-56"
        >
          <Input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Button
          variant="secondary"
          iconLeft={<Gauge aria-hidden="true" />}
          loading={saving}
          loadingLabel="Enregistrement"
          disabledReason={invalid ? "Saisissez un entier de 0 à 10." : null}
          onClick={() => void save()}
        >
          Enregistrer la priorité
        </Button>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}

function ShortcutHint({ canDecide: withDecision }: { canDecide: boolean }) {
  return (
    <p className="hidden flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-muted sm:flex">
      <span className="inline-flex items-center gap-1">
        <Kbd keys="j" /> <Kbd keys="k" /> suivante / précédente
      </span>
      {withDecision ? (
        <>
          <span className="inline-flex items-center gap-1">
            <Kbd keys="v" /> valider
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd keys="r" /> refuser
          </span>
        </>
      ) : null}
      <span className="inline-flex items-center gap-1">
        <Kbd keys="escape" /> fermer
      </span>
    </p>
  );
}

function MediaPreview({ files }: { files: readonly MediaFileResponse[] }) {
  if (files.length === 0) {
    return (
      <EmptyState
        compact
        icon={<ImageIcon />}
        title="Aucun visuel"
        description="L'annonceur n'a fourni aucun média : seul le texte a été analysé."
      />
    );
  }
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
      {files.map((f) => (
        <li key={f.id} className="overflow-hidden rounded-card border border-line bg-surface">
          <div className="relative aspect-video bg-black">
            {f.fileType === "VIDEO" ? (
              <video
                src={f.url}
                controls
                muted
                playsInline
                preload="metadata"
                aria-label={`Vidéo ${f.fileName}`}
                className="absolute inset-0 size-full object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- same-origin /uploads media
              <img
                src={f.url}
                alt={`Visuel ${f.fileName}`}
                loading="lazy"
                className="absolute inset-0 size-full object-contain"
              />
            )}
          </div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-[0.75rem] text-muted">
            <Badge tone="neutral" size="sm">
              {MEDIA_TYPE_LABEL[f.fileType]}
            </Badge>
            <span className="min-w-0 truncate text-ink-soft" title={f.fileName}>
              {f.fileName}
            </span>
            {f.widthPx && f.heightPx ? (
              <span className="tabular">
                {f.widthPx}×{f.heightPx} px
              </span>
            ) : null}
            {f.durationSeconds ? <span className="tabular">{f.durationSeconds} s</span> : null}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Issues grouped by source, most severe first inside each group. */
export function groupIssues(
  issues: readonly AiIssue[],
): { source: AiIssue["source"]; issues: AiIssue[] }[] {
  const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
  const groups = new Map<AiIssue["source"], AiIssue[]>();
  for (const issue of issues) {
    const list = groups.get(issue.source) ?? [];
    list.push(issue);
    groups.set(issue.source, list);
  }
  return [...groups.entries()].map(([source, list]) => ({
    source,
    issues: [...list].sort((a, b) => rank[a.severity] - rank[b.severity]),
  }));
}

function AiReportBlock({ report }: { report: AiReport }) {
  const issues = report.issues ?? [];
  const legacyIssues = issues.length === 0 ? report.detectedIssues : [];
  const recommendations = report.recommendations ?? [];
  const rules = report.matchedRules ?? [];
  const analyses = report.mediaAnalyses ?? [];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill type="ai" status={report.aiStatus} />
        {report.preview ? (
          <Badge tone="muted" size="sm">
            Pré-analyse de l&apos;annonceur
          </Badge>
        ) : null}
        {report.sector ? (
          <Badge tone="blue" size="sm">
            Secteur : {AI_SECTOR_LABEL[report.sector]}
          </Badge>
        ) : null}
        {report.checkedAt ? (
          <span className="text-[0.75rem] text-muted">
            Analysée le {formatDateTime(report.checkedAt)}
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2">
        <ScoreMeter
          label="Score de risque"
          value={report.riskScore}
          kind="risk"
          hint="Plus il est bas, mieux c'est."
        />
        <ScoreMeter label="Score de qualité" value={report.qualityScore} kind="quality" />
      </div>

      <div>
        <p className="font-label text-[0.8125rem] font-semibold text-ink-soft">
          Problèmes détectés
        </p>
        {issues.length > 0 ? (
          <div className="mt-2 flex flex-col gap-3">
            {groupIssues(issues).map((g) => (
              <div key={g.source}>
                <p className="text-[0.75rem] font-medium text-muted">
                  {AI_ISSUE_SOURCE_LABEL[g.source]}
                </p>
                <ul className="mt-1 flex flex-col gap-1">
                  {g.issues.map((issue, i) => (
                    <li
                      key={`${issue.label}-${i}`}
                      className="flex items-start gap-2 text-sm text-ink-soft"
                    >
                      <Badge tone={AI_SEVERITY[issue.severity].tone} size="sm">
                        {AI_SEVERITY[issue.severity].label}
                      </Badge>
                      <span>{issue.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : legacyIssues.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {legacyIssues.map((issue) => (
              <li
                key={issue}
                className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[0.8125rem] text-warning"
              >
                {issue}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">Aucun problème relevé.</p>
        )}
      </div>

      {rules.length > 0 ? (
        <div>
          <p className="font-label text-[0.8125rem] font-semibold text-ink-soft">
            Règles internes déclenchées
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {rules.map((r, i) => (
              <li key={`${r.ruleName}-${i}`}>
                <Badge
                  tone={AI_SEVERITY[r.severity].tone}
                  size="sm"
                  title={AI_SEVERITY[r.severity].label}
                >
                  {r.ruleName}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2">
        <div>
          <p className="font-label text-[0.8125rem] font-semibold text-ink-soft">
            Texte dans l&apos;image
            {report.ocrEngine ? (
              <span className="ml-2 font-sans font-normal text-muted">
                {OCR_ENGINE_LABEL[report.ocrEngine]}
              </span>
            ) : null}
          </p>
          {report.extractedText?.trim() ? (
            <blockquote className="mt-2 rounded-control border border-line bg-surface px-3 py-2 text-sm whitespace-pre-line text-ink-soft">
              {report.extractedText}
            </blockquote>
          ) : (
            <p className="mt-2 text-sm text-muted">Aucun texte extrait.</p>
          )}
        </div>
        <div>
          <p className="font-label text-[0.8125rem] font-semibold text-ink-soft">Recommandations</p>
          {recommendations.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
              {recommendations.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {report.recommendation ??
              (recommendations.length === 0 ? (
                <span className="text-muted">Aucune recommandation.</span>
              ) : null)}
          </p>
        </div>
      </div>

      {analyses.length > 0 ? (
        <div>
          <p className="font-label text-[0.8125rem] font-semibold text-ink-soft">
            Analyse des médias
          </p>
          <ul className="mt-2 flex flex-col gap-1.5 text-[0.8125rem] text-ink-soft">
            {analyses.map((a) => (
              <li key={a.mediaId}>
                <span className="font-medium">{a.fileName}</span>
                <span className="text-muted">
                  {" "}
                  · {AI_CONTENT_TYPE_LABEL[a.contentType]}
                  {a.widthPx && a.heightPx ? ` · ${a.widthPx}×${a.heightPx} px` : ""}
                  {a.durationSeconds ? ` · ${a.durationSeconds} s` : ""}
                  {a.issues.length > 0 ? ` · ${a.issues.join(", ")}` : " · conforme"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs leading-relaxed text-muted-2">
        {report.engine ? `${AI_ENGINE_LABEL[report.engine]}. ` : ""}
        {report.contentType
          ? `Contenu analysé : ${AI_CONTENT_TYPE_LABEL[report.contentType].toLowerCase()}. `
          : ""}
        L&apos;IA assiste la modération ; la décision revient à un administrateur TPUB.
      </p>
    </div>
  );
}

/** Campaign circles drawn as read-only zones (negative ids never reach the backend). */
export function campaignZonesAsMapZones(campaign: Pick<CampaignResponse, "zones">): ZoneResponse[] {
  return (campaign.zones ?? []).map((z, i) => ({
    id: -(i + 1),
    name: z.label?.trim() || `Zone ${i + 1} · ${z.zoneName}`,
    latitude: z.latitude,
    longitude: z.longitude,
    radiusKm: z.radiusKm,
    isActive: true,
  }));
}

function ZonesBlock({
  campaign,
  supports,
  reservedIds,
}: {
  campaign: CampaignResponse;
  supports: readonly SupportResponse[];
  reservedIds: readonly number[];
}) {
  const zones = useMemo(() => campaignZonesAsMapZones(campaign), [campaign]);
  const reserved = useMemo(() => {
    const ids = new Set(reservedIds);
    return supports.filter((s) => ids.has(s.id));
  }, [supports, reservedIds]);
  if (zones.length === 0) {
    return <p className="text-sm text-muted">Aucune zone ciblée enregistrée.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <NetworkMap
        mode="explore"
        chrome="compact"
        zones={zones}
        supports={reserved}
        height="14rem"
        ariaLabel={`Zones ciblées par « ${campaign.name} » et Porteurs réservés`}
      />
      <ul className="flex flex-col gap-1 text-[0.8125rem] text-ink-soft">
        {(campaign.zones ?? []).map((z, i) => (
          <li key={z.id}>
            <span className="font-medium">{z.label?.trim() || `Zone ${i + 1}`}</span>
            <span className="text-muted">
              {" "}
              · rayon {formatNumber(z.radiusKm)} km autour de {z.zoneName} ·{" "}
              {formatNumber(z.supportsInside)} Porteur{z.supportsInside > 1 ? "s" : ""} dans le
              cercle
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReservationsBlock({ data }: { data: Awaited<ReturnType<typeof loadPlan>> }) {
  const { reservations, estimate } = data;
  if (reservations.length === 0) {
    return (
      <EmptyState
        compact
        icon={<CalendarRange />}
        title="Aucune réservation"
        description="Cette campagne ne réserve aucun Porteur : la validation sera refusée (aucune réservation à confirmer)."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
        {reservations.map((r) => (
          <li
            key={r.id}
            className="flex flex-col gap-2 bg-surface px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="min-w-0 flex-1">
              <Link
                href={routes.admin.network({ onglet: "ecrans", porteur: r.supportId })}
                className="block truncate font-label text-[0.9375rem] font-semibold text-brand-blue-text hover:underline"
              >
                {r.supportName ?? `Porteur n° ${r.supportId}`}
              </Link>
              <p className="mt-0.5 text-[0.8125rem] text-muted">
                {r.zoneName ?? `Zone n° ${r.zoneId}`} · {formatDate(r.startDate, "medium")} →{" "}
                {formatDate(r.endDate, "medium")} · {formatTimeRange(r.startTime, r.endTime)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[0.8125rem] whitespace-nowrap text-ink-soft tabular">
                {formatNumber(r.estimatedViews)} aff. · {formatTND(r.estimatedCost)}
              </span>
              <StatusPill type="reservation" status={r.reservationStatus} size="sm" />
            </div>
          </li>
        ))}
      </ul>
      {estimate ? (
        <div className="flex flex-col gap-2 rounded-card border border-line bg-overlay-inset p-4">
          <FactList
            columns={3}
            items={[
              {
                label: "Affichages estimés",
                value: <span className="tabular">{formatNumber(estimate.totalViews)}</span>,
              },
              {
                label: "Coût estimé",
                value: (
                  <span className="inline-flex items-center gap-1.5 tabular">
                    {formatTND(estimate.totalCost)}
                    <EstimateTag rule={ESTIMATE_COST_RULE} />
                  </span>
                ),
              },
              {
                label: "Budget déclaré",
                value: <span className="tabular">{formatTND(estimate.budget)}</span>,
              },
            ]}
          />
          {!estimate.budgetSufficient ? (
            <Alert tone="warning" live="none">
              Le budget déclaré ne couvre pas le coût estimé des réservations
              {estimate.budgetCoverage !== null
                ? ` (couverture ${formatNumber(Math.round(estimate.budgetCoverage * 100))} %)`
                : ""}
              : la diffusion s&apos;arrêtera à l&apos;épuisement du budget.
            </Alert>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
