"use client";

import { useState } from "react";

import { type DataTableProps, DataTableView } from "@/components/ui/data-table";
import type { SortState } from "@/lib/url-state";

/** Internal: DataTable with sortable columns and no `onSortChange` keeps its sort in state. */
export function UncontrolledSortDataTable<T>(props: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(props.sort ?? null);
  return <DataTableView {...props} sort={sort} onSortChange={setSort} />;
}
