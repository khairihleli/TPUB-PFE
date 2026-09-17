"use client";

import { Download } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { statisticsApi } from "@/lib/api/endpoints";
import { presentError } from "@/lib/api/errors";
import type { StatisticsExportQuery } from "@/lib/api/types";

/** « Exporter en CSV » (GET /statistics/export.csv): `;` separated, decimal comma, UTF-8. */
export function CsvExportButton({
  query,
  label = "Exporter en CSV",
  size = "sm",
}: {
  query: StatisticsExportQuery;
  label?: string;
  size?: "sm" | "md";
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      size={size}
      iconLeft={<Download aria-hidden="true" />}
      loading={busy}
      loadingLabel="Export en cours"
      onClick={async () => {
        setBusy(true);
        try {
          const filename = await statisticsApi.exportCsv(query);
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
      }}
    >
      {label}
    </Button>
  );
}
