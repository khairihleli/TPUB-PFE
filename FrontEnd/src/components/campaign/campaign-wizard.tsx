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
import { moveLocalCreative } from "@/components/campaign/creative-store";
import {
  ChangePeriodDialog,
  type PeriodChangeNotice,
  StepDetails,
} from "@/components/campaign/step-details";
import { StepReview } from "@/components/campaign/step-review";
import { StepScreens } from "@/components/campaign/step-screens";
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
import type { CampaignResponse, ReservationResponse } from "@/lib/api/types";
import { getCampaignStatusMeta } from "@/lib/campaign-status";
import { invalidate, resourceKeys } from "@/lib/resource-cache";
import { routes } from "@/lib/routes";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useResource } from "@/lib/use-resource";

export const PENDING_SELECTION_REASON = "Réservez ou retirez d'abord les Porteurs sélectionnés.";

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
      title="Cette campagne a déjà été soumise"
      description={
        <>
          Statut actuel : <strong className="text-ink-soft">{meta.label}</strong>.{" "}
          {meta.description} L&apos;assistant ne sert qu&apos;aux brouillons ; retrouvez le suivi et
          les actions possibles sur la page de la campagne.
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

/**
 * /espace/campagnes/nouvelle — 3-step wizard (Détails · Porteurs · Vérification & envoi),
 * resumable from the URL (?id=&etape=, legacy 4 → 3).
 * Enforces the backend ordering (contract §6): create → reserve → submit → AI.
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
    reload();
  });
  const flowState = flowCampaignId === id ? flow.state : ({ phase: "idle" } as const);

  const [pendingSelection, setPendingSelection] = useState(0);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [periodNotice, setPeriodNotice] = useState<PeriodChangeNotice | null>(null);

  const active = useMemo(
    () => (current ? activeReservations(current.reservations) : []),
    [current],
  );
  const reservationCount = active.length;
  const ctx = { hasCampaign: current !== null, reservationCount };
  const maxReachable = maxReachableStep(ctx);
  const submittedView =
    current !== null && (current.campaign.status !== "BROUILLON" || flowState.phase !== "idle");
  const step: WizardStep = submittedView ? 3 : id === null ? 1 : clampWizardStep(requested, ctx);

  // Trail « Campagnes › {name} › Finaliser » and document title (IA-04, FLOW-17).
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

  // Canonical URL (a refresh resumes exactly where the advertiser is; legacy ?etape=4 → 3).
  useEffect(() => {
    if (id === null || !current) return;
    if (stepParam !== String(step)) router.replace(wizardHref(id, step), { scroll: false });
  }, [id, current, step, stepParam, router]);

  // Focus the new step heading after a step change (not on first render). With the exit
  // animation the new heading may mount after this effect: the callback ref catches it.
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

  /** Stepper: never leaves step 2 for step 3 with a pending, unbooked selection (FFA-02). */
  const blocked: Partial<Record<WizardStep, string>> =
    step === 2 && pendingSelection > 0 ? { 3: PENDING_SELECTION_REASON } : {};
  const selectFromStrip = (target: WizardStep) => {
    if (blocked[target]) return;
    goTo(target);
  };

  const onSaved = (
    saved: CampaignResponse,
    { advance, changed, autosave }: { advance: boolean; changed: boolean; autosave?: boolean },
  ) => {
    setData((prev) => ({
      campaign: saved,
      reservations: prev && prev.campaign.id === saved.id ? prev.reservations : [],
    }));
    if (changed) invalidate(resourceKeys.campaignsMine);
    if (changed && !autosave) {
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

  const onReserved = (created: ReservationResponse[]) => {
    if (!current) return;
    setData((prev) => {
      const base = prev ?? current;
      return { ...base, reservations: [...base.reservations, ...created] };
    });
    invalidate(resourceKeys.campaignsMine);
    // estimatedViews changed server-side.
    reload();
  };

  const onPeriodChanged = (
    copy: CampaignResponse,
    notice: PeriodChangeNotice,
    sourceId: number,
  ) => {
    moveLocalCreative(sourceId, copy.id);
    invalidate(resourceKeys.campaignsMine);
    invalidate(resourceKeys.reservationsByCampaign(sourceId));
    invalidate("supports:");
    setPeriodNotice(notice);
    setPendingSelection(0);
    router.push(wizardHref(copy.id, 2), { scroll: false });
  };

  const startFlow = (c: Pick<CampaignResponse, "id" | "status">) => {
    setFlowCampaignId(c.id);
    return flow.start(c);
  };

  const openPeriodChange = reservationCount > 0 ? () => setPeriodOpen(true) : undefined;

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
  } else if (
    current &&
    flowState.phase === "idle" &&
    current.campaign.status !== "BROUILLON" &&
    current.campaign.status !== "PENDING_AI_CHECK"
  ) {
    body = <AlreadySubmitted campaign={current.campaign} />;
  } else {
    const campaign = current?.campaign ?? null;
    const reservations = current?.reservations ?? [];
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
                onChangePeriod={openPeriodChange}
                headingRef={headingRef}
              />
            ) : step === 2 ? (
              <StepScreens
                campaign={campaign}
                reservations={reservations}
                onReserved={onReserved}
                onBack={() => goTo(1)}
                onNext={() => goTo(3)}
                onChangePeriod={openPeriodChange}
                notice={periodNotice}
                onDismissNotice={() => setPeriodNotice(null)}
                onPendingChange={setPendingSelection}
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

        {campaign && reservationCount > 0 && campaign.status === "BROUILLON" ? (
          <ChangePeriodDialog
            open={periodOpen}
            onOpenChange={setPeriodOpen}
            campaign={campaign}
            reservations={reservations}
            onChanged={onPeriodChanged}
          />
        ) : null}
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
            ? "Trois étapes : les détails, les Porteurs, puis la vérification et l'envoi en modération."
            : undefined
        }
        secondaryActions={
          showChrome ? (
            // Flush with the page gutter on phones, where the header stacks.
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
