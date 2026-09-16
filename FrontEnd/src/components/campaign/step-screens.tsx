"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  CalendarClock,
  Check,
  CircleAlert,
  CircleCheck,
  List,
  Lock,
  Map as MapIcon,
  MapPinned,
  Search,
} from "lucide-react";
import Link from "next/link";
import { type Ref, useEffect, useMemo, useRef, useState } from "react";

import { campaignReference } from "@/components/campaign/campaign-actions";
import {
  activeReservations,
  joinReservations,
  loadScreenCatalogue,
  type NetworkLookups,
} from "@/components/campaign/campaign-data";
import { hasSchedule } from "@/components/campaign/campaign-schema";
import { SUPPORT_TYPE_ICON } from "@/components/campaign/campaign-ui";
import type { PeriodChangeNotice } from "@/components/campaign/step-details";
import { StepScreensMap } from "@/components/campaign/step-screens-map";
import { WIZARD_STICKY_VAR, WizardStepHeading } from "@/components/campaign/wizard-chrome";
import { WizardPorteurDialog } from "@/components/campaign/wizard-porteur-dialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { EstimateTag } from "@/components/ui/estimate-tag";
import { Input } from "@/components/ui/field";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { useStickyBarOffset } from "@/components/ui/use-sticky-bar-offset";
import { BOOKING_CONSEQUENCE, ESTIMATE_COST_RULE } from "@/content/glossary";
import { CONTACT } from "@/content/site";
import { reservationsApi } from "@/lib/api/endpoints";
import { isReservationConflictError, presentError } from "@/lib/api/errors";
import type {
  CampaignResponse,
  ReservationResponse,
  ReservationStatus,
  SupportAvailabilitySlot,
  SupportResponse,
} from "@/lib/api/types";
import { SUPPORT_TYPE_LABEL } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { useUnsavedChangesGuard } from "@/lib/forms/unsaved-guard";
import {
  formatCount,
  formatDate,
  formatDateRange,
  formatEstimate,
  formatTimeRange,
  toApiTime,
  todayISO,
} from "@/lib/format";
import { conflictingSlots } from "@/lib/network/availability";
import { bookingBlockReason } from "@/lib/network/porteur";
import {
  type SupportAvailabilityEntry,
  useSupportsAvailability,
} from "@/lib/network/use-supports-availability";
import { invalidate, resourceKeys } from "@/lib/resource-cache";
import { routes } from "@/lib/routes";
import { normalizeSearch } from "@/lib/search";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useResource } from "@/lib/use-resource";

export const CONFLICT_MESSAGE = "Ce Porteur est déjà réservé sur votre période.";
export const SELECT_AT_LEAST_ONE = "Sélectionnez au moins un Porteur";
const PENDING_GUARD_MESSAGE =
  "Les Porteurs sélectionnés ne sont pas encore réservés : la sélection sera perdue.";

type Outcome = { kind: "conflict" | "error"; message: string };

/** Availability state of one Porteur card for the campaign period. */
export type CardState = "booked" | "free" | "loading" | "error" | "busy" | "blocked";

const STATE_RANK: Record<CardState, number> = {
  booked: 0,
  free: 1,
  loading: 2,
  error: 3,
  busy: 4,
  blocked: 5,
};

export interface ScreenRow {
  screen: SupportResponse;
  state: CardState;
  /** First conflicting slot when busy. */
  conflict: SupportAvailabilitySlot | null;
  reservationStatus: ReservationStatus | null;
}

/** Card state per Porteur: own créneau, not bookable, then availability on the period. */
export function screenRows(
  screens: readonly SupportResponse[],
  booked: ReadonlyMap<number, ReservationStatus>,
  availability: ReadonlyMap<number, SupportAvailabilityEntry>,
  period: { start: string; end: string } | null,
): ScreenRow[] {
  return screens.map((screen) => {
    const own = booked.get(screen.id) ?? null;
    if (own) return { screen, state: "booked", conflict: null, reservationStatus: own };
    if (bookingBlockReason(screen)) {
      return { screen, state: "blocked", conflict: null, reservationStatus: null };
    }
    const entry = availability.get(screen.id);
    if (!period || !entry)
      return { screen, state: "loading", conflict: null, reservationStatus: null };
    if (entry.state === "busy") {
      const conflict = conflictingSlots(entry.slots, period.start, period.end)[0] ?? null;
      return { screen, state: "busy", conflict, reservationStatus: null };
    }
    return { screen, state: entry.state, conflict: null, reservationStatus: null };
  });
}

/** Free first, busy and non-bookable last (own créneaux on top), then by name. */
export function sortRows(rows: readonly ScreenRow[]): ScreenRow[] {
  return [...rows].sort(
    (a, b) =>
      STATE_RANK[a.state] - STATE_RANK[b.state] || a.screen.name.localeCompare(b.screen.name, "fr"),
  );
}

export function matchesQuery(screen: SupportResponse, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  return normalizeSearch(`${screen.name} ${screen.address ?? ""} ${screen.zoneName}`).includes(q);
}

export function reservedRangeLabel(slot: Pick<SupportAvailabilitySlot, "startDate" | "endDate">) {
  return `Réservé du ${formatDate(slot.startDate, "medium")} au ${formatDate(slot.endDate, "medium")}`;
}

export interface StepScreensProps {
  campaign: CampaignResponse;
  reservations: readonly ReservationResponse[];
  onReserved: (created: ReservationResponse[]) => void;
  onBack: () => void;
  onNext: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
  /** « Changer de période… » for drafts with créneaux (dates are locked). */
  onChangePeriod?: () => void;
  /** Result of a period change, shown when it concerns this campaign. */
  notice?: PeriodChangeNotice | null;
  onDismissNotice?: () => void;
  /** Number of selected Porteurs not booked yet (the wizard blocks step 3 while > 0). */
  onPendingChange?: (count: number) => void;
}

function releaseMailto(
  campaign: CampaignResponse,
  r: { id: number; supportName: string; startDate: string; endDate: string },
) {
  const ref = campaignReference(campaign.id);
  const subject = `Libérer un créneau — ${ref}`;
  const body = [
    "Bonjour,",
    "",
    `Je souhaite libérer le créneau n° ${r.id} (${r.supportName}, ${formatDateRange(r.startDate, r.endDate, "medium")}) de la campagne ${ref} « ${campaign.name} ».`,
    "",
    "Merci.",
  ].join("\n");
  return `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function ScreenCard({
  row,
  checked,
  outcome,
  pending,
  disabled,
  onToggle,
  onChangePeriod,
}: {
  row: ScreenRow;
  checked: boolean;
  outcome?: Outcome;
  pending: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
  onChangePeriod?: () => void;
}) {
  const { screen, state, conflict } = row;
  const Icon = SUPPORT_TYPE_ICON[screen.supportType];
  const statusId = `porteur-${screen.id}-etat`;
  const booked = state === "booked";
  const unavailable = state === "busy" || state === "blocked";
  const inputDisabled = disabled || (unavailable && !checked);

  const statusLine =
    state === "booked" ? null : state === "free" ? (
      <span className="text-success">Disponible sur votre période</span>
    ) : state === "busy" ? (
      <span className="text-warning">
        {conflict ? reservedRangeLabel(conflict) : "Réservé sur votre période"}
      </span>
    ) : state === "blocked" ? (
      <span className="text-muted">{bookingBlockReason(screen)}</span>
    ) : state === "error" ? (
      <span className="text-muted">Disponibilité non vérifiée</span>
    ) : (
      <span className="text-muted">Vérification de la disponibilité…</span>
    );

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden="true"
          className={cx(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-control border transition-colors",
            booked
              ? "border-success/30 bg-success/12 text-success"
              : checked
                ? "border-brand-blue-text/50 bg-blue-soft text-brand-blue-text"
                : "border-line bg-surface-2 text-muted",
          )}
        >
          <Icon className="size-[18px]" />
        </span>
        {booked ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/12 px-2 py-0.5 text-[0.75rem] font-semibold text-success">
            <Lock aria-hidden="true" className="size-3" />
            {row.reservationStatus === "CONFIRMEE"
              ? "Confirmé"
              : "Bloqué · en attente de décision TPUB"}
          </span>
        ) : checked ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-line bg-blue-soft px-2 py-0.5 text-[0.75rem] font-semibold text-ink-strong">
            <Check aria-hidden="true" className="size-3" />À réserver
          </span>
        ) : (
          <span
            aria-hidden="true"
            className={cx(
              "inline-flex size-6 items-center justify-center rounded-full border border-line-strong",
              unavailable && "opacity-50",
            )}
          />
        )}
      </div>
      <p className="mt-3 font-label text-[0.9375rem] leading-snug font-semibold break-words text-ink-strong">
        {screen.name}
      </p>
      <p className="mt-1 text-[0.8125rem] text-muted">
        {SUPPORT_TYPE_LABEL[screen.supportType]}
        {screen.address ? ` · ${screen.address}` : ""}
      </p>
      <p id={statusId} className="mt-2 text-[0.8125rem] leading-snug">
        {pending ? <span className="text-brand-blue-text">Réservation en cours…</span> : statusLine}
      </p>
    </>
  );

  const frame = cx(
    "relative flex h-full flex-col rounded-card border transition-[border-color,background-color] duration-200",
    booked
      ? "border-success/25 bg-success/[0.04]"
      : outcome
        ? "border-danger/40 bg-danger/[0.04]"
        : checked
          ? "border-brand-blue-text/60 bg-blue-soft"
          : unavailable
            ? "border-line bg-surface opacity-75"
            : "border-line bg-surface hover:border-line-strong",
  );

  return (
    <div className={frame}>
      {booked ? (
        <div className="p-4">{body}</div>
      ) : (
        <label
          className={cx(
            "flex-1 rounded-card p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-blue-text",
            inputDisabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
        >
          <input
            type="checkbox"
            className="sr-only"
            checked={checked}
            disabled={inputDisabled}
            onChange={(e) => onToggle(e.target.checked)}
            aria-describedby={statusId}
          />
          <span className="sr-only">Sélectionner le Porteur </span>
          {body}
        </label>
      )}
      {outcome ? (
        <div className="mx-4 mb-3 flex flex-col items-start gap-1.5 text-[0.8125rem] leading-snug text-danger">
          <p className="flex gap-1.5">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {outcome.message}
          </p>
          {outcome.kind === "conflict" && onChangePeriod ? (
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<CalendarClock aria-hidden="true" />}
              onClick={onChangePeriod}
            >
              Changer de période…
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="mt-auto flex items-center justify-end border-t border-line px-2 py-1">
        <Link
          href={routes.espace.network({ porteur: screen.id })}
          className="inline-flex min-h-touch items-center gap-1.5 rounded-control px-2 text-[0.8125rem] font-semibold text-brand-blue-text hover:underline focus-visible:outline-2 focus-visible:outline-brand-blue-text"
        >
          <Box aria-hidden="true" className="size-4" />
          Voir en 3D<span className="sr-only"> : {screen.name}</span>
        </Link>
      </div>
    </div>
  );
}

function CatalogueSkeleton() {
  return (
    <LoadingRegion label="Chargement des zones et des Porteurs…">
      <Skeleton className="h-12 w-full rounded-card" />
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-card" />
        ))}
      </div>
    </LoadingRegion>
  );
}

export type ScreensView = "liste" | "carte";

function ViewSwitch({
  value,
  onChange,
}: {
  value: ScreensView;
  onChange: (value: ScreensView) => void;
}) {
  const options: { value: ScreensView; label: string; icon: typeof List }[] = [
    { value: "liste", label: "Liste", icon: List },
    { value: "carte", label: "Carte", icon: MapIcon },
  ];
  return (
    <div
      role="group"
      aria-label="Affichage des Porteurs"
      className="inline-flex rounded-full border border-line bg-surface p-1"
    >
      {options.map((o) => {
        const Icon = o.icon;
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cx(
              "inline-flex min-h-10 items-center gap-2 rounded-full px-4 font-label text-[0.8125rem] font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-text",
              on ? "bg-surface-3 text-ink-strong" : "text-muted hover:text-ink",
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Wizard step 2 (FLOW-02, FFA-02): every active Porteur with its availability on the campaign
 * period; the selection is booked by the sticky bar's « Réserver N Porteurs et continuer ».
 */
export function StepScreens({
  campaign,
  reservations,
  onReserved,
  onBack,
  onNext,
  headingRef,
  onChangePeriod,
  notice,
  onDismissNotice,
  onPendingChange,
}: StepScreensProps) {
  const reduce = useReducedMotion();
  const [today] = useState(() => todayISO());
  const catalogue = useResource("wizard-screen-catalogue", loadScreenCatalogue);

  const [zoneFilter, setZoneFilter] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});
  const [booking, setBooking] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  const [lastRun, setLastRun] = useState<{
    booked: { id: number; name: string }[];
    failed: { id: number; name: string; message: string }[];
  } | null>(null);
  const [view, setView] = useState<ScreensView>("liste");
  const [studioId, setStudioId] = useState<number | null>(null);
  const [highlightHint, setHighlightHint] = useState(false);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const schedule = hasSchedule(campaign) ? campaign : null;
  const startsInPast = schedule !== null && schedule.startDate < today;
  const canBook = schedule !== null && !startsInPast;

  const active = useMemo(() => activeReservations(reservations), [reservations]);
  const bookedStatus = useMemo(
    () => new Map(active.map((r) => [r.supportId, r.reservationStatus] as const)),
    [active],
  );
  const bookedIds = useMemo(() => new Set(bookedStatus.keys()), [bookedStatus]);

  const zones = useMemo(() => catalogue.data?.zones ?? [], [catalogue.data]);
  const screens = useMemo(() => catalogue.data?.screens ?? [], [catalogue.data]);
  const network = useMemo(() => catalogue.data?.network ?? [], [catalogue.data]);

  const availabilityIds = useMemo(
    () => screens.filter((s) => !bookedIds.has(s.id) && !bookingBlockReason(s)).map((s) => s.id),
    [screens, bookedIds],
  );
  const availability = useSupportsAvailability(
    availabilityIds,
    schedule?.startDate,
    schedule?.endDate,
    { enabled: schedule !== null },
  );
  const periodStart = schedule?.startDate ?? null;
  const periodEnd = schedule?.endDate ?? null;
  const period = useMemo(
    () => (periodStart && periodEnd ? { start: periodStart, end: periodEnd } : null),
    [periodStart, periodEnd],
  );
  const rows = useMemo(
    () => screenRows(screens, bookedStatus, availability, period),
    [screens, bookedStatus, availability, period],
  );

  const zoneStats = useMemo(
    () =>
      zones.map((zone) => {
        const zoneRows = rows.filter((r) => r.screen.zoneId === zone.id);
        return {
          zone,
          total: zoneRows.length,
          free: zoneRows.filter((r) => r.state === "free").length,
          loading: zoneRows.some((r) => r.state === "loading"),
        };
      }),
    [zones, rows],
  );
  const chipZones = [
    ...zoneStats.filter((z) => z.total > 0),
    ...zoneStats.filter((z) => z.total === 0),
  ];
  const totalFree = rows.filter((r) => r.state === "free").length;
  const anyLoading = rows.some((r) => r.state === "loading");

  const lookups: NetworkLookups = useMemo(
    () => ({
      supports: new Map(network.map((s) => [s.id, s])),
      zones: new Map(zones.map((z) => [z.id, z])),
    }),
    [network, zones],
  );
  const joined = useMemo(() => joinReservations(active, lookups), [active, lookups]);

  const toBook = screens.filter((s) => selected.has(s.id) && !bookedIds.has(s.id));
  const pendingCount = toBook.length;

  useEffect(() => {
    onPendingChange?.(pendingCount);
  }, [pendingCount, onPendingChange]);
  useEffect(() => () => onPendingChange?.(0), [onPendingChange]);

  useUnsavedChangesGuard({ dirty: pendingCount > 0 || booking, message: PENDING_GUARD_MESSAGE });

  const barVisible = catalogue.data !== undefined && (pendingCount > 0 || active.length > 0);
  useStickyBarOffset(barRef, barVisible);

  const changePeriod = active.length > 0 ? onChangePeriod : onBack;

  const toggleScreen = (id: number, on: boolean) => {
    setSelected((sel) => {
      const next = new Set(sel);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    setHighlightHint(false);
    if (!on && outcomes[id]) {
      setOutcomes((o) => {
        const next = { ...o };
        delete next[id];
        return next;
      });
    }
  };

  /** Selection coming from the map. */
  const applyMapSelection = (ids: number[]) => {
    const next = new Set(ids);
    setSelected(next);
    setOutcomes((o) => {
      const kept: Record<number, Outcome> = {};
      for (const [id, outcome] of Object.entries(o)) {
        if (next.has(Number(id))) kept[Number(id)] = outcome;
      }
      return kept;
    });
  };

  const book = async (
    targets: SupportResponse[],
  ): Promise<{ created: ReservationResponse[]; failed: number }> => {
    if (booking || !schedule || targets.length === 0) return { created: [], failed: 0 };
    setBooking(true);
    setLastRun(null);
    setAnnounce("Réservation des Porteurs en cours…");
    const created: ReservationResponse[] = [];
    const failedRows: { id: number; name: string; message: string }[] = [];
    const nextOutcomes: Record<number, Outcome> = { ...outcomes };
    for (const screen of targets) {
      setPendingId(screen.id);
      try {
        const reservation = await reservationsApi.create({
          campaignId: campaign.id,
          // The SUPPORT's own zone (the backend does not check it, contract §7.17).
          zoneId: screen.zoneId,
          supportId: screen.id,
          startDate: schedule.startDate,
          endDate: schedule.endDate,
          startTime: toApiTime(schedule.startTime),
          endTime: toApiTime(schedule.endTime),
        });
        created.push(reservation);
        delete nextOutcomes[screen.id];
      } catch (e) {
        const outcome: Outcome = isReservationConflictError(e)
          ? { kind: "conflict", message: CONFLICT_MESSAGE }
          : { kind: "error", message: presentError(e).message };
        nextOutcomes[screen.id] = outcome;
        failedRows.push({ id: screen.id, name: screen.name, message: outcome.message });
        if (presentError(e).category === "unauthorized") break;
      }
    }
    setPendingId(null);
    setOutcomes(nextOutcomes);
    setSelected((sel) => {
      const next = new Set(sel);
      for (const r of created) next.delete(r.supportId);
      return next;
    });
    setBooking(false);
    if (created.length > 0) {
      for (const r of created) invalidate(`supports:${r.supportId}:`);
      invalidate(resourceKeys.reservationsByCampaign(campaign.id));
      onReserved(created);
    }
    const failed = targets.length - created.length;
    if (failed > 0) {
      setLastRun({
        booked: created.map((r) => ({
          id: r.supportId,
          name: targets.find((t) => t.id === r.supportId)?.name ?? `Porteur n° ${r.supportId}`,
        })),
        failed: failedRows,
      });
    }
    setAnnounce(
      [
        created.length > 0 ? formatCount(created.length, "Porteur bloqué", "Porteurs bloqués") : "",
        failed > 0 ? formatCount(failed, "Porteur non réservé", "Porteurs non réservés") : "",
      ]
        .filter(Boolean)
        .join(", ") + ".",
    );
    return { created, failed };
  };

  const reserveAndContinue = async () => {
    if (booking) return;
    if (toBook.length === 0) {
      if (active.length > 0) onNext();
      return;
    }
    const { created, failed } = await book(toBook);
    // Advance only when every pending Porteur is booked (FFA-02: nothing is silently dropped).
    if (failed === 0 && created.length === toBook.length) onNext();
  };

  const primaryReason = !canBook
    ? schedule
      ? "La date de début est passée : changez de période."
      : "Complétez la période à l'étape Détails."
    : null;
  const nothingToDo = toBook.length === 0 && active.length === 0;

  const pointToHint = () => {
    setHighlightHint(true);
    const el = hintRef.current;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    }
  };

  const primaryLabel =
    toBook.length > 0
      ? `Réserver ${formatCount(toBook.length, "Porteur", "Porteurs")} et continuer`
      : "Continuer";
  const estimate = toBook.length * (Number.isFinite(campaign.budget) ? campaign.budget * 0.1 : 0);

  const studioScreen =
    studioId !== null ? (network.find((sc) => sc.id === studioId) ?? null) : null;

  const filteredRows = sortRows(
    rows.filter(
      (r) =>
        (zoneFilter === null || r.screen.zoneId === zoneFilter) && matchesQuery(r.screen, query),
    ),
  );
  const groups = zones
    .map((zone) => ({ zone, rows: filteredRows.filter((r) => r.screen.zoneId === zone.id) }))
    .filter((g) => g.rows.length > 0);

  const showNotice = notice && notice.campaignId === campaign.id;

  return (
    <div>
      <WizardStepHeading step={2} title="Porteurs" headingRef={headingRef} />

      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      {showNotice ? (
        <Alert
          tone={notice.failed.length > 0 || notice.unavailable.length > 0 ? "warning" : "success"}
          className="mb-5"
          title="Période changée"
          action={
            onDismissNotice ? (
              <Button variant="ghost" size="sm" onClick={onDismissNotice}>
                Masquer
              </Button>
            ) : undefined
          }
        >
          {[
            formatCount(notice.rebooked.length, "Porteur re-bloqué", "Porteurs re-bloqués"),
            notice.unavailable.length > 0
              ? `${formatCount(notice.unavailable.length, "indisponible", "indisponibles")} : ${notice.unavailable.join(", ")}`
              : null,
            notice.failed.length > 0
              ? `${formatCount(notice.failed.length, "échec", "échecs")} : ${notice.failed.map((f) => `${f.name} (${f.message})`).join(", ")}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Alert>
      ) : null}

      {/* Requested period */}
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-line bg-surface px-4 py-2.5 text-[0.875rem]">
        <span className="text-muted">Votre période</span>
        <span className="font-medium whitespace-nowrap text-ink-soft tabular">
          {formatDateRange(campaign.startDate, campaign.endDate, "medium")}
        </span>
        <span className="whitespace-nowrap text-ink-soft tabular">
          {formatTimeRange(campaign.startTime, campaign.endTime)}
        </span>
        {changePeriod ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            iconLeft={<CalendarClock aria-hidden="true" />}
            onClick={changePeriod}
          >
            Changer de période…
          </Button>
        ) : null}
      </div>

      {!schedule ? (
        <Alert tone="warning" live="none" className="mb-5" title="Période incomplète">
          Renseignez les dates et la plage horaire à l&apos;étape Détails avant de réserver des
          Porteurs.
        </Alert>
      ) : startsInPast ? (
        <Alert tone="warning" live="none" className="mb-5" title="Période à mettre à jour">
          La date de début de cette campagne est passée. Choisissez une nouvelle période avant de
          réserver des Porteurs.
        </Alert>
      ) : null}

      {catalogue.error && !catalogue.data ? (
        <ErrorState error={catalogue.error} onRetry={catalogue.reload} scope="section" />
      ) : catalogue.loading && !catalogue.data ? (
        <CatalogueSkeleton />
      ) : zones.length === 0 ? (
        <EmptyState
          icon={<MapPinned />}
          title="Aucune zone ouverte pour le moment"
          description="Les zones apparaîtront ici dès leur ouverture. Votre brouillon est enregistré : vous pourrez reprendre plus tard."
          action={
            <Button asChild variant="secondary">
              <Link href={routes.espace.campaigns()}>Retour à mes campagnes</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <ViewSwitch value={view} onChange={setView} />
            <p
              ref={hintRef}
              className={cx(
                "rounded-control px-2 py-1 text-[0.8125rem] text-muted transition-shadow",
                highlightHint && "text-ink-strong ring-2 ring-brand-blue-text",
              )}
            >
              {view === "carte"
                ? "Carte : zones, Porteurs et Studio 3D."
                : "Cochez les Porteurs disponibles, puis réservez-les en continuant."}
            </p>
          </div>

          {view === "carte" ? (
            <StepScreensMap
              zones={zones}
              screens={screens}
              network={network}
              selectedIds={selected}
              bookedIds={bookedIds}
              outcomes={outcomes}
              pendingId={pendingId}
              disabled={!canBook || booking}
              onSelectionChange={applyMapSelection}
              onOpenPorteur={setStudioId}
            />
          ) : (
            <>
              <div className="flex flex-col gap-3">
                <div className="relative max-w-md">
                  <label htmlFor="porteurs-recherche" className="sr-only">
                    Rechercher un Porteur ou une rue
                  </label>
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
                  />
                  <Input
                    id="porteurs-recherche"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Rechercher un Porteur ou une rue"
                    className="pl-10"
                  />
                </div>
                <ul
                  aria-label="Filtrer par zone"
                  className="no-scrollbar relative -mx-4 flex flex-nowrap gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
                >
                  {[
                    { zone: null, total: rows.length, free: totalFree, loading: anyLoading },
                    ...chipZones,
                  ].map(({ zone, total, free, loading }) => {
                    const on = zone === null ? zoneFilter === null : zoneFilter === zone.id;
                    const empty = zone !== null && total === 0;
                    return (
                      <li key={zone?.id ?? "toutes"} className="shrink-0">
                        <button
                          type="button"
                          aria-pressed={on}
                          disabled={empty}
                          onClick={() => setZoneFilter(zone?.id ?? null)}
                          className={cx(
                            "inline-flex min-h-touch items-center gap-2 rounded-full border px-4 font-label text-[0.8125rem] font-semibold whitespace-nowrap transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text disabled:cursor-not-allowed disabled:opacity-60",
                            on
                              ? "border-blue-line bg-blue-soft text-ink-strong"
                              : "border-line-strong text-ink-soft hover:border-muted-2 hover:text-ink-strong",
                          )}
                        >
                          {zone?.name ?? "Toutes"}
                          {empty ? (
                            <span className="font-normal text-muted">· Aucun Porteur actif</span>
                          ) : (
                            <span className="rounded-full bg-overlay-strong px-1.5 py-px text-[0.75rem] tabular">
                              {loading && free === 0 ? "…" : free}
                              <span className="sr-only">
                                {" "}
                                {loading
                                  ? "disponibles pour l'instant"
                                  : free > 1
                                    ? "disponibles"
                                    : "disponible"}
                              </span>
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="mt-6 flex flex-col gap-7">
                {groups.length === 0 ? (
                  <p
                    role="status"
                    className="rounded-card border border-dashed border-line-strong px-5 py-8 text-center text-[0.875rem] text-muted"
                  >
                    Aucun Porteur ne correspond à ces filtres.
                  </p>
                ) : (
                  groups.map(({ zone, rows: zoneRows }) => (
                    <section key={zone.id} aria-labelledby={`zone-${zone.id}`}>
                      <div
                        className="sticky z-[3] -mx-1 mb-3 flex items-baseline justify-between gap-3 bg-bg px-1 py-2"
                        style={{ top: `var(${WIZARD_STICKY_VAR}, 68px)` }}
                      >
                        <h3
                          id={`zone-${zone.id}`}
                          className="font-display text-[1rem] font-semibold text-ink-strong"
                        >
                          {zone.name}
                        </h3>
                        <span className="text-[0.8125rem] text-muted">
                          {[
                            formatCount(
                              zoneRows.filter((r) => r.state === "free").length,
                              "disponible",
                              "disponibles",
                            ),
                            // A Porteur already blocked by this draft is neither free nor
                            // unavailable: say so instead of « 0 disponible » alone.
                            zoneRows.some((r) => r.state === "booked")
                              ? formatCount(
                                  zoneRows.filter((r) => r.state === "booked").length,
                                  "bloqué pour vous",
                                  "bloqués pour vous",
                                )
                              : null,
                            formatCount(zoneRows.length, "Porteur", "Porteurs"),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                      <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {zoneRows.map((row) => (
                          <li key={row.screen.id} className="min-w-0">
                            <ScreenCard
                              row={row}
                              checked={selected.has(row.screen.id)}
                              outcome={outcomes[row.screen.id]}
                              pending={pendingId === row.screen.id}
                              disabled={!canBook || booking}
                              onToggle={(on) => toggleScreen(row.screen.id, on)}
                              onChangePeriod={changePeriod}
                            />
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Already booked */}
      <section aria-labelledby="porteurs-bloques" className="mt-10">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h3
            id="porteurs-bloques"
            className="font-display text-[1.0625rem] font-semibold text-ink-strong"
          >
            Porteurs bloqués pour cette campagne
          </h3>
          <span className="text-[0.8125rem] text-muted">
            {formatCount(active.length, "créneau", "créneaux")}
          </span>
        </div>
        {joined.length > 0 ? (
          <>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
              {joined.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-surface px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-label text-[0.9375rem] font-semibold break-words text-ink-strong">
                      {r.supportName}
                    </p>
                    <p className="text-[0.8125rem] text-muted">
                      {r.zoneName} ·{" "}
                      <span className="whitespace-nowrap tabular">
                        {formatDateRange(r.startDate, r.endDate, "medium")}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill type="reservation" status={r.reservationStatus} long size="sm" />
                    <a
                      href={releaseMailto(campaign, r)}
                      className="inline-flex min-h-touch items-center rounded-control px-2 text-[0.8125rem] font-semibold text-brand-blue-text hover:underline"
                    >
                      Libérer ce créneau
                      <span className="sr-only"> : {r.supportName} (demande par e-mail)</span>
                    </a>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-muted">
              Un créneau bloqué est retenu jusqu&apos;à la décision de TPUB. Il n&apos;est pas
              libérable en ligne : « Libérer ce créneau » prépare une demande par e-mail.
            </p>
          </>
        ) : (
          <p className="rounded-card border border-dashed border-line-strong px-5 py-5 text-[0.875rem] text-muted">
            Aucun Porteur bloqué pour l&apos;instant.
          </p>
        )}
      </section>

      <WizardPorteurDialog
        support={studioScreen}
        campaign={campaign}
        today={today}
        booked={studioScreen ? bookedIds.has(studioScreen.id) : false}
        selected={studioScreen ? selected.has(studioScreen.id) : false}
        outcomeMessage={studioScreen ? (outcomes[studioScreen.id]?.message ?? null) : null}
        canBook={canBook}
        booking={booking}
        onOpenChange={(open) => {
          if (!open) setStudioId(null);
        }}
        onToggleSelect={(screen) => toggleScreen(screen.id, !selected.has(screen.id))}
      />

      {/* Static footer: back + the primary when the sticky bar is hidden. */}
      <div className="mt-8 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" iconLeft={<ArrowLeft aria-hidden="true" />} onClick={onBack}>
          Détails
        </Button>
        {barVisible ? null : (
          <Button
            variant="primary"
            size="lg"
            iconRight={<ArrowRight aria-hidden="true" />}
            disabledReason={primaryReason ?? (nothingToDo ? SELECT_AT_LEAST_ONE : null)}
            onDisabledClick={pointToHint}
            onClick={() => void reserveAndContinue()}
          >
            Continuer
          </Button>
        )}
      </div>

      {/* Sticky booking bar (FFA-02, FFA-03, FLOW-09) */}
      <AnimatePresence initial={false}>
        {barVisible ? (
          <motion.div
            key="barre-reservation"
            ref={barRef}
            initial={reduce ? false : { y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { y: 24, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.22 }}
            className="sticky bottom-[calc(var(--bottom-bar-h,0px)+0.75rem)] z-[6] mt-6"
          >
            <div
              role="region"
              aria-label="Réservation des Porteurs"
              className="flex flex-col gap-3 rounded-card border border-line-strong bg-surface-2 p-3 shadow-card sm:p-4"
            >
              {lastRun ? (
                <ul
                  aria-label="Résultat de la réservation"
                  className="flex flex-col gap-1 text-[0.8125rem]"
                >
                  {lastRun.booked.map((b) => (
                    <li key={b.id} className="flex gap-1.5 text-success">
                      <CircleCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                      {b.name} : bloqué
                    </li>
                  ))}
                  {lastRun.failed.map((f) => (
                    <li key={f.id} className="flex gap-1.5 text-danger">
                      <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                      {f.name} : {f.message}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.875rem] text-ink-soft">
                    {toBook.length > 0 ? (
                      <>
                        <span className="font-semibold text-ink-strong">
                          {formatCount(
                            toBook.length,
                            "Porteur sélectionné",
                            "Porteurs sélectionnés",
                          )}
                        </span>
                        <span className="whitespace-nowrap tabular">
                          · {formatEstimate(estimate, "DT")}
                        </span>
                        <span className="text-muted">
                          (estimation provisoire, 10 % du budget par créneau)
                        </span>
                        <EstimateTag rule={ESTIMATE_COST_RULE} />
                      </>
                    ) : (
                      <span>
                        {formatCount(active.length, "Porteur bloqué", "Porteurs bloqués")} pour
                        cette campagne
                      </span>
                    )}
                  </p>
                  {toBook.length > 0 ? (
                    <p className="mt-1 text-[0.8125rem] text-muted">{BOOKING_CONSEQUENCE}</p>
                  ) : null}
                </div>
                <Button
                  variant="primary"
                  size="lg"
                  className="shrink-0"
                  loading={booking}
                  loadingLabel="Réservation en cours"
                  iconRight={<ArrowRight aria-hidden="true" />}
                  disabledReason={primaryReason}
                  onDisabledClick={pointToHint}
                  onClick={() => void reserveAndContinue()}
                >
                  {primaryLabel}
                </Button>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
