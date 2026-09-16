"use client";

import { CircleAlert, Lock, MousePointerClick } from "lucide-react";
import { useMemo, useState } from "react";

import { NetworkMap, PorteurList } from "@/components/map";
import type { SupportResponse, ZoneResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { formatCount } from "@/lib/format";
import { isBookable } from "@/lib/network/porteur";
import type { Selection } from "@/lib/network/selection";

export interface StepScreensMapProps {
  zones: ZoneResponse[];
  screens: SupportResponse[];
  /**
   * Every Porteur of the open zones (non-ACTIF and type D included) drawn on the map at its exact
   * position. Defaults to `screens`.
   */
  network?: SupportResponse[];
  /** Screens chosen for booking (not yet booked). */
  selectedIds: ReadonlySet<number>;
  /** Screens already reserved for the campaign. */
  bookedIds: ReadonlySet<number>;
  /** Inline booking errors per screen. */
  outcomes: Readonly<Record<number, { message: string }>>;
  pendingId: number | null;
  /** Selection locked (no schedule, past start, booking in flight). */
  disabled: boolean;
  onSelectionChange: (supportIds: number[]) => void;
  onOpenPorteur: (supportId: number) => void;
}

/**
 * Derived zone flags: a zone counts as chosen « as a whole » when every Porteur of that zone that
 * can still be booked for the campaign is selected.
 */
export function mapSelectionFor(
  zones: readonly ZoneResponse[],
  screens: readonly SupportResponse[],
  selectedIds: ReadonlySet<number>,
  bookedIds: ReadonlySet<number>,
): Selection {
  const zoneIds: number[] = [];
  for (const zone of zones) {
    const eligible = screens.filter(
      (s) => s.zoneId === zone.id && isBookable(s) && !bookedIds.has(s.id),
    );
    if (eligible.length > 0 && eligible.every((s) => selectedIds.has(s.id))) zoneIds.push(zone.id);
  }
  return {
    zoneIds,
    supportIds: screens.filter((s) => selectedIds.has(s.id)).map((s) => s.id),
  };
}

/** Selection coming back from the map → screen ids that can actually be booked now. */
export function bookableSelection(
  next: Selection,
  screens: readonly SupportResponse[],
  bookedIds: ReadonlySet<number>,
): number[] {
  const known = new Set(screens.map((s) => s.id));
  return next.supportIds.filter((id) => known.has(id) && !bookedIds.has(id));
}

/**
 * « Carte » tab of wizard step 2: NetworkMap in select mode bound to the step's selection, with a
 * rail listing the selection (the non-visual equivalent) and the Porteurs already reserved.
 */
export function StepScreensMap({
  zones,
  screens,
  network,
  selectedIds,
  bookedIds,
  outcomes,
  pendingId,
  disabled,
  onSelectionChange,
  onOpenPorteur,
}: StepScreensMapProps) {
  const [focusId, setFocusId] = useState<number | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);

  const selection = useMemo(
    () => mapSelectionFor(zones, screens, selectedIds, bookedIds),
    [zones, screens, selectedIds, bookedIds],
  );

  const selectedScreens = screens.filter((s) => selectedIds.has(s.id));
  const bookedScreens = screens.filter((s) => bookedIds.has(s.id));
  const failed = screens.filter((s) => outcomes[s.id] && !bookedIds.has(s.id));

  const locate = (id: number) => {
    setFocusId(null);
    window.requestAnimationFrame(() => setFocusId(id));
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <NetworkMap
        mode={disabled ? "explore" : "select"}
        zones={zones}
        supports={network ?? screens}
        selection={selection}
        onSelectionChange={(next) => onSelectionChange(bookableSelection(next, screens, bookedIds))}
        onOpenPorteur={onOpenPorteur}
        focusSupportId={focusId}
        highlightSupportId={hoverId}
        onHoverSupport={setHoverId}
        height="clamp(26rem, 68vh, 44rem)"
        ariaLabel="Carte des Porteurs réservables pour la campagne"
      />

      <aside
        aria-label="Sélection sur la carte"
        className="flex min-h-0 min-w-0 flex-col gap-4 rounded-panel border border-line-strong bg-surface-2 p-4 lg:max-h-[clamp(26rem,68vh,44rem)] lg:overflow-y-auto"
      >
        <div>
          <h3 className="font-display text-[1rem] font-semibold text-ink-strong">
            Votre sélection
          </h3>
          <p className="mt-1 flex gap-1.5 text-[0.75rem] leading-snug text-muted">
            <MousePointerClick
              aria-hidden="true"
              className="mt-px size-3.5 shrink-0 text-brand-orange-text"
            />
            Cliquez un Porteur pour l&apos;ouvrir en 3D, une zone pour la sélectionner en entier, ou
            utilisez la zone de chalandise.
          </p>
        </div>

        {disabled && selectedScreens.length === 0 ? (
          <p className="rounded-card border border-dashed border-line-strong px-3 py-4 text-center text-[0.8125rem] text-muted">
            Sélection indisponible tant que la période de la campagne n&apos;est pas valide.
          </p>
        ) : (
          <PorteurList
            dense
            label="Porteurs sélectionnés"
            items={selectedScreens.map((support) => ({ support }))}
            selectedIds={selectedScreens.map((s) => s.id)}
            highlightId={hoverId}
            onHover={setHoverId}
            onLocate={locate}
            onOpen={onOpenPorteur}
            onToggleSelect={
              disabled
                ? undefined
                : (id) => onSelectionChange([...selectedIds].filter((x) => x !== id))
            }
            emptyText="Aucun Porteur sélectionné pour l'instant."
          />
        )}

        {pendingId !== null ? (
          <p className="text-[0.8125rem] text-brand-blue-text" aria-live="polite">
            Réservation en cours…
          </p>
        ) : null}

        {failed.length > 0 ? (
          <ul aria-label="Réservations non abouties" className="flex flex-col gap-1.5">
            {failed.map((s) => (
              <li
                key={s.id}
                className="flex gap-1.5 rounded-[12px] border border-danger/30 bg-danger/[0.06] px-3 py-2 text-[0.8125rem] leading-snug text-danger"
              >
                <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
                <span>
                  <span className="font-semibold">{s.name}</span> — {outcomes[s.id]?.message}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className={cx("border-t border-line pt-3", bookedScreens.length === 0 && "hidden")}>
          <p className="mb-2 inline-flex items-center gap-1.5 font-label text-[0.75rem] font-semibold text-success">
            <Lock aria-hidden="true" className="size-3.5" />
            {formatCount(bookedScreens.length, "Porteur déjà réservé", "Porteurs déjà réservés")}
          </p>
          <PorteurList
            dense
            label="Porteurs déjà réservés pour la campagne"
            items={bookedScreens.map((support) => ({ support }))}
            onLocate={locate}
            onOpen={onOpenPorteur}
          />
        </div>
      </aside>
    </div>
  );
}
