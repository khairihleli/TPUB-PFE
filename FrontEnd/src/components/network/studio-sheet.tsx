"use client";

import { Box, Check, ChevronUp, Hand, LocateFixed, Plus, SearchX, X } from "lucide-react";
import { Dialog as RadixDialog } from "radix-ui";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";

import { useStudioCreative } from "@/components/network/creative-preview-import";
import { PorteurConfigurator, type BookingState } from "@/components/network/porteur-configurator";
import {
  PorteurStudio,
  type CameraPresetId,
  type StudioFace,
  type TimeOfDay,
} from "@/components/porteur3d";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { supportsApi } from "@/lib/api/endpoints";
import { errorCategory } from "@/lib/api/errors";
import type { CampaignResponse, ReservationResponse, SupportResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import {
  bookingBlockReason,
  isBookable,
  PORTEUR_TYPES,
  resolvePorteurType,
} from "@/lib/network/porteur";
import { useResource, type ResourceState } from "@/lib/use-resource";

export interface StudioSheetProps {
  /** `?porteur=` id; null = closed. */
  supportId: number | null;
  supports: readonly SupportResponse[];
  today: string;
  booking: BookingState;
  onBookingChange: (patch: Partial<BookingState>) => void;
  campaigns: ResourceState<CampaignResponse[]>;
  /** `?repere=1` passthrough. */
  repere: boolean;
  selectedIds: readonly number[];
  onToggleSelect: (supportId: number) => void;
  onLocate: (supportId: number) => void;
  /** Single close path: Escape, the close button, « Revenir à la carte » (browser Back = URL). */
  onClose: () => void;
  onReserved?: (reservation: ReservationResponse, campaign: CampaignResponse) => void;
}

/**
 * Studio sheet (spec §5): large right drawer on desktop, full-screen dialog on mobile. Left the
 * live 3D Porteur, right the configurator (campagne, créneau, aperçu, identité → réserver).
 * Opaque surfaces only over WebGL (no backdrop blur).
 */
export function StudioSheet({ supportId, onClose, ...rest }: StudioSheetProps) {
  return (
    <RadixDialog.Root
      open={supportId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-(--z-modal) animate-fade-in bg-scrim" />
        <RadixDialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            // Focus the dialog itself: the title is announced, no control is pre-activated.
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
          className={cx(
            "fixed inset-0 z-(--z-modal) flex animate-panel-in flex-col overflow-hidden bg-bg shadow-card focus:outline-none",
            "lg:inset-y-3 lg:right-3 lg:left-auto lg:w-[min(78rem,calc(100vw-1.5rem))] lg:rounded-panel lg:border lg:border-line-strong",
          )}
          data-studio-sheet=""
        >
          {supportId !== null ? (
            <StudioSheetBody key={supportId} supportId={supportId} onClose={onClose} {...rest} />
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function StudioSheetBody({
  supportId,
  supports,
  onClose,
  ...rest
}: Omit<StudioSheetProps, "supportId"> & { supportId: number }) {
  const known = supports.find((s) => s.id === supportId) ?? null;
  const fallback = useResource(known ? null : `network:support:${supportId}`, (signal) =>
    supportsApi.get(supportId, { signal }),
  );
  const support = known ?? fallback.data ?? null;

  if (!support) {
    return (
      <>
        <SheetHeader title="Studio 3D" />
        <div className="flex flex-1 items-center justify-center p-6">
          {fallback.error ? (
            errorCategory(fallback.error) === "not-found" ? (
              <EmptyState
                icon={<SearchX />}
                title="Porteur introuvable"
                description="Ce Porteur n'existe pas ou n'est plus proposé sur le réseau."
                action={
                  <Button variant="primary" onClick={onClose}>
                    Revenir à la carte
                  </Button>
                }
              />
            ) : (
              <ErrorState error={fallback.error} onRetry={fallback.reload} />
            )
          ) : (
            <LoadingRegion label="Chargement du Porteur…" className="grid w-full max-w-3xl gap-4">
              <Skeleton className="aspect-[16/10] w-full rounded-panel" />
              <Skeleton className="h-24 w-full rounded-card" />
            </LoadingRegion>
          )}
        </div>
      </>
    );
  }
  return <StudioWorkspace support={support} {...rest} />;
}

function SheetHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="relative flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
      <span aria-hidden="true" className="hairline-tricolor absolute inset-x-0 top-0 opacity-80" />
      <span
        aria-hidden="true"
        className="hidden size-10 shrink-0 items-center justify-center rounded-control border border-orange-line bg-orange-soft text-brand-orange-text sm:inline-flex"
      >
        <Box className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-label text-[0.75rem] font-semibold text-brand-orange-text">Studio 3D</p>
        <RadixDialog.Title
          title={title}
          className="truncate font-display text-[1.0625rem] font-semibold text-ink-strong sm:text-lg"
        >
          {title}
        </RadixDialog.Title>
        {subtitle ? (
          <p title={subtitle} className="truncate text-[0.75rem] text-muted">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions}
      <RadixDialog.Close
        aria-label="Fermer le studio"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors hover:bg-overlay-hover hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-brand-blue-text"
      >
        <X aria-hidden="true" className="size-5" />
      </RadixDialog.Close>
    </header>
  );
}

/**
 * « Ajouter à la sélection » toggle: stable label, aria-pressed and a checked visual (no label
 * swap, FFA-22); secondary level (VD-08).
 */
export function SelectionToggle({
  support,
  selected,
  onToggle,
}: {
  support: SupportResponse;
  selected: boolean;
  onToggle: () => void;
}) {
  const block = bookingBlockReason(support);
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-pressed={selected}
      disabledReason={!selected && !isBookable(support) ? block : null}
      iconLeft={selected ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
      onClick={onToggle}
      className={cx(selected && "border-brand-blue-text/60 bg-blue-soft text-ink-strong")}
    >
      Ajouter à la sélection
    </Button>
  );
}

/** True once the element has scrolled out above its scroll container (IntersectionObserver). */
function useScrolledPast(target: RefObject<HTMLElement | null>) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = target.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);
  return past;
}

/**
 * Mobile preview (below md, FFA-09): the canvas does not capture touches until « Toucher pour
 * explorer en 3D » (page scroll keeps working, `touch-action: pan-y`); « Terminer » gives the
 * scroll back. The preview is capped at 38vh and an 80 px thumbnail bar replaces it once
 * scrolled past.
 */
function StudioWorkspace({
  support,
  today,
  booking,
  onBookingChange,
  campaigns,
  repere,
  selectedIds,
  onToggleSelect,
  onLocate,
  onReserved,
}: Omit<StudioSheetProps, "supportId" | "supports" | "onClose"> & { support: SupportResponse }) {
  const { type, inferred } = resolvePorteurType(support);
  const [view, setView] = useState<CameraPresetId>("orbite");
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("jour");
  const [face, setFace] = useState<StudioFace>("all");
  const [viewRequest, setViewRequest] = useState(0);
  const [exploring, setExploring] = useState(false);
  const creative = useStudioCreative(
    campaigns.data?.find((c) => c.id === booking.campaignId) ?? null,
  );
  const selected = selectedIds.includes(support.id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const scrolledPast = useScrolledPast(previewRef);
  const meta = PORTEUR_TYPES[type];

  // Leaving the preview (scroll) ends the 3D exploration mode.
  useEffect(() => {
    if (scrolledPast) setExploring(false);
  }, [scrolledPast]);

  const toolbar = (
    <>
      <Button
        variant="ghost"
        size="sm"
        iconLeft={<LocateFixed aria-hidden="true" />}
        onClick={() => onLocate(support.id)}
      >
        Localiser
      </Button>
      <SelectionToggle
        support={support}
        selected={selected}
        onToggle={() => onToggleSelect(support.id)}
      />
    </>
  );

  return (
    <>
      <SheetHeader
        title={support.name}
        subtitle={`${support.zoneName} · Type ${type} · ${meta.name}${inferred ? " (typologie estimée)" : ""}`}
        actions={<div className="hidden items-center gap-1.5 md:flex">{toolbar}</div>}
      />
      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain lg:grid lg:grid-cols-[minmax(0,1.12fr)_minmax(24rem,0.88fr)] lg:overflow-hidden"
      >
        {scrolledPast ? (
          <div
            data-studio-thumbnail=""
            className="sticky top-0 z-20 flex h-20 items-center gap-3 border-b border-line bg-surface px-4 md:hidden"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={meta.image}
              alt=""
              className="size-14 shrink-0 rounded-control border border-line bg-bg object-contain"
            />
            <p className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold text-ink-strong">
              {support.name}
            </p>
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<ChevronUp aria-hidden="true" />}
              onClick={() => scrollRef.current?.scrollTo?.({ top: 0, behavior: "smooth" })}
            >
              Aperçu 3D
            </Button>
          </div>
        ) : null}
        <div className="relative p-3 sm:p-4 lg:h-full lg:min-h-0 lg:pr-2">
          <div
            ref={previewRef}
            data-studio-preview=""
            data-exploring={exploring ? "" : undefined}
            className={cx(
              "relative lg:h-full lg:min-h-0",
              exploring ? "max-md:touch-none" : "max-md:touch-pan-y",
            )}
          >
            <PorteurStudio
              support={support}
              type={type}
              creative={
                creative.creative
                  ? { url: creative.creative.url, kind: creative.creative.kind }
                  : null
              }
              face={face}
              timeOfDay={timeOfDay}
              view={view}
              viewRequest={viewRequest}
              repere={repere}
              onViewChange={setView}
              className="max-md:aspect-auto! max-md:h-[38vh] max-md:min-h-[14rem] lg:h-full lg:min-h-0 lg:aspect-auto!"
            />
            {exploring ? (
              <button
                type="button"
                onClick={() => setExploring(false)}
                className="absolute top-3 right-3 z-40 inline-flex min-h-touch items-center gap-1.5 rounded-full border border-line-strong bg-surface-2 px-4 font-label text-[0.8125rem] font-semibold text-ink-strong shadow-card focus-visible:outline-2 focus-visible:outline-brand-blue-text md:hidden"
              >
                <Check aria-hidden="true" className="size-4" />
                Terminer
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setExploring(true)}
                data-studio-touch-overlay=""
                // Centered: the bottom corners belong to the Studio's view chip and reset button.
                className="absolute inset-0 z-40 flex touch-pan-y items-center justify-center rounded-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text md:hidden"
              >
                <span className="inline-flex min-h-touch items-center gap-2 rounded-full border border-line-strong bg-surface-2 px-4 font-label text-[0.8125rem] font-semibold text-ink-strong shadow-card">
                  <Hand aria-hidden="true" className="size-4 text-brand-blue-text" />
                  Toucher pour explorer en 3D
                </span>
              </button>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 md:hidden">{toolbar}</div>
        </div>
        <div className="lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:border-l lg:border-line">
          <PorteurConfigurator
            support={support}
            today={today}
            booking={booking}
            onBookingChange={onBookingChange}
            campaigns={campaigns}
            creative={creative}
            onReserved={onReserved}
            preview={{
              view,
              onViewChange: setView,
              timeOfDay,
              onTimeOfDayChange: setTimeOfDay,
              face,
              onFaceChange: setFace,
              onResetView: () => setViewRequest((n) => n + 1),
            }}
          />
        </div>
      </div>
    </>
  );
}
