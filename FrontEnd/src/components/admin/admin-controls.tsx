"use client";

import { ChevronLeft, ChevronRight, Download, ShieldOff } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";

import { PERIOD_PRESETS, type PeriodPreset } from "@/components/admin/stats-model";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { statisticsApi } from "@/lib/api/endpoints";
import { presentError } from "@/lib/api/errors";
import type { PageResponse, StatisticsExportQuery } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { formatNumber } from "@/lib/format";
import { routes } from "@/lib/routes";

/** « Exporter en CSV » (GET /statistics/export.csv, `;`, decimal comma, UTF-8 BOM). */
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
        if (busy) return;
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

/** Previous / next pager for a backend `PageResponse` (0-based pages). */
export function PagerBar({
  page,
  noun,
  onPage,
  className,
}: {
  page: Pick<PageResponse<unknown>, "page" | "size" | "totalItems" | "totalPages">;
  /** Plural noun: « entrées ». */
  noun: string;
  onPage: (page: number) => void;
  className?: string;
}) {
  const { totalItems, totalPages } = page;
  const current = Math.min(page.page, Math.max(0, totalPages - 1));
  if (totalItems === 0) return null;
  const first = current * page.size + 1;
  const last = Math.min(totalItems, (current + 1) * page.size);
  return (
    <nav
      aria-label="Pagination"
      className={cx("flex flex-wrap items-center justify-between gap-3 pt-2", className)}
    >
      <p className="text-[0.8125rem] text-muted tabular" aria-live="polite">
        {formatNumber(first)}–{formatNumber(last)} sur {formatNumber(totalItems)} {noun}
      </p>
      {totalPages > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            iconLeft={<ChevronLeft aria-hidden="true" />}
            disabled={current <= 0}
            onClick={() => onPage(current - 1)}
          >
            Précédente
          </Button>
          <span className="text-[0.8125rem] text-muted tabular">
            Page {current + 1} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="secondary"
            iconRight={<ChevronRight aria-hidden="true" />}
            disabled={current >= totalPages - 1}
            onClick={() => onPage(current + 1)}
          >
            Suivante
          </Button>
        </div>
      ) : null}
    </nav>
  );
}

/** Segmented period picker (7 / 30 / 90 jours / personnalisée with two dates). */
export function PeriodPicker({
  preset,
  from,
  to,
  onChange,
}: {
  preset: PeriodPreset;
  from: string;
  to: string;
  onChange: (next: { preset: PeriodPreset; from?: string; to?: string }) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div
        role="group"
        aria-label="Période"
        className="flex flex-wrap gap-1 rounded-control border border-line-strong bg-overlay-inset p-1"
      >
        {PERIOD_PRESETS.map((p) => {
          const pressed = preset === p.value;
          return (
            <button
              key={p.value}
              type="button"
              aria-pressed={pressed}
              onClick={() => onChange({ preset: p.value, from, to })}
              className={cx(
                "min-h-9 rounded-[9px] px-3 font-label text-[0.8125rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-text",
                pressed ? "bg-surface-3 text-ink-strong shadow-lift" : "text-muted hover:text-ink",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      {preset === "custom" ? (
        <>
          <Field label="Du" className="w-40">
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => onChange({ preset, from: e.target.value, to })}
            />
          </Field>
          <Field label="Au" className="w-40">
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => onChange({ preset, from, to: e.target.value })}
            />
          </Field>
        </>
      ) : null}
    </div>
  );
}

/** Page shown to a staff role that is not allowed on a back-office section. */
export function RoleRestricted({
  title,
  description,
  header,
}: {
  title: string;
  description: string;
  header: ReactNode;
}) {
  return (
    <>
      {header}
      <EmptyState
        icon={<ShieldOff />}
        title={title}
        description={description}
        action={
          <Button asChild variant="secondary">
            <Link href={routes.admin.home()}>Retour à la vue d&apos;ensemble</Link>
          </Button>
        }
      />
    </>
  );
}

/** Compact label/value chip row (« Clics 12 · Interactions 3 »). */
export function InlineFigures({
  items,
  className,
}: {
  items: readonly { label: string; value: ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={cx("flex flex-wrap gap-x-5 gap-y-1.5 text-[0.8125rem]", className)}>
      {items.map((it) => (
        <div key={it.label} className="inline-flex items-baseline gap-1.5">
          <dt className="text-muted">{it.label}</dt>
          <dd className="font-label font-semibold text-ink-strong tabular">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
