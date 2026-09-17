"use client";

import { AnimatePresence, motion } from "framer-motion";
import { LogOut, Send } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  clampWizardStep,
  maxReachableStep,
  parseCampaignId,
  parseWizardStep,
  WIZARD_STEPS,
  type WizardStep,
  wizardHref,
} from "@/components/campaign/campaign-actions";
import {
  activeReservations,
  type CampaignWithReservations,
  isCampaignNotFound,
  loadCampaignWithReservations,
} from "@/components/campaign/campaign-data";
import { CampaignNotFound } from "@/components/campaign/campaign-ui";
import { StepContent } from "@/components/campaign/step-content";
import { StepDetails } from "@/components/campaign/step-details";
import { StepReview } from "@/components/campaign/step-review";
import { StepZones } from "@/components/campaign/step-zones";
import { useSubmitFlow } from "@/components/campaign/use-submit-flow";
import { WizardStrip } from "@/components/campaign/wizard-chrome";
import { useBreadcrumbs, useDocumentTitle } from "@/components/shell/breadcrumbs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { useToast } from "@/components/ui/toast";
import type { CampaignResponse } from "@/lib/api/types";
import { getCampaignStatusMeta } from "@/lib/campaign-status";
import { formatCount } from "@/lib/format";
import { invalidate, resourceKeys } from "@/lib/resource-cache";
import { routes } from "@/lib/routes";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useResource } from "@/lib/use-resource";

export const PENDING_SELECTION_REASON =
  "Enregistrez vos zones et réservez (ou désélectionnez) les Porteurs choisis.";

export function WizardSkeleton() {
  return (
    <LoadingRegion label="Chargement de la campagne…">
      <div className="mb-5 flex flex-col gap-3">
        <Skeleton className="h-9 w-72" />
      </div>
      <Skeleton className="h-12 w-full rounded-card" />
      <Skeleton className="mt-6 h-96 w-full rounded-panel" />
    </LoadingRegion>
  );
}

function AlreadySubmitted({ campaign }: { campaign: CampaignResponse }) {
  const meta = getCampaignStatusMeta(campaign, { audience: "annonceur" });
  return (
    <EmptyState
      icon={<Send />}
      title="Cette campagne n'est plus un brouillon"
      description={
        <>
          Statut actuel : <strong className="text-ink-soft">{meta.label}</strong>.{" "}
          {meta.description} Retrouvez le suivi et les actions possibles (correction, duplication)
          sur la page de la campagne.
        </>
      }
      action={
        <Button asChild variant="primary">
          <Link href={routes.espace.campaign(campaign.id)}>Voir la campagne</Link>
        </Button>
      }
    />
  );
}

/** Toast text when saving released reservations (null when none were released). */
export function releasedReservationsMessage(before: number, after: number): string | null {
  const released = before - after;
  return released > 0
    ? `${formatCount(released, "réservation libérée", "réservations libérées")} : Porteurs hors de la nouvelle période ou du nouveau créneau.`
    : null;
}

/**
 * /espace/campagnes/nouvelle — 4-step wizard (Détails · Contenu · Zone & Porteurs · Vérification
 * & envoi), resumable from the URL (?id=&etape=1..4). Submission runs the AI analysis.
 */
export function CampaignWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const reduce = useReducedMotion();

  const idParam = searchParams.get("id");
  const stepParam = searchParams.get("etape");
  const id = parseCampaignId(idParam);
  const requested = parseWizardStep(stepParam);

  const resource = useResource<CampaignWithReservations>(
    id === null ? null : `wizard-campaign-${id}`,
    (signal) => loadCampaignWithReservations(id, signal),
  );
  const { setData, reload } = resource;
  const current = id !== null && resource.data?.campaign.id === id ? resource.data : null;

  const [flowCampaignId, setFlowCampaignId] = useState<number | null>(null);
  const flow = useSubmitFlow(() => {
    invalidate(resourceKeys.campaignsMine);
  });
  const flowState = flowCampaignId === id ? flow.state : ({ phase: "idle" } as const);

  const [pending, setPending] = useState(0);

  const reservations = useMemo(() => current?.reservations ?? [], [current]);
  const reservationCount = activeReservations(reservations).length;
  const ctx = { hasCampaign: current !== null };
  const maxReachable = maxReachableStep(ctx);
  const submittedView = current !== null && flowState.phase !== "idle";
  const step: WizardStep = submittedView ? 4 : id === null ? 1 : clampWizardStep(requested, ctx);

  const campaignName = current?.campaign.name ?? null;
  useBreadcrumbs(
    id === null
      ? [{ label: "Campagnes", href: routes.espace.campaigns() }, { label: "Nouvelle campagne" }]
      : campaignName
        ? [
            { label: "Campagnes", href: routes.espace.campaigns() },
            { label: campaignName, href: routes.espace.campaign(id) },
            { label: "Finaliser" },
          ]
        : [{ label: "Campagnes", href: routes.espace.campaigns() }, { label: "Finaliser" }],
  );
  useDocumentTitle(id === null ? "Nouvelle campagne" : campaignName);

  // Canonical URL: a refresh resumes exactly where the advertiser is.
  useEffect(() => {
    if (id === null || !current) return;
    if (stepParam !== String(step)) router.replace(wizardHref(id, step), { scroll: false });
  }, [id, current, step, stepParam, router]);

  // Focus the new step heading after a step change (not on first render).
  const topRef = useRef<HTMLDivElement | null>(null);
  const ready = id === null || current !== null;
  const previousStep = useRef<WizardStep | null>(null);
  const focusTarget = useRef<number | null>(null);
  const headingRef = useCallback((el: HTMLHeadingElement | null) => {
    if (
      el &&
      focusTarget.current !== null &&
      Number(el.dataset.wizardStep) === focusTarget.current
    ) {
      focusTarget.current = null;
      el.focus({ preventScroll: true });
    }
  }, []);
  useEffect(() => {
    if (!ready) {
      previousStep.current = null;
      return;
    }
    if (previousStep.current === null) {
      previousStep.current = step;
      return;
    }
    if (previousStep.current === step) return;
    previousStep.current = step;
    const top = topRef.current;
    if (top && typeof top.scrollIntoView === "function") {
      top.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    }
    const el = document.querySelector<HTMLElement>(`[data-wizard-step="${step}"]`);
    if (el) el.focus({ preventScroll: true });
    else focusTarget.current = step;
  }, [ready, step, reduce]);

  const goTo = useCallback(
    (target: WizardStep) => {
      if (id === null) return;
      router.push(wizardHref(id, target), { scroll: false });
    },
    [id, router],
  );

  /** Never leave the zone step with unsaved circles or an unbooked selection. */
  const blocked: Partial<Record<WizardStep, string>> =
    step === 3 && pending > 0
      ? { 1: PENDING_SELECTION_REASON, 2: PENDING_SELECTION_REASON, 4: PENDING_SELECTION_REASON }
      : {};
  const selectFromStrip = (target: WizardStep) => {
    if (blocked[target]) return;
    goTo(target);
  };

  const updateCampaign = (saved: CampaignResponse) => {
    setData((prev) => ({
      campaign: saved,
      reservations: prev && prev.campaign.id === saved.id ? prev.reservations : [],
    }));
  };

  const onSaved = (
    saved: CampaignResponse,
    { advance, changed, autosave }: { advance: boolean; changed: boolean; autosave?: boolean },
  ) => {
    const before = current?.campaign.reservationsCount ?? 0;
    updateCampaign(saved);
    if (changed) invalidate(resourceKeys.campaignsMine);
    const released = current
      ? releasedReservationsMessage(before, saved.reservationsCount ?? before)
      : null;
    if (released) {
      invalidate(resourceKeys.reservationsByCampaign(saved.id));
      reload();
      toast({ title: "Période enregistrée", description: released, variant: "warning" });
    } else if (changed && !autosave) {
      toast({
        title: id === null ? "Brouillon créé" : "Brouillon enregistré",
        description:
          id === null ? "Vous pouvez reprendre cette campagne à tout moment." : undefined,
        variant: "success",
      });
    }
    if (id === null) {
      router.replace(wizardHref(saved.id, advance ? 2 : 1), { scroll: false });
    } else if (advance) {
      goTo(2);
    }
  };

  const onReservationsChange = () => {
    if (id !== null) invalidate(resourceKeys.reservationsByCampaign(id));
    invalidate(resourceKeys.campaignsMine);
    reload();
  };

  const startFlow = (c: Pick<CampaignResponse, "id" | "status">) => {
    setFlowCampaignId(c.id);
    return flow.start(c);
  };

  // --- States -------------------------------------------------------------
  let body: ReactNode;
  if (idParam !== null && id === null) {
    body = <CampaignNotFound />;
  } else if (id !== null && !current) {
    body =
      resource.error && !resource.loading ? (
        isCampaignNotFound(resource.error) ? (
          <CampaignNotFound />
        ) : (
          <ErrorState error={resource.error} onRetry={reload} />
        )
      ) : (
        <WizardSkeleton />
      );
  } else if (current && flowState.phase === "idle" && current.campaign.status !== "BROUILLON") {
    body = <AlreadySubmitted campaign={current.campaign} />;
  } else {
    const campaign = current?.campaign ?? null;
    body = (
      <div className="flex flex-col gap-6">
        <WizardStrip
          current={step}
          maxReachable={maxReachable}
          onSelect={selectFromStrip}
          locked={submittedView}
          blocked={blocked}
          campaign={campaign}
          reservations={reservations}
        />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${id ?? "new"}-${step}`}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 1 } : { opacity: 0, y: -6 }}
            transition={reduce ? { duration: 0 } : { duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="min-w-0"
          >
            {step === 1 || !campaign ? (
              <StepDetails
                campaign={campaign}
                reservationCount={reservationCount}
                onSaved={onSaved}
                headingRef={headingRef}
              />
            ) : step === 2 ? (
              <StepContent
                campaign={campaign}
                onBack={() => goTo(1)}
                onNext={() => goTo(3)}
                onMediaChange={(count) => {
                  if (count !== (campaign.mediaCount ?? 0))
                    updateCampaign({ ...campaign, mediaCount: count });
                }}
                headingRef={headingRef}
              />
            ) : step === 3 ? (
              <StepZones
                campaign={campaign}
                onCampaignChange={updateCampaign}
                onReservationsChange={onReservationsChange}
                onBack={() => goTo(2)}
                onNext={() => goTo(4)}
                onEditDetails={() => goTo(1)}
                onPendingChange={setPending}
                headingRef={headingRef}
              />
            ) : (
              <StepReview
                campaign={campaign}
                reservations={reservations}
                flow={{ state: flowState, start: startFlow, retry: flow.retry }}
                onEditStep={goTo}
                headingRef={headingRef}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  const title = current
    ? current.campaign.name
    : id === null
      ? "Nouvelle campagne"
      : "Finaliser la campagne";
  const exitHref = id !== null ? routes.espace.campaign(id) : routes.espace.campaigns();
  const showChrome = id === null || current !== null;
  return (
    <div ref={topRef} className="scroll-mt-24">
      <PageHeader
        className="mb-4 sm:mb-5"
        title={<span className="break-words">{title}</span>}
        meta={
          current && !submittedView ? (
            <span className="inline-flex flex-wrap items-center gap-2 text-[0.875rem] text-muted">
              <StatusPill
                type="campaign"
                campaign={current.campaign}
                audience="annonceur"
                size="sm"
              />
              <span aria-hidden="true">·</span>
              <span className="whitespace-nowrap">
                Étape {step} sur {WIZARD_STEPS.length}
              </span>
            </span>
          ) : undefined
        }
        description={
          step === 1 && showChrome && !submittedView
            ? "Quatre étapes : les détails, le contenu, la zone et les Porteurs, puis la vérification et l'envoi."
            : undefined
        }
        secondaryActions={
          showChrome ? (
            <Button asChild variant="ghost" className="max-sm:px-0">
              <Link href={exitHref}>
                <LogOut aria-hidden="true" />
                Quitter l&apos;assistant
              </Link>
            </Button>
          ) : undefined
        }
      />
      {body}
    </div>
  );
}
