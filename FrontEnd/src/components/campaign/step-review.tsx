"use client";

import { ArrowLeft, CopyPlus, Eye, PencilLine, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { type ReactNode, type Ref, useMemo, useRef, useState } from "react";

import { AiResultPanel, SubmitFlowStatus } from "@/components/campaign/ai-analysis";
import type { WizardStep } from "@/components/campaign/campaign-actions";
import {
  activeReservations,
  joinReservations,
  loadNetworkLookups,
  sumEstimatedCost,
} from "@/components/campaign/campaign-data";
import { FactGrid } from "@/components/campaign/campaign-ui";
import { DuplicateCampaignDialog } from "@/components/campaign/duplicate-campaign-dialog";
import { ReservationList } from "@/components/campaign/reservation-list";
import { CreativePreviewSection } from "@/components/campaign/step-creative";
import type { SubmitFlowState } from "@/components/campaign/use-submit-flow";
import { WizardStepHeading } from "@/components/campaign/wizard-chrome";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EstimateTag } from "@/components/ui/estimate-tag";
import { SkeletonText } from "@/components/ui/skeleton";
import {
  ESTIMATE_COST_RULE,
  ESTIMATE_VIEWS_RULE,
  REVIEW_WAIT_SENTENCE,
  SUBMIT_CONSEQUENCE,
} from "@/content/glossary";
import type { CampaignResponse, ReservationResponse } from "@/lib/api/types";
import { useUnsavedChangesGuard } from "@/lib/forms/unsaved-guard";
import {
  formatDateRange,
  formatEstimate,
  formatTimeRange,
  formatTND,
  todayISO,
} from "@/lib/format";
import { reviewTriggerTerms } from "@/lib/review-triggers";
import { routes } from "@/lib/routes";
import { useResource } from "@/lib/use-resource";

/** Moderation rules summary (brief §8.4 « Charte des contenus »). */
const MODERATION_RULES = [
  "Pas de promesse trompeuse : « gratuit » ou « garanti » uniquement si c'est vrai et justifié.",
  "Aucun contenu offensant, discriminatoire ou illégal.",
  "Un objectif clair et cohérent avec le budget annoncé.",
  "Une rédaction soignée, lisible en quelques secondes.",
] as const;

export const ACKNOWLEDGE_REASON = "Cochez la case pour confirmer la relecture de la campagne.";
export const NO_RESERVATION_REASON = "Réservez au moins un Porteur pour soumettre.";
const SUBMITTING_GUARD_MESSAGE =
  "L'envoi de la campagne est en cours : restez sur la page pour voir le résultat de l'analyse.";

function RecapBlock({
  title,
  onEdit,
  editLabel,
  children,
}: {
  title: string;
  onEdit?: () => void;
  editLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-[1rem] font-semibold text-ink-strong">{title}</h3>
        {onEdit ? (
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<PencilLine aria-hidden="true" />}
            onClick={onEdit}
          >
            Modifier<span className="sr-only"> : {editLabel}</span>
          </Button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function EstimateTile({
  label,
  value,
  rule,
  hint,
}: {
  label: string;
  value: string;
  rule: string;
  hint: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-card border border-line bg-surface px-4 py-3.5">
      <p className="flex flex-wrap items-center gap-2 text-[0.8125rem] font-medium text-muted">
        {label}
        <EstimateTag rule={rule} />
      </p>
      <p className="font-display text-[1.375rem] font-semibold whitespace-nowrap text-ink-strong tabular">
        {value}
      </p>
      <p className="text-[0.8125rem] text-muted">{hint}</p>
    </div>
  );
}

export interface StepReviewProps {
  campaign: CampaignResponse;
  reservations: readonly ReservationResponse[];
  flow: {
    state: SubmitFlowState;
    start: (c: Pick<CampaignResponse, "id" | "status">) => Promise<void>;
    retry: () => Promise<void>;
  };
  onEditStep: (step: WizardStep) => void;
  headingRef?: Ref<HTMLHeadingElement>;
}

/** Wizard step 3: recap, estimates, optional preview, charter gate, submit → AI check → result. */
export function StepReview({
  campaign,
  reservations,
  flow,
  onEditStep,
  headingRef,
}: StepReviewProps) {
  const [today] = useState(() => todayISO());
  const [acknowledged, setAcknowledged] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const gateRef = useRef<HTMLDivElement>(null);
  const lookups = useResource("wizard-network-lookups", loadNetworkLookups);

  const active = useMemo(() => activeReservations(reservations), [reservations]);
  const joined = useMemo(
    () => joinReservations(active, lookups.data ?? { supports: null, zones: null }),
    [active, lookups.data],
  );
  const cost = sumEstimatedCost(active);
  const terms = reviewTriggerTerms(`${campaign.name} ${campaign.objective ?? ""}`);

  const { state } = flow;
  const inFlight = state.phase === "submitting" || state.phase === "analysing";
  useUnsavedChangesGuard({ dirty: inFlight, message: SUBMITTING_GUARD_MESSAGE });

  const locked = state.phase !== "idle" || campaign.status !== "BROUILLON";
  const pendingAnalysis = campaign.status === "PENDING_AI_CHECK" && state.phase === "idle";
  const canShowGate = state.phase === "idle" && campaign.status === "BROUILLON";

  const submitReason =
    active.length === 0 ? NO_RESERVATION_REASON : !acknowledged ? ACKNOWLEDGE_REASON : null;

  const pointToGate = () => {
    const input = gateRef.current?.querySelector<HTMLInputElement>("input[type=checkbox]");
    if (input && !acknowledged) input.focus();
  };

  return (
    <div>
      <WizardStepHeading step={3} title="Vérification & envoi" headingRef={headingRef} />

      {state.phase === "done" ? (
        <AiResultPanel
          report={state.report}
          actions={
            state.report.aiStatus === "REJECTED" ? (
              <>
                <Button
                  variant="primary"
                  iconLeft={<CopyPlus aria-hidden="true" />}
                  onClick={() => setDuplicateOpen(true)}
                >
                  Dupliquer et corriger
                </Button>
                <Button asChild variant="secondary">
                  <Link href={routes.espace.campaign(campaign.id)}>Voir le détail</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="primary">
                  <Link href={routes.espace.campaign(campaign.id)}>
                    <Eye aria-hidden="true" />
                    Voir la campagne
                  </Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link href={routes.espace.campaigns()}>Retour à mes campagnes</Link>
                </Button>
              </>
            )
          }
        />
      ) : (
        <SubmitFlowStatus
          state={state}
          campaignName={campaign.name}
          objective={campaign.objective}
          campaignId={campaign.id}
          onRetry={() => void flow.retry()}
        />
      )}

      {state.phase === "done" ? (
        <DuplicateCampaignDialog
          campaign={{ ...campaign, status: "REJECTED_BY_AI" }}
          open={duplicateOpen}
          onOpenChange={setDuplicateOpen}
        />
      ) : null}

      {pendingAnalysis ? (
        <Alert
          tone="warning"
          title="Campagne soumise, analyse IA à lancer"
          action={
            <Button
              variant="primary"
              size="sm"
              iconLeft={<ShieldCheck aria-hidden="true" />}
              onClick={() => void flow.start(campaign)}
            >
              Lancer l&apos;analyse IA
            </Button>
          }
        >
          Votre campagne a bien été soumise mais son analyse n&apos;a pas encore abouti.
        </Alert>
      ) : null}

      <div className={state.phase === "idle" && !pendingAnalysis ? "" : "mt-8"}>
        <div className="flex flex-col gap-7">
          <RecapBlock
            title="Campagne"
            editLabel="détails de la campagne"
            onEdit={locked ? undefined : () => onEditStep(1)}
          >
            <FactGrid
              className="grid-cols-[minmax(0,1fr)]"
              items={[
                { label: "Nom", value: campaign.name },
                {
                  label: "Budget déclaré",
                  value: (
                    <span className="whitespace-nowrap tabular">{formatTND(campaign.budget)}</span>
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
                {
                  label: "Plage horaire",
                  value: (
                    <span className="tabular">
                      {formatTimeRange(campaign.startTime, campaign.endTime)}
                    </span>
                  ),
                },
                {
                  label: "Objectif",
                  value: campaign.objective?.trim() || "Non renseigné",
                  wide: true,
                },
              ]}
            />
            {terms.length > 0 ? (
              <p className="text-[0.875rem] text-ink-soft">
                <span className="font-semibold">Termes à préciser :</span>{" "}
                {terms.map((t) => `« ${t} »`).join(", ")}
                <span className="text-muted">
                  {" "}
                  — ils déclenchent généralement un examen manuel ; précisez la condition dans
                  l&apos;objectif.
                </span>
              </p>
            ) : null}
            {campaign.startDate && campaign.startDate < today && !locked ? (
              <Alert tone="warning" live="none">
                La date de début est passée : la diffusion ne pourra couvrir que les jours restants
                de la période.
              </Alert>
            ) : null}
          </RecapBlock>

          <section
            aria-label="Estimations"
            className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2"
          >
            <EstimateTile
              label="Coût estimé des créneaux"
              value={formatEstimate(cost, "DT")}
              rule={ESTIMATE_COST_RULE}
              hint="Somme des coûts estimés par créneau, fixés à la réservation."
            />
            <EstimateTile
              label="Vues estimées"
              value={formatEstimate(campaign.estimatedViews, "vues")}
              rule={ESTIMATE_VIEWS_RULE}
              hint="Pas une mesure d'audience."
            />
          </section>

          <RecapBlock
            title="Porteurs réservés"
            editLabel="Porteurs réservés"
            onEdit={locked ? undefined : () => onEditStep(2)}
          >
            {lookups.loading && !lookups.data ? (
              <div role="status" aria-busy="true" className="rounded-card border border-line p-5">
                <span className="sr-only">Chargement des Porteurs…</span>
                <SkeletonText lines={3} />
              </div>
            ) : (
              <ReservationList reservations={joined} dense showCost />
            )}
          </RecapBlock>

          {locked ? null : <CreativePreviewSection campaign={campaign} />}
        </div>

        {canShowGate ? (
          <section
            aria-labelledby="charte-titre"
            className="mt-8 rounded-panel border border-line bg-surface p-5 sm:p-7"
          >
            <h3
              id="charte-titre"
              className="flex items-center gap-2 font-display text-[1.0625rem] font-semibold text-ink-strong"
            >
              <ShieldCheck aria-hidden="true" className="size-5 text-brand-orange-text" />
              Avant d&apos;envoyer : la charte des contenus
            </h3>
            <ul className="mt-4 flex flex-col gap-2.5">
              {MODERATION_RULES.map((rule) => (
                <li key={rule} className="flex gap-3 text-[0.875rem] leading-relaxed text-ink-soft">
                  <span
                    aria-hidden="true"
                    className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-brand-orange-text"
                  />
                  {rule}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[0.8125rem] leading-relaxed text-muted">
              L&apos;analyse IA note le risque et la qualité et relève les points à revoir. Un
              expert TPUB valide toujours avant diffusion. {REVIEW_WAIT_SENTENCE}
            </p>
            <div ref={gateRef}>
              <Checkbox
                className="mt-4"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                label="J'ai relu ma campagne au regard de ces règles."
              />
            </div>
            <div className="mt-4 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[0.875rem] font-medium text-ink-soft">{SUBMIT_CONSEQUENCE}</p>
              <Button
                variant="primary"
                size="lg"
                className="shrink-0"
                disabledReason={submitReason}
                onDisabledClick={pointToGate}
                iconLeft={<Send aria-hidden="true" />}
                onClick={() => void flow.start(campaign)}
              >
                Soumettre à la modération
              </Button>
            </div>
            {submitReason ? (
              <p className="mt-2 text-[0.8125rem] text-muted sm:text-right">{submitReason}</p>
            ) : null}
          </section>
        ) : null}

        {canShowGate ? (
          <div className="mt-8 border-t border-line pt-6">
            <Button
              variant="ghost"
              iconLeft={<ArrowLeft aria-hidden="true" />}
              onClick={() => onEditStep(2)}
            >
              Porteurs
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
