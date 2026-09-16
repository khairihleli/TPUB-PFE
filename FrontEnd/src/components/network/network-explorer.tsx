"use client";

import { Box, Layers3, ListChecks, MapPinned, Rows3, X } from "lucide-react";
import { Dialog as RadixDialog } from "radix-ui";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadNetworkCatalogue, type NetworkCatalogue } from "@/components/espace/espace-data";
import { useMarkOnboardingVisit } from "@/components/espace/onboarding-storage";
import { NetworkMap } from "@/components/map";
import { createDefaultSchedule } from "@/components/network/booking-plan";
import { ExplorerHeader } from "@/components/network/explorer-header";
import { ExplorerSidePanel, type PanelTab } from "@/components/network/explorer-side-panel";
import type { BookingState } from "@/components/network/porteur-configurator";
import { SelectionBookingDialog } from "@/components/network/selection-booking-dialog";
import { StudioSheet } from "@/components/network/studio-sheet";
import { useExplorerUrlState } from "@/components/network/use-explorer-url-state";
import { useSession } from "@/components/shell/session-provider";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { useStickyBarOffset } from "@/components/ui/use-sticky-bar-offset";
import { campaignsApi } from "@/lib/api/endpoints";
import { cx } from "@/lib/cx";
import { todayISO } from "@/lib/format";
import { DEFAULT_FILTERS, filterSupports, type SupportFilters } from "@/lib/network/filters";
import { isBookable } from "@/lib/network/porteur";
import {
  EMPTY_SELECTION,
  pruneSelection,
  summarizeSelection,
  type Selection,
} from "@/lib/network/selection";
import { fetchCached, resourceKeys } from "@/lib/resource-cache";
import { useDismissible } from "@/lib/use-dismissible";
import { useResource } from "@/lib/use-resource";

/** Map + side panel height: fills the viewport under the app top bar and the title strip. */
const WORKSPACE_HEIGHT = "clamp(30rem, calc(100dvh - 15.5rem), 64rem)";
/** Same height as a Tailwind class (skeleton, side panel). */
const WORKSPACE_H = "h-[clamp(30rem,calc(100dvh_-_15.5rem),64rem)]";

/** First-visit hint (IA-13), dismissed per user. */
export const STUDIO_HINT_KEY = "hint:studio";
export const STUDIO_HINT_TEXT = "Touchez un Porteur pour le voir en 3D et le réserver";

/**
 * `/espace/reseau` — network explorer: map of Tunisia (zones, Porteurs, tools), side panel
 * (Porteurs · Zones · Sélection), Studio 3D sheet with configurator, selection booking.
 */
export function NetworkExplorer() {
  const { user } = useSession();
  useMarkOnboardingVisit(user.userId, "visitedNetwork");
  const catalogue = useResource("espace:reseau", loadNetworkCatalogue);

  return catalogue.data ? (
    catalogue.data.zones.length === 0 ? (
      <>
        <ExplorerHeader zoneCount={0} porteurCount={0} bookableCount={0} />
        <EmptyState
          icon={<MapPinned />}
          title="Aucune zone ouverte pour le moment."
          description="La carte des zones s'affichera ici dès que les premières zones seront ouvertes."
          action={
            <Button variant="secondary" onClick={catalogue.reload} loading={catalogue.loading}>
              Actualiser
            </Button>
          }
        />
      </>
    ) : (
      <ExplorerWorkspace data={catalogue.data} refreshing={catalogue.loading} />
    )
  ) : catalogue.error ? (
    <>
      <ExplorerHeader zoneCount={0} porteurCount={0} bookableCount={0} />
      <ErrorState error={catalogue.error} onRetry={catalogue.reload} />
    </>
  ) : (
    <ExplorerSkeleton />
  );
}

export function ExplorerSkeleton() {
  return (
    <LoadingRegion label="Chargement du réseau…" className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-56 rounded-control" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-32 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_22.5rem]">
        <Skeleton className={cx("rounded-panel", WORKSPACE_H)} />
        <Skeleton className={cx("hidden rounded-panel lg:block", WORKSPACE_H)} />
      </div>
    </LoadingRegion>
  );
}

/** Sets a value, forcing a change event when the same value is requested again. */
function useRetrigger() {
  const [value, setValue] = useState<number | null>(null);
  const frame = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  const trigger = useCallback((next: number) => {
    setValue(null);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setValue(next);
    });
  }, []);
  return [value, trigger] as const;
}

/** Below lg (where the floating bottom bar is shown). False without matchMedia (tests, SSR). */
function useBelowLg(): boolean {
  const [below, setBelow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 63.99rem)");
    const apply = () => setBelow(query.matches);
    apply();
    query.addEventListener?.("change", apply);
    return () => query.removeEventListener?.("change", apply);
  }, []);
  return below;
}

function ExplorerWorkspace({ data, refreshing }: { data: NetworkCatalogue; refreshing: boolean }) {
  const { zones, supports } = data;
  const { state: url, update } = useExplorerUrlState();
  const [today] = useState(() => todayISO());

  const [selection, setSelectionState] = useState<Selection>(EMPTY_SELECTION);
  const [filters, setFilters] = useState<SupportFilters>(DEFAULT_FILTERS);
  const [tab, setTab] = useState<PanelTab>("porteurs");
  const [panelOpen, setPanelOpen] = useState(true);
  const [mobileSheet, setMobileSheet] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [focusSupportId, focusSupport] = useRetrigger();
  const [focusZoneId, focusZone] = useRetrigger();
  const [announcement, setAnnouncement] = useState("");
  const [booking, setBooking] = useState<BookingState>(() => ({
    schedule: createDefaultSchedule(today),
    campaignId: null,
    offPeriod: false,
    scheduleSource: "default",
  }));
  const onBookingChange = useCallback(
    (patch: Partial<BookingState>) => setBooking((b) => ({ ...b, ...patch })),
    [],
  );
  const [hintDismissed, dismissHint] = useDismissible(STUDIO_HINT_KEY);

  // Floating bottom bar (below lg): toasts sit above it (IA-11).
  const belowLg = useBelowLg();
  const bottomBarRef = useRef<HTMLDivElement>(null);
  useStickyBarOffset(bottomBarRef, belowLg);

  // Campaigns are only needed once a booking surface opens.
  const [needCampaigns, setNeedCampaigns] = useState(url.porteurId !== null);
  const campaigns = useResource(needCampaigns ? "network:campaigns-mine" : null, (signal) =>
    // Fresh drafts (staleTime 0), sharing any in-flight /mine (nav badges) instead of a duplicate.
    fetchCached(resourceKeys.campaignsMine, (s) => campaignsApi.mine({ signal: s }), {
      signal,
      staleTime: 0,
    }),
  );

  // ?zone= deep link: frame it once the map is ready (the map re-applies on change).
  const initialZone = useRef(url.zoneId);
  useEffect(() => {
    if (initialZone.current !== null) focusZone(initialZone.current);
  }, [focusZone]);

  // Keep the selection consistent after a catalogue reload.
  useEffect(() => {
    setSelectionState((sel) => pruneSelection(sel, supports, zones));
  }, [supports, zones]);

  const visibleSupports = useMemo(() => filterSupports(supports, filters), [supports, filters]);
  const bookableCount = useMemo(() => supports.filter((s) => isBookable(s)).length, [supports]);
  const summary = useMemo(
    () => summarizeSelection(selection, supports, zones),
    [selection, supports, zones],
  );

  const announce = useCallback((message: string) => {
    setAnnouncement("");
    window.setTimeout(() => setAnnouncement(message), 30);
  }, []);

  const setSelection = useCallback(
    (next: Selection, message?: string) => {
      setSelectionState(next);
      if (message) announce(message);
    },
    [announce],
  );

  const openPorteur = useCallback(
    (supportId: number) => {
      setNeedCampaigns(true);
      setMobileSheet(false);
      if (!hintDismissed) dismissHint();
      update({ porteurId: supportId });
    },
    [update, hintDismissed, dismissHint],
  );

  /** One close path for the Studio: Escape, « Fermer le studio », « Revenir à la carte ». */
  const closeStudio = useCallback(() => update({ porteurId: null }), [update]);

  const locate = useCallback(
    (supportId: number) => {
      setMobileSheet(false);
      if (url.porteurId !== null) closeStudio();
      setHighlightId(supportId);
      focusSupport(supportId);
    },
    [focusSupport, closeStudio, url.porteurId],
  );

  const onFocusZone = useCallback(
    (zoneId: number) => {
      update({ zoneId });
      focusZone(zoneId);
      setMobileSheet(false);
      const zone = zones.find((z) => z.id === zoneId);
      if (zone) announce(`Carte cadrée sur la zone ${zone.name}.`);
    },
    [update, focusZone, zones, announce],
  );

  const toggleSelect = useCallback(
    (supportId: number) => {
      const s = supports.find((x) => x.id === supportId);
      if (!s) return;
      if (selection.supportIds.includes(supportId)) {
        setSelection(
          {
            zoneIds: selection.zoneIds.filter((id) => id !== s.zoneId),
            supportIds: selection.supportIds.filter((id) => id !== supportId),
          },
          `${s.name} retiré de la sélection.`,
        );
      } else if (isBookable(s)) {
        setSelection(
          { zoneIds: selection.zoneIds, supportIds: [...selection.supportIds, supportId] },
          `${s.name} ajouté à la sélection.`,
        );
      }
    },
    [selection, supports, setSelection],
  );

  const openBooking = useCallback(() => {
    setNeedCampaigns(true);
    setMobileSheet(false);
    setBookingOpen(true);
  }, []);

  const panelProps = {
    zones,
    supports,
    visibleSupports,
    filters,
    onFiltersChange: setFilters,
    tab,
    onTabChange: setTab,
    selection,
    onSelectionChange: setSelection,
    highlightId,
    onHover: setHighlightId,
    activeZoneId: url.zoneId,
    onFocusZone,
    onOpen: openPorteur,
    onLocate: locate,
    onBookSelection: openBooking,
  };

  const selectionCount = summary.supportCount;

  return (
    <div aria-busy={refreshing || undefined} className="min-w-0 pb-24 lg:pb-0">
      <ExplorerHeader
        zoneCount={zones.length}
        porteurCount={supports.length}
        bookableCount={bookableCount}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((v) => !v)}
      />

      {hintDismissed ? null : (
        <div
          role="note"
          data-hint="studio"
          className="mb-4 flex items-center gap-3 rounded-card border border-blue-line bg-blue-soft py-2 pr-2 pl-3.5 text-[0.8125rem] text-ink-soft"
        >
          <Box aria-hidden="true" className="size-4 shrink-0 text-brand-blue-text" />
          <p className="min-w-0 flex-1">
            {STUDIO_HINT_TEXT}
            <span className="max-sm:hidden">
              {" "}
              — ou utilisez le bouton « Ouvrir le Studio 3D » de la liste.
            </span>
          </p>
          <button
            type="button"
            onClick={dismissHint}
            aria-label="Masquer l'astuce"
            className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-overlay-hover hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-brand-blue-text sm:size-9"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      )}

      <div
        className={cx(
          "grid grid-cols-[minmax(0,1fr)] gap-4",
          panelOpen ? "lg:grid-cols-[minmax(0,1fr)_22.5rem]" : "lg:grid-cols-[minmax(0,1fr)]",
        )}
      >
        <div className="relative min-w-0">
          <NetworkMap
            zones={zones}
            supports={supports}
            mode="select"
            selection={selection}
            onSelectionChange={(next) => setSelectionState(next)}
            focusSupportId={focusSupportId}
            focusZoneId={focusZoneId}
            onOpenPorteur={openPorteur}
            activeZoneId={url.zoneId}
            onZoneClick={(zoneId) => update({ zoneId })}
            highlightSupportId={highlightId}
            onHoverSupport={setHighlightId}
            basemap={url.basemap}
            onBasemapChange={(basemap) => update({ basemap })}
            viewMode={url.view}
            onViewModeChange={(view) => update({ view })}
            filters={filters}
            onFiltersChange={setFilters}
            clusterPorteurs={url.regrouper}
            onClusterPorteursChange={(regrouper) => update({ regrouper })}
            showListTool={false}
            height={WORKSPACE_HEIGHT}
            ariaLabel="Carte du réseau TPUB"
          />
        </div>

        <aside
          id="reseau-panneau"
          aria-label="Panneau du réseau"
          hidden={!panelOpen}
          className={cx(
            "hidden min-h-0 min-w-0 flex-col overflow-hidden rounded-panel border border-line bg-surface-2 lg:flex",
            WORKSPACE_H,
          )}
        >
          <ExplorerSidePanel {...panelProps} />
          <SelectionFooter
            label={summary.label}
            count={selectionCount}
            onBook={openBooking}
            onShow={() => setTab("selection")}
          />
        </aside>
      </div>

      {/* Mobile: floating bottom bar (the app tab bar is hidden on this route) + bottom sheet */}
      <div
        ref={bottomBarRef}
        data-explorer-bottom-bar=""
        className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-(--z-sticky) flex items-center gap-1 rounded-full border border-line-strong bg-surface-2 p-1.5 shadow-card lg:hidden"
      >
        <MobileBarButton
          icon={<Rows3 />}
          label="Porteurs"
          count={visibleSupports.length}
          onClick={() => {
            setTab("porteurs");
            setMobileSheet(true);
          }}
        />
        <MobileBarButton
          icon={<Layers3 />}
          label="Zones"
          count={zones.length}
          onClick={() => {
            setTab("zones");
            setMobileSheet(true);
          }}
        />
        <MobileBarButton
          icon={<ListChecks />}
          label="Sélection"
          count={selectionCount}
          highlight={selectionCount > 0}
          onClick={() => {
            setTab("selection");
            setMobileSheet(true);
          }}
        />
      </div>

      <RadixDialog.Root open={mobileSheet} onOpenChange={setMobileSheet}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="fixed inset-0 z-(--z-modal) animate-fade-in bg-scrim lg:hidden" />
          <RadixDialog.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-(--z-modal) flex h-[82dvh] animate-panel-in flex-col overflow-hidden rounded-t-panel border-t border-line-strong bg-surface pb-[env(safe-area-inset-bottom)] shadow-card focus:outline-none lg:hidden"
          >
            <span
              aria-hidden="true"
              className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong"
            />
            <div className="flex items-center justify-between px-4 pt-2">
              <RadixDialog.Title className="font-display text-base font-semibold text-ink-strong">
                Réseau
              </RadixDialog.Title>
              <RadixDialog.Close className="min-h-touch rounded-full px-3 font-label text-[0.8125rem] font-semibold text-brand-blue-text hover:bg-overlay-hover focus-visible:outline-2 focus-visible:outline-brand-blue-text">
                Voir la carte
              </RadixDialog.Close>
            </div>
            <ExplorerSidePanel {...panelProps} />
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>

      <StudioSheet
        supportId={url.porteurId}
        supports={supports}
        today={today}
        booking={booking}
        onBookingChange={onBookingChange}
        campaigns={campaigns}
        repere={url.repere}
        selectedIds={selection.supportIds}
        onToggleSelect={toggleSelect}
        onLocate={locate}
        onClose={closeStudio}
      />

      <SelectionBookingDialog
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        supports={summary.supports}
        today={today}
        booking={booking}
        onBookingChange={onBookingChange}
        campaigns={campaigns}
      />

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function SelectionFooter({
  label,
  count,
  onBook,
  onShow,
}: {
  label: string;
  count: number;
  onBook: () => void;
  onShow: () => void;
}) {
  return (
    <div className="shrink-0 border-t border-line bg-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onShow}
          className="min-w-0 flex-1 cursor-pointer rounded-control text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text"
        >
          <span className="block font-label text-[0.75rem] font-medium text-muted">Sélection</span>
          <span
            className={cx(
              "block truncate text-[0.8125rem] font-semibold",
              count > 0 ? "text-ink-strong" : "text-muted",
            )}
          >
            {label}
          </span>
        </button>
        <Button
          variant="primary"
          size="sm"
          onClick={onBook}
          disabledReason={count === 0 ? "Sélectionnez au moins un Porteur" : null}
          onDisabledClick={onShow}
        >
          Réserver la sélection
        </Button>
      </div>
    </div>
  );
}

function MobileBarButton({
  icon,
  label,
  count,
  highlight = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  highlight?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className={cx(
        "inline-flex min-h-touch flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2 font-label text-[0.8125rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand-blue-text [&_svg]:size-4",
        highlight ? "bg-brand-blue text-on-brand" : "text-ink-soft hover:bg-overlay-hover",
      )}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
      <span
        className={cx(
          "rounded-full px-1.5 text-[0.75rem] tabular",
          highlight ? "bg-overlay-strong" : "bg-overlay-hover text-muted",
        )}
      >
        {count}
      </span>
    </button>
  );
}
