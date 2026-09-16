"use client";

import { Crosshair, Layers3, ListChecks, MapPinned, Search, Trash2, X } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { PorteurList } from "@/components/map/porteur-list";
import { TONE_BG_SOFT, TONE_TEXT } from "@/components/map/porteur-visuals";
import { PorteurTypeBadges } from "@/components/network/network-ui";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SupportResponse, ZoneResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import {
  countActiveFilters,
  DEFAULT_FILTERS,
  displayedCountLabel,
  normalizeText,
  toggleTypeFilter,
  type SupportFilters,
} from "@/lib/network/filters";
import { formatRadiusKm } from "@/lib/network/geo";
import {
  bookingBlockReason,
  isBookable,
  PORTEUR_TYPE_CODES,
  PORTEUR_TYPES,
  resolvePorteurType,
} from "@/lib/network/porteur";
import {
  bookableSupportsOfZone,
  isZoneSelected,
  removeSupports,
  summarizeSelection,
  toggleSupport,
  toggleZone,
  type Selection,
} from "@/lib/network/selection";

export type PanelTab = "porteurs" | "zones" | "selection";

const PAGE_SIZE = 40;

export interface ExplorerSidePanelProps {
  zones: ZoneResponse[];
  supports: SupportResponse[];
  /** Supports passing the (map-synced) filters. */
  visibleSupports: SupportResponse[];
  filters: SupportFilters;
  onFiltersChange: (filters: SupportFilters) => void;
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  selection: Selection;
  onSelectionChange: (selection: Selection, announcement?: string) => void;
  highlightId: number | null;
  onHover: (supportId: number | null) => void;
  activeZoneId: number | null;
  onFocusZone: (zoneId: number) => void;
  onOpen: (supportId: number) => void;
  onLocate: (supportId: number) => void;
  onBookSelection: () => void;
  className?: string;
}

/** Porteurs · Zones · Sélection — the accessible, non-visual equivalent of the map. */
export function ExplorerSidePanel(props: ExplorerSidePanelProps) {
  const { tab, onTabChange, selection, className } = props;
  return (
    <Tabs
      value={tab}
      onValueChange={(v) => onTabChange(v as PanelTab)}
      className={cx("flex min-h-0 flex-1 flex-col", className)}
    >
      <div className="shrink-0 px-3 pt-3">
        <TabsList aria-label="Panneau du réseau" className="mx-0! w-full justify-between">
          <TabsTrigger
            value="porteurs"
            count={props.visibleSupports.length}
            className="flex-1 justify-center px-2.5!"
          >
            Porteurs
          </TabsTrigger>
          <TabsTrigger
            value="zones"
            count={props.zones.length}
            className="flex-1 justify-center px-2.5!"
          >
            Zones
          </TabsTrigger>
          <TabsTrigger
            value="selection"
            count={selection.supportIds.length}
            className="flex-1 justify-center px-2.5!"
          >
            Sélection
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="porteurs" className="mt-0! flex min-h-0 flex-1 flex-col">
        <PorteursTab {...props} />
      </TabsContent>
      <TabsContent value="zones" className="mt-0! flex min-h-0 flex-1 flex-col">
        <ZonesTab {...props} />
      </TabsContent>
      <TabsContent value="selection" className="mt-0! flex min-h-0 flex-1 flex-col">
        <SelectionTab {...props} />
      </TabsContent>
    </Tabs>
  );
}

function PorteursTab({
  supports,
  visibleSupports,
  filters,
  onFiltersChange,
  selection,
  onSelectionChange,
  highlightId,
  onHover,
  onOpen,
  onLocate,
}: ExplorerSidePanelProps) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const q = normalizeText(query);
  const matches = useMemo(
    () =>
      q
        ? visibleSupports.filter((s) =>
            normalizeText(`${s.name} ${s.address ?? ""} ${s.zoneName}`).includes(q),
          )
        : visibleSupports,
    [visibleSupports, q],
  );
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const s of supports)
      counts[resolvePorteurType(s).type] = (counts[resolvePorteurType(s).type] ?? 0) + 1;
    return counts;
  }, [supports]);
  const active = countActiveFilters(filters);

  return (
    <>
      <div className="flex shrink-0 flex-col gap-3 border-b border-line px-3 pt-3 pb-3">
        <label className="relative block">
          <span className="sr-only">Filtrer la liste des Porteurs</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-2"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE_SIZE);
            }}
            placeholder="Nom, adresse ou zone"
            className="min-h-10 w-full rounded-control border border-line-strong bg-overlay-inset pr-3 pl-9 text-[0.8125rem] text-ink placeholder:text-muted-2 focus:border-brand-blue-text focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-text/60"
          />
        </label>
        <div
          role="group"
          aria-label="Filtrer par type de Porteur"
          className="flex flex-wrap gap-1.5"
        >
          {PORTEUR_TYPE_CODES.map((code) => {
            const meta = PORTEUR_TYPES[code];
            const on = filters.types.includes(code);
            return (
              <button
                key={code}
                type="button"
                aria-pressed={on}
                title={meta.label}
                onClick={() => onFiltersChange(toggleTypeFilter(filters, code))}
                className={cx(
                  "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 font-label text-[0.75rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-text",
                  on
                    ? cx(TONE_BG_SOFT[meta.tone], TONE_TEXT[meta.tone])
                    : "border-line text-muted hover:border-line-strong hover:text-ink",
                )}
              >
                <span aria-hidden="true" className="font-display">
                  {code}
                </span>
                <span className="sr-only">
                  Type {code} · {meta.name}
                </span>
                <span aria-hidden="true" className="text-[0.75rem] font-normal tabular opacity-80">
                  {typeCounts[code] ?? 0}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={filters.bookableOnly}
            onClick={() => onFiltersChange({ ...filters, bookableOnly: !filters.bookableOnly })}
            className={cx(
              "inline-flex min-h-9 cursor-pointer items-center rounded-full border px-2.5 font-label text-[0.75rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-text",
              filters.bookableOnly
                ? "border-success/40 bg-success/12 text-success"
                : "border-line text-muted hover:border-line-strong hover:text-ink",
            )}
          >
            Réservables
          </button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.75rem] text-muted tabular" aria-live="polite">
            {displayedCountLabel(matches.length, supports.length)}
            {supports.length > matches.length
              ? ` · ${supports.length - matches.length} masqué${supports.length - matches.length > 1 ? "s" : ""} par ${active > 0 && query ? "les filtres et la recherche" : query ? "la recherche" : "les filtres"}`
              : ""}
          </p>
          {active > 0 || query ? (
            <button
              type="button"
              onClick={() => {
                onFiltersChange(DEFAULT_FILTERS);
                setQuery("");
              }}
              className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full px-2 text-[0.75rem] font-semibold text-brand-blue-text hover:bg-overlay-hover focus-visible:outline-2 focus-visible:outline-brand-blue-text"
            >
              <X aria-hidden="true" className="size-3.5" />
              Tout afficher
            </button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        <PorteurList
          label="Porteurs du réseau"
          items={matches.slice(0, limit).map((support) => ({ support }))}
          selectedIds={selection.supportIds}
          highlightId={highlightId}
          onHover={onHover}
          onLocate={onLocate}
          onOpen={onOpen}
          onOpenStudio={onOpen}
          showCoordinates={false}
          onToggleSelect={(id) => {
            const next = toggleSupport(selection, id, supports);
            const s = supports.find((x) => x.id === id);
            onSelectionChange(
              next,
              s
                ? next.supportIds.includes(id)
                  ? `${s.name} ajouté à la sélection.`
                  : `${s.name} retiré de la sélection.`
                : undefined,
            );
          }}
          emptyText={
            supports.length === 0
              ? "Aucun Porteur ouvert pour le moment."
              : "Aucun Porteur ne correspond à ces critères."
          }
        />
        {matches.length > limit ? (
          <div className="px-1 pt-2 pb-1">
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              onClick={() => setLimit((n) => n + PAGE_SIZE)}
            >
              Afficher {Math.min(PAGE_SIZE, matches.length - limit)} Porteurs de plus
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}

function ZonesTab({
  zones,
  supports,
  selection,
  onSelectionChange,
  activeZoneId,
  onFocusZone,
}: ExplorerSidePanelProps) {
  if (zones.length === 0) {
    return (
      <div className="p-4">
        <EmptyState
          compact
          icon={<MapPinned />}
          title="Aucune zone ouverte pour le moment."
          description="Les zones apparaîtront ici dès leur ouverture."
        />
      </div>
    );
  }
  return (
    <ul
      aria-label="Zones ouvertes"
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2"
    >
      {zones.map((zone) => {
        const inZone = supports.filter((s) => s.zoneId === zone.id);
        const bookable = bookableSupportsOfZone(zone.id, supports).length;
        const selected = isZoneSelected(selection, zone.id);
        const focused = activeZoneId === zone.id;
        return (
          <li
            key={zone.id}
            className={cx(
              "mb-1.5 flex items-center gap-2.5 rounded-[14px] border px-3 py-2.5 transition-colors",
              focused
                ? "border-orange-line bg-orange-soft"
                : selected
                  ? "border-brand-blue-text/45 bg-brand-blue/12"
                  : "border-transparent hover:bg-overlay-subtle",
            )}
          >
            <span
              aria-hidden="true"
              className={cx(
                "grid size-9 shrink-0 place-items-center rounded-full border border-dashed",
                focused
                  ? "border-brand-orange-text/60 text-brand-orange-text"
                  : "border-line-strong text-muted",
              )}
            >
              <Layers3 className="size-4" />
            </span>
            <button
              type="button"
              onClick={() => onFocusZone(zone.id)}
              aria-current={focused ? "true" : undefined}
              className="min-w-0 flex-1 cursor-pointer rounded-control text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text"
            >
              <span className="block truncate text-[0.8125rem] font-semibold text-ink">
                {zone.name}
              </span>
              <span className="block truncate text-[0.75rem] text-muted tabular">
                {inZone.length === 0
                  ? "Aucun Porteur"
                  : `${inZone.length} Porteur${inZone.length > 1 ? "s" : ""} · ${bookable} réservable${bookable > 1 ? "s" : ""}`}
                {zone.radiusKm ? ` · rayon ${formatRadiusKm(zone.radiusKm)}` : ""}
              </span>
              <span className="sr-only">
                {focused ? " — zone affichée sur la carte" : " — cadrer la carte sur cette zone"}
              </span>
            </button>
            <button
              type="button"
              aria-pressed={selected}
              disabled={!selected && bookable === 0}
              title={
                selected
                  ? `Retirer la zone ${zone.name} de la sélection`
                  : `Sélectionner les Porteurs réservables de ${zone.name}`
              }
              aria-label={
                selected
                  ? `Retirer la zone ${zone.name} de la sélection`
                  : `Sélectionner les Porteurs réservables de ${zone.name}`
              }
              onClick={() => {
                const next = toggleZone(selection, zone.id, supports);
                onSelectionChange(
                  next,
                  next.zoneIds.includes(zone.id)
                    ? `Zone ${zone.name} sélectionnée avec ses Porteurs réservables.`
                    : `Zone ${zone.name} retirée de la sélection.`,
                );
              }}
              className={cx(
                "grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-brand-blue-text disabled:cursor-not-allowed disabled:opacity-35",
                selected
                  ? "border-brand-blue-text/60 bg-brand-blue text-on-brand"
                  : "border-line text-muted hover:border-line-strong hover:text-ink-strong",
              )}
            >
              <ListChecks aria-hidden="true" className="size-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SelectionTab({
  zones,
  supports,
  selection,
  onSelectionChange,
  onOpen,
  onLocate,
  onBookSelection,
  onTabChange,
}: ExplorerSidePanelProps) {
  const summary = summarizeSelection(selection, supports, zones);
  if (summary.supportCount === 0) {
    return (
      <div className="p-4">
        <EmptyState
          compact
          icon={<ListChecks />}
          title="Aucun Porteur sélectionné"
          description="Touchez une zone sur la carte, utilisez la zone de chalandise ou le bouton « + » d'un Porteur pour composer votre sélection."
          action={
            <Button variant="secondary" size="sm" onClick={() => onTabChange("porteurs")}>
              Parcourir les Porteurs
            </Button>
          }
        />
      </div>
    );
  }
  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-3">
        <p className="text-[0.8125rem] font-semibold text-ink-strong" aria-live="polite">
          {summary.label}
        </p>
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<Trash2 aria-hidden="true" />}
          onClick={() => onSelectionChange({ zoneIds: [], supportIds: [] }, "Sélection vidée.")}
        >
          Vider
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {summary.byZone.map((group) => (
          <section
            key={group.zoneId}
            aria-label={`Zone ${group.zoneName}`}
            className="mb-4 last:mb-0"
          >
            <h3 className="mb-2 flex items-center gap-2 px-1 font-label text-[0.8125rem] font-semibold text-muted">
              {group.zoneName}
              {group.zoneSelected ? (
                <span className="rounded-full border border-blue-line px-1.5 py-px tracking-normal normal-case text-brand-blue-text">
                  zone entière
                </span>
              ) : null}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {summary.supports
                .filter((s) => s.zoneId === group.zoneId)
                .map((s) => {
                  const block = bookingBlockReason(s);
                  return (
                    <li
                      key={s.id}
                      className="rounded-[14px] border border-line bg-overlay-inset p-3"
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[0.8125rem] font-semibold text-ink">
                            {s.name}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <PorteurTypeBadges support={s} size="sm" />
                            <StatusPill type="support" status={s.technicalStatus} size="sm" />
                          </div>
                          <p
                            className={cx(
                              "mt-1.5 text-[0.75rem]",
                              isBookable(s) ? "text-success" : "text-warning",
                            )}
                          >
                            {isBookable(s) ? "Réservable" : (block ?? "Non réservable")}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center">
                          <IconButton label={`Localiser ${s.name}`} onClick={() => onLocate(s.id)}>
                            <Crosshair />
                          </IconButton>
                          <IconButton
                            label={`Retirer ${s.name} de la sélection`}
                            onClick={() =>
                              onSelectionChange(
                                removeSupports(selection, [s.id], supports),
                                `${s.name} retiré de la sélection.`,
                              )
                            }
                          >
                            <X />
                          </IconButton>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpen(s.id)}
                        className="mt-2 inline-flex min-h-8 cursor-pointer items-center rounded-full px-1 text-[0.75rem] font-semibold text-brand-blue-text hover:underline focus-visible:outline-2 focus-visible:outline-brand-blue-text"
                      >
                        Ouvrir le Studio 3D<span className="sr-only"> : {s.name}</span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>
      <div className="shrink-0 border-t border-line px-4 py-3 lg:hidden">
        <Button variant="primary" fullWidth onClick={onBookSelection}>
          Réserver la sélection
        </Button>
      </div>
    </>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-9 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-overlay-hover hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-brand-blue-text [&_svg]:size-4"
    >
      <span aria-hidden="true" className="contents">
        {children}
      </span>
    </button>
  );
}
