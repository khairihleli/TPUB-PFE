import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";

import { UncontrolledSortDataTable } from "@/components/ui/data-table-sort";
import { cx } from "@/lib/cx";
import type { SortState } from "@/lib/url-state";

export type { SortState } from "@/lib/url-state";

export interface DataTableColumn<T> {
  /** Stable key (also the sort key in `?tri=`). */
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  /** Extra classes for th/td (e.g. width). */
  className?: string;
  /** Mobile card: this column becomes the card title (use for the name column). */
  primary?: boolean;
  /** Mobile card: do not show this column. */
  hideOnMobile?: boolean;
  /** Header becomes a sort button (requires a client component consumer). */
  sortable?: boolean;
  /** Value used to sort rows (null/undefined last). Without it the column is not sorted locally. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Mobile card: shown right-aligned on the title line (status pill, amount). Max 2 used. */
  mobileMeta?: boolean;
  /** Never wrap (dates, amounts). */
  nowrap?: boolean;
  /** Accessible name of the sort button when `header` is not plain text. */
  sortLabel?: string;
}

export interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowKey: (row: T) => string | number;
  /** Accessible caption (visually hidden unless showCaption). */
  caption: string;
  showCaption?: boolean;
  /** Rendered instead of the table when rows is empty (first-use empty state). */
  empty?: ReactNode;
  /**
   * Rendered instead of the table when rows is empty AND filters are active (inline « Aucun
   * résultat pour ces filtres » + reset). Takes precedence over `empty` when provided.
   */
  emptyFiltered?: ReactNode;
  /** Mobile card footer (e.g. actions). */
  mobileFooter?: (row: T) => ReactNode;
  /** Right-aligned last column (desktop) / card footer (mobile). */
  rowActions?: (row: T) => ReactNode;
  /** Header of the actions column (visually hidden). */
  rowActionsLabel?: string;
  /** Controlled sort. Without `onSortChange`, sortable tables manage their own state. */
  sort?: SortState | null;
  onSortChange?: (sort: SortState) => void;
  /** « Trié par : attente la plus longue » under the table header. */
  sortCaption?: string;
  /** Rows are already sorted by the caller (e.g. server order): skip local sorting. */
  manualSort?: boolean;
  className?: string;
}

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" } as const;

/** Stable sort by `sortValue` (null/undefined always last, French collation for strings). */
export function sortRows<T>(
  rows: readonly T[],
  columns: readonly DataTableColumn<T>[],
  sort: SortState | null | undefined,
): readonly T[] {
  if (!sort) return rows;
  const column = columns.find((c) => c.key === sort.key);
  if (!column?.sortValue) return rows;
  const get = column.sortValue;
  const dir = sort.dir === "desc" ? -1 : 1;
  return rows
    .map((row, index) => ({ row, index, value: get(row) }))
    .sort((a, b) => {
      const av = a.value;
      const bv = b.value;
      const aMissing = av === null || av === undefined || av === "";
      const bMissing = bv === null || bv === undefined || bv === "";
      if (aMissing || bMissing)
        return aMissing === bMissing ? a.index - b.index : aMissing ? 1 : -1;
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv), "fr", { sensitivity: "base", numeric: true });
      return cmp === 0 ? a.index - b.index : cmp * dir;
    })
    .map((x) => x.row);
}

function ariaSort(column: { key: string; sortable?: boolean }, sort: SortState | null | undefined) {
  if (!column.sortable) return undefined;
  if (!sort || sort.key !== column.key) return "none" as const;
  return sort.dir === "asc" ? ("ascending" as const) : ("descending" as const);
}

/**
 * Responsive table: a real <table> from md, stacked cards below md (2-col details from 340px).
 * Put links/buttons inside cells (no clickable rows: keyboard + screen reader friendly).
 * Sorting: `sortable` + `sortValue` columns; controlled with `sort`/`onSortChange`
 * (URL via useTableSort) or uncontrolled (internal state).
 */
export function DataTable<T>(props: DataTableProps<T>) {
  const hasSortable = props.columns.some((c) => c.sortable);
  if (hasSortable && !props.onSortChange) {
    return <UncontrolledSortDataTable {...props} />;
  }
  return <DataTableView {...props} />;
}

export function DataTableView<T>({
  columns,
  rows,
  getRowKey,
  caption,
  showCaption = false,
  empty,
  emptyFiltered,
  mobileFooter,
  rowActions,
  rowActionsLabel = "Actions",
  sort,
  onSortChange,
  sortCaption,
  manualSort = false,
  className,
}: DataTableProps<T>) {
  if (rows.length === 0 && (emptyFiltered || empty)) return <>{emptyFiltered ?? empty}</>;

  const sorted = manualSort ? rows : sortRows(rows, columns, sort);
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const meta = columns.filter((c) => c !== primary && c.mobileMeta).slice(0, 2);
  const secondary = columns.filter((c) => c !== primary && !c.hideOnMobile && !meta.includes(c));

  return (
    <div className={className}>
      {sortCaption ? (
        <p className="mb-2 text-[0.8125rem] text-muted" aria-live="polite">
          Trié par : {sortCaption}
        </p>
      ) : null}
      {/* md+ table. `relative` makes this scroller the containing block of the absolutely
          positioned sr-only header labels; without it they escape the horizontal clip and widen
          the whole page when the table is wider than its column. */}
      <div className="relative hidden overflow-x-auto rounded-card border border-line bg-surface/60 md:block">
        <table className="w-full border-collapse text-sm">
          <caption
            className={
              showCaption
                ? "px-5 pt-4 text-left font-label text-sm font-semibold text-ink-soft"
                : "sr-only"
            }
          >
            {caption}
          </caption>
          <thead>
            <tr className="border-b border-line bg-surface-2/60">
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const SortIcon = !active
                  ? ChevronsUpDown
                  : sort?.dir === "asc"
                    ? ArrowUp
                    : ArrowDown;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={ariaSort(c, sort)}
                    className={cx(
                      "px-4 py-3 font-label text-[0.8125rem] font-semibold whitespace-nowrap text-muted",
                      ALIGN[c.align ?? "left"],
                      c.className,
                    )}
                  >
                    {c.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() =>
                          onSortChange(
                            active && sort
                              ? { key: c.key, dir: sort.dir === "asc" ? "desc" : "asc" }
                              : { key: c.key, dir: "asc" },
                          )
                        }
                        aria-label={c.sortLabel ? `Trier par ${c.sortLabel}` : undefined}
                        className={cx(
                          "-mx-1.5 inline-flex min-h-8 items-center gap-1 rounded-[8px] px-1.5 transition-colors hover:bg-overlay-hover hover:text-ink",
                          active && "text-ink-strong",
                          c.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {c.header}
                        <SortIcon
                          aria-hidden="true"
                          className={cx("size-3.5", active ? "opacity-100" : "opacity-50")}
                        />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
              {rowActions ? (
                <th scope="col" className="px-4 py-3 text-right">
                  <span className="sr-only">{rowActionsLabel}</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={getRowKey(row)}
                className="border-b border-line transition-colors last:border-b-0 hover:bg-overlay-subtle"
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cx(
                      "px-4 py-3.5 align-middle text-ink-soft",
                      ALIGN[c.align ?? "left"],
                      c.nowrap && "whitespace-nowrap tabular",
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
                {rowActions ? (
                  <td className="px-4 py-3 text-right align-middle whitespace-nowrap">
                    <div className="inline-flex items-center justify-end gap-2">
                      {rowActions(row)}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* < md cards */}
      <ul aria-label={caption} className="flex flex-col gap-3 md:hidden">
        {sorted.map((row) => (
          <li key={getRowKey(row)} className="rounded-card border border-line bg-grad-card p-4">
            <div className="flex items-start justify-between gap-3">
              {primary ? (
                <div className="min-w-0 font-label text-[0.9375rem] font-semibold text-ink-strong">
                  {primary.cell(row)}
                </div>
              ) : null}
              {meta.length > 0 ? (
                <div className="flex shrink-0 flex-col items-end gap-1 text-right whitespace-nowrap">
                  {meta.map((c) => (
                    <div key={c.key} className="text-sm text-ink-soft tabular">
                      {c.cell(row)}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            {secondary.length > 0 ? (
              <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2.5 min-[340px]:grid-cols-2">
                {secondary.map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="font-label text-[0.8125rem] font-medium text-muted">
                      {c.header}
                    </dt>
                    <dd
                      className={cx(
                        "mt-0.5 text-sm text-ink-soft",
                        c.nowrap ? "whitespace-nowrap tabular" : "break-words",
                      )}
                    >
                      {c.cell(row)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {mobileFooter || rowActions ? (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
                {mobileFooter?.(row)}
                {rowActions?.(row)}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
