"use client";

import { Box, Check, LocateFixed, MapPin, Plus } from "lucide-react";
import { useId, type ReactNode } from "react";

import { useOptionalSessionContext } from "@/components/shell/session-context";
import { Tooltip } from "@/components/ui/tooltip";
import type { SupportResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { formatCoordinatesFr } from "@/lib/format";
import { formatDistance } from "@/lib/network/geo";
import {
  bookingBlockReason,
  PORTEUR_TYPES,
  resolvePorteurType,
  technicalStatusLabel,
} from "@/lib/network/porteur";

import { STATUS_DOT, TONE_BG_SOFT, TONE_TEXT } from "@/components/map/porteur-visuals";

export interface PorteurListItem {
  support: SupportResponse;
  /** Optional distance (catchment lists). */
  distanceM?: number;
}

export interface PorteurListProps {
  items: PorteurListItem[];
  /** Accessible name of the list. */
  label: string;
  selectedIds?: readonly number[];
  highlightId?: number | null;
  onLocate?: (supportId: number) => void;
  /** Row main action (name + details): Studio, inspector… depending on the page. */
  onOpen?: (supportId: number) => void;
  /**
   * Explicit « Ouvrir le Studio 3D » icon button on each row (IA-13). Pass it where the row opens
   * the Studio 3D so the action is discoverable without guessing that the name is clickable.
   */
  onOpenStudio?: (supportId: number) => void;
  onToggleSelect?: (supportId: number) => void;
  onHover?: (supportId: number | null) => void;
  /**
   * Exact coordinates on each row (French format). Default: shown to staff only; advertisers read
   * zone · adresse and copy the coordinates from the Studio (VD-18).
   */
  showCoordinates?: boolean;
  emptyText?: string;
  className?: string;
  dense?: boolean;
}

/** « Tunis Centre · Avenue Habib Bourguiba » (zone alone when there is no address). */
export function porteurPlaceLine(support: Pick<SupportResponse, "zoneName" | "address">): string {
  const address = support.address?.trim();
  return address ? `${support.zoneName} · ${address}` : support.zoneName;
}

/**
 * Accessible list of Porteurs — the non-visual equivalent of the markers. Reusable by pages
 * (explorer side panel, wizard) and by the map « Liste » / « Zone de chalandise » panels.
 */
export function PorteurList({
  items,
  label,
  selectedIds = [],
  highlightId = null,
  onLocate,
  onOpen,
  onOpenStudio,
  onToggleSelect,
  onHover,
  showCoordinates,
  emptyText = "Aucun Porteur à afficher.",
  className,
  dense = false,
}: PorteurListProps) {
  const idBase = useId();
  const session = useOptionalSessionContext();
  const withCoordinates = showCoordinates ?? session?.isStaff ?? false;
  if (items.length === 0) {
    return <p className={cx("py-4 text-center text-xs text-muted", className)}>{emptyText}</p>;
  }
  return (
    <ul aria-label={label} className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      {items.map(({ support, distanceM }) => {
        const { type, inferred } = resolvePorteurType(support);
        const meta = PORTEUR_TYPES[type];
        const selected = selectedIds.includes(support.id);
        const block = bookingBlockReason(support);
        const detailsId = `${idBase}-porteur-${support.id}`;
        const place = porteurPlaceLine(support);
        return (
          <li
            key={support.id}
            onMouseEnter={onHover ? () => onHover(support.id) : undefined}
            onMouseLeave={onHover ? () => onHover(null) : undefined}
            className={cx(
              "group/row flex min-w-0 items-center gap-2.5 rounded-[12px] border px-2.5 transition-colors",
              dense ? "py-1.5" : "py-2",
              selected
                ? "border-brand-blue-text/50 bg-blue-soft"
                : highlightId === support.id
                  ? "border-line-strong bg-overlay-subtle"
                  : "border-transparent hover:bg-overlay-subtle",
            )}
          >
            <span
              aria-hidden="true"
              className={cx(
                "inline-flex size-8 shrink-0 items-center justify-center rounded-full border font-display text-xs font-bold",
                TONE_BG_SOFT[meta.tone],
                TONE_TEXT[meta.tone],
                type === "D" && "border-dashed",
              )}
            >
              {type}
              {inferred ? <span className="text-[0.75rem] leading-none text-muted">~</span> : null}
            </span>
            <RowMain
              onOpen={onOpen ? () => onOpen(support.id) : undefined}
              label={`Ouvrir ${support.name}`}
              detailsId={detailsId}
            >
              <span className="line-clamp-2 block text-[0.8125rem] leading-snug font-medium text-ink">
                {support.name}
              </span>
              <span id={detailsId} className="block min-w-0">
                <span
                  data-porteur-place=""
                  title={place}
                  className="mt-0.5 flex min-w-0 items-center gap-1 text-[0.75rem] text-muted"
                >
                  <MapPin aria-hidden="true" className="size-3 shrink-0 text-brand-orange-text" />
                  <span className="min-w-0 truncate">{place}</span>
                </span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[0.75rem] text-muted-2">
                  <span
                    aria-hidden="true"
                    className={cx(
                      "size-1.5 shrink-0 rounded-full",
                      STATUS_DOT[support.technicalStatus],
                    )}
                  />
                  <span className="min-w-0 truncate">
                    {technicalStatusLabel(support.technicalStatus)}
                    {distanceM !== undefined ? ` · ${formatDistance(distanceM)}` : ""}
                    {inferred ? " · typologie estimée" : ""}
                    {block && support.technicalStatus === "ACTIF" ? " · non réservable" : ""}
                  </span>
                </span>
                {withCoordinates ? (
                  <span
                    data-porteur-position=""
                    className="mt-0.5 block min-w-0 truncate text-[0.75rem] text-ink-soft tabular"
                  >
                    <span className="sr-only">coordonnées </span>
                    {formatCoordinatesFr(support.latitude, support.longitude)}
                  </span>
                ) : null}
              </span>
            </RowMain>
            <div className="flex shrink-0 items-center gap-0.5">
              {onOpenStudio ? (
                <Tooltip content="Ouvrir le Studio 3D">
                  <button
                    type="button"
                    aria-label={`Ouvrir le Studio 3D : ${support.name}`}
                    data-action="studio"
                    onClick={() => onOpenStudio(support.id)}
                    className={cx(ICON_ACTION, "text-brand-blue-text")}
                  >
                    <Box aria-hidden="true" />
                  </button>
                </Tooltip>
              ) : null}
              {onLocate ? (
                <IconAction
                  label={`Localiser ${support.name} sur la carte`}
                  onClick={() => onLocate(support.id)}
                >
                  <LocateFixed />
                </IconAction>
              ) : null}
              {onToggleSelect ? (
                <IconAction
                  label={
                    selected
                      ? `Retirer ${support.name} de la sélection`
                      : `Ajouter ${support.name} à la sélection`
                  }
                  pressed={selected}
                  disabled={!selected && block !== null}
                  onClick={() => onToggleSelect(support.id)}
                  className={selected ? "text-brand-blue-text" : undefined}
                >
                  {selected ? <Check /> : <Plus />}
                </IconAction>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** 44 px below sm (touch), 36 px from sm. */
const ICON_ACTION =
  "grid size-11 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-overlay-hover hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-brand-blue-text disabled:cursor-not-allowed disabled:opacity-35 sm:size-9 [&_svg]:size-4";

/** Name + details: opens the Studio 3D when `onOpen` is given (the row main action). */
function RowMain({
  onOpen,
  label,
  detailsId,
  children,
}: {
  onOpen?: () => void;
  label: string;
  detailsId: string;
  children: ReactNode;
}) {
  if (!onOpen) return <div className="min-w-0 flex-1">{children}</div>;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      aria-describedby={detailsId}
      className="-my-1 min-w-0 flex-1 cursor-pointer rounded-[10px] py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text"
    >
      <span className="block min-w-0">{children}</span>
    </button>
  );
}

function IconAction({
  label,
  onClick,
  children,
  pressed,
  disabled,
  className,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      title={label}
      className={cx(ICON_ACTION, className)}
    >
      <span aria-hidden="true" className="contents">
        {children}
      </span>
    </button>
  );
}
