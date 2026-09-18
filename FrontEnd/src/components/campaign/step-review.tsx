"use client";

import {
  ArrowLeft,
  CircleCheck,
  CircleDashed,
  Eye,
  PencilLine,
  Send,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, type Ref, useMemo, useRef, useState } from "react";

import { AiResultPanel, SubmitFlowStatus } from "@/components/campaign/ai-analysis";
import { submitChecklist, type WizardStep } from "@/components/campaign/campaign-actions";
import { activeReservations, joinReservations } from "@/components/campaign/campaign-data";
import { FactGrid } from "@/components/campaign/campaign-ui";
import { EstimateInvoice } from "@/components/campaign/estimate-invoice";
import { ReservationList } from "@/components/campaign/reservation-list";
import { aiOutcomeOf, type SubmitFlowState } from "@/components/campaign/use-submit-flow";
import { WizardStepHeading } from "@/components/campaign/wizard-chrome";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { REVIEW_WAIT_SENTENCE } from "@/content/glossary";
import { estimatesApi } from "@/lib/api/endpoints";
import type { CampaignResponse, ReservationResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { useUnsavedChangesGuard } from "@/lib/forms/unsaved-guard";
import { formatDateRange, formatTND, todayISO } from "@/lib/format";
import { reviewTriggerTerms } from "@/lib/review-triggers";
import { routes } from "@/lib/routes";
import { formatSlot } from "@/lib/time-slots";
import { useResource } from "@/lib/use-resource";

/** Moderation rules summary (brief §8.4 « Charte des contenus »). */
const MODERATION_RULES = [
  "Pas de promesse trompeuse : « gratuit » ou « garanti » uniquement si c'est vrai et justifié.",
  "Aucun contenu offensant, discriminatoire, illégal ou sensible (alcool, jeux d'argent…).",
  "Un objectif clair et cohérent avec le budget annoncé.",
  "Un visuel lisible en quelques secondes, sans surcharge de texte.",
] as const;

export const ACKNOWLEDGE_REASON = "Cochez la case pour confirmer la relecture de la campagne.";
export const INCOMPLETE_REASON = "Complétez les éléments manquants de la liste.";
const SUBMITTING_GUARD_MESSAGE =
  "La soumission et l'analyse IA sont en cours : restez sur la page pour voir le résultat.";

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

/** Wizard step 4: checklist, estimate, recap, charter gate, submit (AI analysis) → result. */
export function StepReview({
  campaign,
  reservations,
  flow,
  onEditStep,
  headingRef,
}: StepReviewProps) {
  const [today] = useState(() => todayISO());
  const [acknowledged, setAcknowledged] = useState(false);
  const gateRef = useRef<HTMLDivElement>(null);

  const active = useMemo(() => joinReservations(activeReservations(reservations)), [reservations]);
  const estimate = useResource(
    `wizard-estimate-${campaign.id}-${active.map((r) => r.id).join(",")}`,
    (signal) => estimatesApi.campaign(campaign.id, { signal }),
  );
  const checklist = submitChecklist(campaign, { reservationCount: active.length, today });
  const missing = checklist.filter((c) => !c.ok);
  const terms = reviewTriggerTerms(`${campaign.name} ${campaign.objective ?? ""}`);

  const { state } = flow;
  const inFlight = state.phase === "submitting";
  useUnsavedChangesGuard({ dirty: inFlight, message: SUBMITTING_GUARD_MESSAGE });

  const locked = state.phase !== "idle" || campaign.status !== "BROUILLON";
  const canShowGate = state.phase !== "done" && !inFlight && campaign.status === "BROUILLON";
  const submitReason =
    missing.length > 0 ? INCOMPLETE_REASON : !acknowledged ? ACKNOWLEDGE_REASON : null;

  if (state.phase === "done") {
    const outcome =
      state.report?.aiStatus ?? (state.campaign ? aiOutcomeOf(state.campaign.status) : null);
    return (
      <div>
        <WizardStepHeading step={4} title="Vérification & envoi" headingRef={headingRef} />
        <AiResultPanel
          report={state.report}
          outcome={outcome}
          actions={
            <>
              <Button asChild variant="primary">
                <Link href={routes.espace.campaign(campaign.id)}>
                  <Eye aria-hidden="true" />
                  {outcome === "REJECTED" ? "Voir et corriger la campagne" : "Voir la campagne"}
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href={routes.espace.campaigns()}>Retour à mes campagnes</Link>
              </Button>
            </>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <WizardStepHeading step={4} title="Vérification & envoi" headingRef={headingRef} />

      <SubmitFlowStatus
        state={state}
        campaignName={campaign.name}
        objective={campaign.objective}
        onRetry={() => void flow.retry()}
      />

      <div className={cx("flex flex-col gap-7", state.phase !== "idle" && "mt-8")}>
        <section
          aria-labelledby="checklist-titre"
          className="rounded-panel border border-line bg-surface p-5 sm:p-6"
        >
          <h3
            id="checklist-titre"
            className="font-display text-[1rem] font-semibold text-ink-strong"
          >
            Avant la soumission
          </h3>
          <ul className="mt-3 flex flex-col gap-2">
            {checklist.map((item) => (
              <li
                key={item.key}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.875rem]"
              >
                {item.ok ? (
                  <CircleCheck aria-hidden="true" className="size-4.5 shrink-0 text-success" />
                ) : (
                  <CircleDashed aria-hidden="true" className="size-4.5 shrink-0 text-warning" />
                )}
                <span className={item.ok ? "text-ink-soft" : "font-semibold text-ink-strong"}>
                  {item.label}
                  <span className="sr-only">{item.ok ? " : complet" : " : à compléter"}</span>
                </span>
                {item.ok || locked ? null : (
                  <>
                    <span className="text-muted">{item.hint}</span>
                    <Button variant="ghost" size="sm" onClick={() => onEditStep(item.step)}>
                      Compléter<span className="sr-only"> : {item.label}</span>
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>

        <RecapBlock
          title="Campagne"
          editLabel="détails de la campagne"
          onEdit={locked ? undefined : () => onEditStep(1)}
        >
          <FactGrid
            items={[
              { label: "Nom", value: campaign.name },
              {
                label: "Budget",
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
              { label: "Créneau", value: formatSlot(campaign.startTime, campaign.endTime) },
              {
                label: "Médias",
                value:
                  (campaign.mediaCount ?? 0) > 0
                    ? `${campaign.mediaCount} fichier${(campaign.mediaCount ?? 0) > 1 ? "s" : ""}`
                    : "Aucun visuel",
              },
              {
                label: "Zones",
                value:
                  (campaign.zones ?? []).map((z, i) => z.label || `Zone ${i + 1}`).join(", ") ||
                  "Aucune",
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
                — ils déclenchent souvent une revue manuelle ; précisez la condition.
              </span>
            </p>
          ) : null}
        </RecapBlock>

        <EstimateInvoice
          campaignId={campaign.id}
          headingAs="h3"
          estimate={estimate.data ?? null}
          error={estimate.error}
          onRetry={estimate.reload}
        />

        <RecapBlock
          title="Porteurs réservés"
          editLabel="zone et Porteurs"
          onEdit={locked ? undefined : () => onEditStep(3)}
        >
          {active.length > 0 ? (
            <ReservationList reservations={active} dense showCost />
          ) : (
            <p className="rounded-card border border-dashed border-line-strong px-5 py-5 text-[0.875rem] text-muted">
              Aucun Porteur réservé pour l&apos;instant.
            </p>
          )}
        </RecapBlock>
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
            La soumission lance l&apos;analyse IA (texte, visuels, texte dans l&apos;image, règles
            ZELQANE) ; le résultat s&apos;affiche ici. Un expert ZELQANE valide toujours avant diffusion.{" "}
            {REVIEW_WAIT_SENTENCE}
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
            <p className="text-[0.875rem] font-medium text-ink-soft">
              Après envoi, la campagne n&apos;est plus modifiable tant que ZELQANE n&apos;a pas statué.
            </p>
            <Button
              variant="primary"
              size="lg"
              className="shrink-0"
              disabledReason={submitReason}
              onDisabledClick={() =>
                gateRef.current?.querySelector<HTMLInputElement>("input")?.focus()
              }
              iconLeft={<Send aria-hidden="true" />}
              onClick={() => void flow.start(campaign)}
            >
              Soumettre
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
            onClick={() => onEditStep(3)}
          >
            Zone & Porteurs
          </Button>
        </div>
      ) : null}
    </div>
  );
}
