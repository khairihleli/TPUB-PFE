"use client";

import {
  ArrowLeft,
  ArrowRight,
  CalendarRange,
  Check,
  CircleCheck,
  CircleX,
  ClipboardCopy,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { FactList, IdChip } from "@/components/admin/admin-ui";
import {
  DECISION_FINAL_TEXT,
  REJECT_REASON_HINT,
  REJECT_REASON_MAX,
  WILL_NOT_AIR_ACK,
  WILL_NOT_AIR_TEXT,
  WILL_NOT_AIR_TITLE,
} from "@/components/admin/decision-dialogs";
import {
  advertiserLabel,
  applyReasonPreset,
  campaignReference,
  canDecide,
  canRunAiCheck,
  joinReservations,
  REJECT_REASON_PRESETS,
  refusalMessage,
  type ReservationRow,
  sumEstimatedCost,
  validationWillNotAir,
} from "@/components/admin/moderation-model";
import { useShortcut } from "@/components/shell/shortcuts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { EstimateTag } from "@/components/ui/estimate-tag";
import { Field, Textarea } from "@/components/ui/field";
import { Kbd } from "@/components/ui/kbd";
import { ScoreMeter } from "@/components/ui/score-meter";
import { LoadingRegion, Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import { ESTIMATE_COST_RULE, ESTIMATE_VIEWS_RULE } from "@/content/glossary";
import {
  adminApi,
  aiApi,
  campaignsApi,
  reservationsApi,
  supportsApi,
  zonesApi,
} from "@/lib/api/endpoints";
import { isNoAiReportError, presentError } from "@/lib/api/errors";
import type { AiReport, CampaignResponse } from "@/lib/api/types";
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

async function loadReservations(id: number, signal: AbortSignal): Promise<ReservationRow[]> {
  const [reservations, supports, zones] = await Promise.all([
    reservationsApi.byCampaign(id, { signal }),
    fetchCached(resourceKeys.supportsAll, (s) => supportsApi.all({ signal: s }), { signal }),
    fetchCached(resourceKeys.zonesAll, (s) => zonesApi.all({ signal: s }), { signal }),
  ]);
  return joinReservations(reservations, supports, zones);
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
  /** The campaign changed (validated, rejected, analysed): update the list. */
  onCampaignChange: (updated: CampaignResponse) => void;
  /** Called after a successful decision (the view moves to the next campaign). */
  onDecided?: (decision: ReviewDecision) => void;
  navigation?: ReviewNavigation | null;
  /** Result of the previous decision, shown at the top (« « X » validée »). */
  notice?: ReviewNotice | null;
}

/** Campaign file for the moderator: facts, AI report, reservations and the inline decision. */
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
  const reservations = useResource(`admin:resa:${campaign.id}:${campaign.status}`, (signal) =>
    loadReservations(campaign.id, signal),
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // ---- decision state ------------------------------------------------------------------
  const [mode, setMode] = useState<"idle" | "rejecting">("idle");
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState<"validate" | "reject" | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<{ reason: string } | null>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const ackRef = useRef<HTMLInputElement>(null);

  const decidable = canAct && canDecide(campaign.status) && !rejected;
  const willNotAir = validationWillNotAir(campaign);
  const trimmed = reason.trim();

  const runAnalysis = async () => {
    if (analyzing) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const r = await aiApi.checkContent(campaign.id);
      report.setData(r);
      const updated = await campaignsApi.get(campaign.id);
      onCampaignChange(updated);
      toast({ title: "Analyse IA terminée", variant: "success" });
    } catch (e) {
      setAnalyzeError(presentError(e).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const focusAck = () => {
    ackRef.current?.focus();
    ackRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  };

  const validate = async () => {
    if (!decidable || pending) return;
    if (willNotAir && !acknowledged) {
      focusAck();
      return;
    }
    setPending("validate");
    setDecisionError(null);
    try {
      const updated = await adminApi.validate(campaign.id);
      onCampaignChange(updated);
      toast({
        title: `« ${campaign.name} » validée`,
        description: willNotAir
          ? "Statut « active ». Rappel : sans avis IA favorable, elle ne sera pas diffusée."
          : updated.startDate
            ? `Créneaux confirmés, diffusion possible à partir du ${formatDate(updated.startDate)}.`
            : "Créneaux confirmés.",
        variant: willNotAir ? "warning" : "success",
      });
      onDecided?.({ kind: "validated", campaign: updated });
    } catch (e) {
      setPending(null);
      setDecisionError(presentError(e).message);
    }
  };

  const startReject = () => {
    if (!decidable || pending) return;
    setMode("rejecting");
    window.requestAnimationFrame(() => reasonRef.current?.focus());
  };

  const reject = async () => {
    if (!decidable || pending) return;
    if (!trimmed) {
      reasonRef.current?.focus();
      return;
    }
    setPending("reject");
    setDecisionError(null);
    try {
      await adminApi.reject(campaign.id, trimmed);
      const updated: CampaignResponse = { ...campaign, status: "BLOCKED", adminStatus: "REJECTED" };
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
    when: () => Boolean(navigation?.onNext) && pending === null,
  });
  useShortcut("k", () => navigation?.onPrevious?.(), {
    ...shortcutOpts,
    description: "Campagne précédente",
    when: () => Boolean(navigation?.onPrevious) && pending === null,
  });
  useShortcut("v", () => void validate(), {
    ...shortcutOpts,
    description: "Valider",
    enabled: canAct,
    when: () => decidable && mode === "idle",
  });
  useShortcut("r", startReject, {
    ...shortcutOpts,
    description: "Refuser",
    enabled: canAct,
    when: () => decidable,
  });
  useShortcut("escape", onClose, {
    ...shortcutOpts,
    description: "Fermer l'examen",
    when: () => pending === null,
  });

  const submitted = campaign.submittedAt
    ? `Soumise le ${formatDateTime(campaign.submittedAt)}`
    : `Créée le ${formatDateTime(campaign.createdAt)}`;

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
  ) : decidable ? (
    <div className="flex w-full flex-col gap-3">
      {decisionError ? <Alert tone="danger">{decisionError}</Alert> : null}
      {mode === "rejecting" ? (
        <div className="flex flex-col gap-3">
          <Field label="Motif du refus" required hint={REJECT_REASON_HINT} id={`${uid}-motif`}>
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
              Annuler le refus
            </Button>
            <Button
              variant="danger"
              loading={pending === "reject"}
              loadingLabel="Refus en cours"
              iconLeft={<CircleX aria-hidden="true" />}
              disabledReason={trimmed ? null : "Indiquez le motif du refus."}
              onDisabledClick={() => reasonRef.current?.focus()}
              onClick={() => void reject()}
            >
              Refuser la campagne
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button variant="ghost" onClick={onClose} className="sm:mr-auto">
            Fermer
          </Button>
          <Button
            variant="secondary"
            iconLeft={<CircleX aria-hidden="true" />}
            onClick={startReject}
            disabled={pending !== null}
          >
            Refuser
          </Button>
          <Button
            variant="primary"
            iconLeft={<CircleCheck aria-hidden="true" />}
            loading={pending === "validate"}
            loadingLabel="Validation en cours"
            disabledReason={
              willNotAir && !acknowledged
                ? "Cochez d'abord la confirmation : cette campagne ne sera pas diffusée."
                : null
            }
            onDisabledClick={focusAck}
            onClick={() => void validate()}
          >
            Valider
          </Button>
        </div>
      )}
      <ShortcutHint canDecide />
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
      dirty={mode === "rejecting" && trimmed.length > 0 && pending === null}
      onDiscard={() => {
        setReason("");
        setMode("idle");
      }}
      preventOutsideClose={pending !== null}
      description={
        <span className="flex flex-col gap-1.5">
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <IdChip id={campaign.id} />
            <span className="font-label font-semibold text-ink-soft">
              {advertiserLabel(campaign.clientId)}
            </span>
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
            title="Campagne refusée"
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
                {copy === "copied" ? "Message copié" : "Copier le message pour l'annonceur"}
              </Button>
            }
          >
            Ses réservations ont été annulées. Le motif n&apos;est pas transmis automatiquement :
            envoyez le message à l&apos;{advertiserLabel(campaign.clientId).toLowerCase()}.
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
          {campaign.adminStatus === "VALIDATED" && campaign.aiStatus !== "APPROVED" ? (
            <span className="text-[0.8125rem] text-warning">Validée sans avis IA favorable</span>
          ) : null}
        </div>

        {willNotAir && !rejected ? (
          <Alert tone="warning" title={WILL_NOT_AIR_TITLE} live="none">
            {WILL_NOT_AIR_TEXT}
            {decidable ? (
              <Checkbox
                ref={ackRef}
                className="mt-2"
                label={WILL_NOT_AIR_ACK}
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
            ) : null}
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
              { label: "Annonceur", value: advertiserLabel(campaign.clientId) },
              { label: "Budget déclaré", value: formatTND(campaign.budget) },
              { label: "Période", value: formatDateRange(campaign.startDate, campaign.endDate) },
              {
                label: "Plage horaire",
                value: formatTimeRange(campaign.startTime, campaign.endTime),
              },
              {
                label: "Vues estimées",
                value: (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span className="tabular">{formatNumber(campaign.estimatedViews)}</span>
                    <EstimateTag rule={ESTIMATE_VIEWS_RULE} />
                  </span>
                ),
              },
            ]}
          />
        </section>

        <section
          aria-labelledby={`${uid}-ia`}
          className="rounded-card border border-line bg-overlay-inset p-5"
        >
          <h3
            id={`${uid}-ia`}
            className="flex items-center gap-2 font-display text-base font-semibold text-ink-strong"
          >
            <ScanSearch aria-hidden="true" className="size-4.5 text-brand-orange-text" />
            Rapport d&apos;analyse IA
          </h3>
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
              <div className="flex flex-col gap-3">
                <p className="text-sm leading-relaxed text-muted">
                  {analyzing
                    ? "Analyse en cours… cela peut prendre quelques secondes."
                    : "Aucune analyse pour cette campagne."}
                </p>
                {canAct && canRunAiCheck(campaign.status) ? (
                  <div>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={analyzing}
                      loadingLabel="Analyse en cours"
                      iconLeft={<Sparkles aria-hidden="true" />}
                      onClick={() => void runAnalysis()}
                    >
                      Lancer l&apos;analyse IA
                    </Button>
                  </div>
                ) : null}
                {analyzeError ? <Alert tone="danger">{analyzeError}</Alert> : null}
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby={`${uid}-resa`}>
          <h3
            id={`${uid}-resa`}
            className="flex items-center gap-2 font-display text-base font-semibold text-ink-strong"
          >
            <CalendarRange aria-hidden="true" className="size-4.5 text-brand-orange-text" />
            Réservations
          </h3>
          <div className="mt-4">
            {reservations.data ? (
              <ReservationsBlock rows={reservations.data} />
            ) : reservations.error ? (
              <ErrorState
                error={reservations.error}
                onRetry={reservations.reload}
                scope="section"
              />
            ) : (
              <LoadingRegion label="Chargement des réservations…" className="flex flex-col gap-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </LoadingRegion>
            )}
          </div>
        </section>

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

function AiReportBlock({ report }: { report: AiReport }) {
  return (
    <div className="flex flex-col gap-5">
      <StatusPill type="ai" status={report.aiStatus} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2">
        <ScoreMeter
          label="Score de risque"
          value={report.riskScore}
          kind="risk"
          hint="Plus il est bas, mieux c'est."
        />
        <ScoreMeter label="Score de qualité" value={report.qualityScore} kind="quality" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2">
        <div>
          <p className="font-label text-[0.8125rem] font-semibold text-ink-soft">Points relevés</p>
          {report.detectedIssues.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {report.detectedIssues.map((issue) => (
                <li
                  key={issue}
                  className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[0.8125rem] text-warning"
                >
                  {issue}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Aucun point relevé.</p>
          )}
        </div>
        <div>
          <p className="font-label text-[0.8125rem] font-semibold text-ink-soft">Recommandation</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {report.recommendation ?? <span className="text-muted">Aucune recommandation.</span>}
          </p>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-2">
        L&apos;IA assiste la modération ; la décision revient à un administrateur TPUB.
      </p>
    </div>
  );
}

function ReservationsBlock({ rows }: { rows: ReservationRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        compact
        icon={<CalendarRange />}
        title="Aucune réservation"
        description="Cette campagne ne réserve aucun Porteur : une validation ne programmerait aucune diffusion."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex flex-col gap-2 bg-surface px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="min-w-0 flex-1">
              <Link
                href={routes.admin.network({ onglet: "ecrans", porteur: r.supportId })}
                className="block truncate font-label text-[0.9375rem] font-semibold text-brand-blue-text hover:underline"
                title={`Voir le Porteur ${r.supportName} dans Réseau`}
              >
                {r.supportName}
              </Link>
              <p className="mt-0.5 text-[0.8125rem] text-muted">
                {r.zoneName} · {formatDate(r.startDate, "medium")} →{" "}
                {formatDate(r.endDate, "medium")} · {formatTimeRange(r.startTime, r.endTime)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[0.8125rem] whitespace-nowrap text-ink-soft tabular">
                {formatTND(r.estimatedCost)}
              </span>
              <StatusPill type="reservation" status={r.reservationStatus} size="sm" />
            </div>
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap items-center justify-end gap-2 text-sm text-muted">
        Coût estimé des créneaux
        <span className="font-label font-semibold whitespace-nowrap text-ink-strong tabular">
          {formatTND(sumEstimatedCost(rows))}
        </span>
        <EstimateTag rule={ESTIMATE_COST_RULE} />
      </p>
    </div>
  );
}
