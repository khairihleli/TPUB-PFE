import { Eye } from "lucide-react";
import type { ReactNode } from "react";

import { ROLE_LABEL } from "@/lib/campaign-status";
import type { RoleCode } from "@/lib/api/types";
import { cx } from "@/lib/cx";

/** Section heading inside back-office pages (h2 by default). */
export function AdminSectionHeading({
  id,
  kicker,
  title,
  description,
  actions,
  as = "h2",
  className,
}: {
  id?: string;
  kicker?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  const Heading = as;
  return (
    <div className={cx("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0">
        {kicker ? (
          <p className="mb-1 font-label text-[0.8125rem] font-medium text-muted">{kicker}</p>
        ) : null}
        <Heading
          id={id}
          className="font-display text-[1.125rem] leading-snug font-semibold tracking-tight text-ink-strong"
        >
          {title}
        </Heading>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Discreet banner for SUPERVISEUR / OPERATEUR: what they can and cannot do here. */
export function ReadOnlyNotice({
  role,
  children,
  className,
}: {
  role: RoleCode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex items-start gap-3 rounded-card border border-blue-line bg-blue-soft px-4 py-3 text-sm text-ink-soft",
        className,
      )}
    >
      <Eye aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-brand-blue-text" />
      <p className="leading-relaxed">
        <span className="font-label font-semibold text-ink-strong">
          {ROLE_LABEL[role]} · lecture seule.
        </span>{" "}
        {children ?? "Les décisions et les modifications sont réservées aux administrateurs."}
      </p>
    </div>
  );
}

/** Label / value grid (definition list). */
export function FactList({
  items,
  columns = 2,
  className,
}: {
  items: readonly { label: string; value: ReactNode; wide?: boolean }[];
  columns?: 2 | 3;
  className?: string;
}) {
  return (
    <dl
      className={cx(
        "grid grid-cols-1 gap-x-6 gap-y-4 min-[420px]:grid-cols-2",
        columns === 3 && "md:grid-cols-3",
        className,
      )}
    >
      {items.map((it) => (
        <div
          key={it.label}
          className={cx("min-w-0", it.wide && "min-[420px]:col-span-2 md:col-span-full")}
        >
          <dt className="font-label text-[0.8125rem] font-medium text-muted">{it.label}</dt>
          <dd className="mt-1 text-[0.9375rem] break-words text-ink-soft">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Small monospace id chip: « #12 ». */
export function IdChip({ id, className }: { id: number; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md border border-line bg-overlay-subtle px-1.5 py-px font-mono text-xs text-muted tabular",
        className,
      )}
    >
      #{id}
    </span>
  );
}
