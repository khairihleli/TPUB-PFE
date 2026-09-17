"use client";

import { Download } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, type MenuAction } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { statisticsApi } from "@/lib/api/endpoints";
import { exportsApi } from "@/lib/api/endpoints-supervision";
import { presentError } from "@/lib/api/errors";
import type { StatisticsExportQuery } from "@/lib/api/types";

export type ExportFormat = "csv" | "xlsx" | "pdf";

export const EXPORT_LABEL: Record<ExportFormat, string> = {
  csv: "CSV (tableur)",
  xlsx: "Excel (.xlsx)",
  pdf: "PDF (rapport)",
};

/**
 * « Exporter » menu (docs/round2-contract.md §5.6): CSV, Excel or PDF of the same statistics query.
 * Replaces the CSV-only button on the statistics screens.
 */
export function ExportMenu({
  query,
  label = "Exporter",
  size = "sm",
  formats = ["csv", "xlsx", "pdf"],
}: {
  query: StatisticsExportQuery;
  label?: string;
  size?: "sm" | "md";
  formats?: readonly ExportFormat[];
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const run = async (format: ExportFormat) => {
    if (busy) return;
    setBusy(true);
    try {
      const filename =
        format === "csv"
          ? await statisticsApi.exportCsv(query)
          : format === "xlsx"
            ? await exportsApi.xlsx(query)
            : await exportsApi.pdf(query);
      toast({ title: "Export téléchargé", description: filename, variant: "success" });
    } catch (e) {
      toast({
        title: "Export impossible",
        description: presentError(e).message,
        variant: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const actions: MenuAction[] = formats.map((format) => ({
    label: EXPORT_LABEL[format],
    onSelect: () => void run(format),
  }));

  return (
    <DropdownMenu
      items={actions}
      align="end"
      trigger={
        <Button
          variant="secondary"
          size={size}
          iconLeft={<Download aria-hidden="true" />}
          loading={busy}
          loadingLabel="Export en cours"
        >
          {label}
        </Button>
      }
    />
  );
}
