"use client";

import { RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { controlClasses, Field, Select } from "@/components/ui/field";
import { Kbd } from "@/components/ui/kbd";
import { cx } from "@/lib/cx";
import { registerPageSearch } from "@/lib/shortcuts";

export interface FilterBarSearch {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible label (default « Rechercher »). */
  label?: string;
  /** Registers « / » to focus this field and shows the hint (default true). */
  shortcut?: boolean;
}

export interface FilterBarSort {
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  /** Default « Trier par ». */
  label?: string;
}

export interface FilterBarProps {
  search?: FilterBarSearch;
  /** Filter controls (Selects, segmented chips). Rendered inline ≥ md and in the sheet < md. */
  children?: ReactNode;
  /** Sort select (useful on mobile where table headers are hidden). */
  sort?: FilterBarSort;
  /** « 12 réservations ». Announced politely. */
  resultCount?: string;
  /** Number of active filters (search excluded); drives « Filtres (n) » and « Réinitialiser ». */
  activeCount: number;
  onReset: () => void;
  /** Title of the mobile sheet (default « Filtres »). */
  sheetTitle?: string;
  className?: string;
}

function SearchInput({ search, id }: { search: FilterBarSearch; id: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const shortcut = search.shortcut ?? true;

  useEffect(() => {
    if (!shortcut) return;
    return registerPageSearch(() => {
      ref.current?.focus();
      ref.current?.select();
    });
  }, [shortcut]);

  return (
    <div className="relative min-w-0 flex-1 md:max-w-sm">
      <label htmlFor={id} className="sr-only">
        {search.label ?? "Rechercher"}
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
      />
      <input
        ref={ref}
        id={id}
        type="search"
        value={search.value}
        onChange={(e) => search.onChange(e.target.value)}
        placeholder={search.placeholder ?? "Rechercher…"}
        autoComplete="off"
        className={cx(
          controlClasses,
          "pr-16 pl-10 [&::-webkit-search-cancel-button]:appearance-none",
        )}
      />
      {search.value ? (
        <button
          type="button"
          onClick={() => {
            search.onChange("");
            ref.current?.focus();
          }}
          aria-label="Effacer la recherche"
          className="absolute top-1/2 right-1 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-[10px] text-muted hover:bg-overlay-hover hover:text-ink"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : shortcut ? (
        <span className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 md:inline-flex">
          <Kbd keys="/" />
        </span>
      ) : null}
    </div>
  );
}

function SortSelect({
  sort,
  id,
  inline = false,
}: {
  sort: FilterBarSort;
  id: string;
  inline?: boolean;
}) {
  const label = sort.label ?? "Trier par";
  if (inline) {
    // Same row as the (label-less) search: the label sits beside the control so every item in
    // the toolbar shares one baseline instead of leaving an empty label row above the search.
    return (
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="font-label text-[0.8125rem] font-medium whitespace-nowrap text-muted"
        >
          {label}
        </span>
        <Field label={label} hideLabel id={id} className="min-w-[210px]">
          <Select value={sort.value} onChange={(e) => sort.onChange(e.target.value)}>
            {sort.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    );
  }
  return (
    <Field label={label} id={id} className="md:min-w-[200px]">
      <Select value={sort.value} onChange={(e) => sort.onChange(e.target.value)}>
        {sort.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/**
 * List toolbar (UX-PLAN §4.3): one row ≥ md (search · filters · sort · count · reset); below md,
 * search + « Filtres (n) » opening a bottom sheet with filters and sort. State lives in the URL
 * (useUrlState), this component is presentational.
 */
export function FilterBar({
  search,
  children,
  sort,
  resultCount,
  activeCount,
  onReset,
  sheetTitle = "Filtres",
  className,
}: FilterBarProps) {
  const base = useId().replace(/:/g, "");
  const [sheetOpen, setSheetOpen] = useState(false);
  const hasFilters = Boolean(children) || Boolean(sort);
  const canReset = activeCount > 0 || Boolean(search?.value);
  // Without labelled filter Fields, the sort label goes inline and the row centers vertically.
  const inlineSort = !children;

  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <div className={cx("flex flex-wrap gap-3", inlineSort ? "items-center" : "items-end")}>
        {search ? <SearchInput search={search} id={`${base}-search`} /> : null}

        {/* ≥ md: inline filters */}
        {children ? (
          <div className="hidden flex-wrap items-end gap-3 md:flex">{children}</div>
        ) : null}
        {sort ? (
          <div className="hidden md:block">
            <SortSelect sort={sort} id={`${base}-sort`} inline={inlineSort} />
          </div>
        ) : null}

        {/* < md: sheet trigger */}
        {hasFilters ? (
          <Button
            variant="secondary"
            className="md:hidden"
            onClick={() => setSheetOpen(true)}
            iconLeft={<SlidersHorizontal aria-hidden="true" />}
          >
            {activeCount > 0 ? `Filtres (${activeCount})` : "Filtres"}
          </Button>
        ) : null}

        <div
          className={cx(
            "flex min-h-touch items-center gap-3 md:ml-auto",
            // < md the search keeps its width: count and reset wrap to their own line.
            search && hasFilters && "max-md:-mt-1 max-md:min-h-0 max-md:w-full",
            !resultCount && !canReset && "hidden",
          )}
        >
          {resultCount ? (
            <p className="text-[0.8125rem] whitespace-nowrap text-muted tabular" aria-live="polite">
              {resultCount}
            </p>
          ) : null}
          {canReset ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              iconLeft={<RotateCcw aria-hidden="true" />}
            >
              Réinitialiser
            </Button>
          ) : null}
        </div>
      </div>

      {hasFilters ? (
        <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
          <DialogContent
            title={sheetTitle}
            size="md"
            footer={
              <>
                {canReset ? (
                  <Button variant="ghost" onClick={onReset}>
                    Réinitialiser
                  </Button>
                ) : null}
                <DialogClose asChild>
                  <Button variant="primary">
                    {resultCount ? `Afficher ${resultCount}` : "Afficher les résultats"}
                  </Button>
                </DialogClose>
              </>
            }
          >
            <div className="flex flex-col gap-4 pb-2">
              {children}
              {sort ? <SortSelect sort={sort} id={`${base}-sort-sheet`} /> : null}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
