"use client";

import { type ReactNode, useId } from "react";

import { PORTEUR_ICONS, TONE_BG_SOFT, TONE_TEXT } from "@/components/map/porteur-visuals";
import type { SupportResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import {
  INFERRED_TYPE_HINT,
  INFERRED_TYPE_LABEL,
  PORTEUR_TYPES,
  resolvePorteurType,
} from "@/lib/network/porteur";

/** Numbered configurator section: « 01 · Identité ». */
export function ConfigSection({
  index,
  title,
  description,
  children,
  aside,
  className,
  id,
  focusable = false,
}: {
  id?: string;
  index: number;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
  /** Programmatic focus target (e.g. « Choisissez une campagne » from a gated button). */
  focusable?: boolean;
}) {
  const headingId = useId();
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      tabIndex={focusable ? -1 : undefined}
      className={cx(
        "relative scroll-mt-6 border-t border-line pt-6 first:border-t-0 first:pt-0 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue-text",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            aria-hidden="true"
            className="font-label text-[0.75rem] font-semibold text-brand-orange-text tabular"
          >
            {String(index).padStart(2, "0")}
          </p>
          <h3
            id={headingId}
            className="mt-1 font-display text-[1.0625rem] font-semibold text-ink-strong"
          >
            {title}
          </h3>
          {description ? (
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted">{description}</p>
          ) : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** « Type A · Panoramique » chip + « Typologie estimée » when inferred. */
export function PorteurTypeBadges({
  support,
  size = "md",
  className,
}: {
  support: Pick<SupportResponse, "supportType" | "porteurType">;
  size?: "sm" | "md";
  className?: string;
}) {
  const { type, inferred } = resolvePorteurType(support);
  const meta = PORTEUR_TYPES[type];
  const Icon = PORTEUR_ICONS[meta.icon];
  // Both sizes read at 12 px minimum (VD-17); `size` only tightens the line height.
  const text = size === "sm" ? "text-[0.75rem] leading-snug" : "text-[0.75rem]";
  return (
    <span className={cx("inline-flex flex-wrap items-center gap-1.5", className)}>
      <span
        className={cx(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-label font-semibold",
          text,
          TONE_BG_SOFT[meta.tone],
          TONE_TEXT[meta.tone],
        )}
      >
        <Icon aria-hidden="true" className="size-3.5" />
        Type {type} · {meta.name}
      </span>
      {inferred ? (
        <span
          title={INFERRED_TYPE_HINT}
          className={cx(
            "inline-flex items-center rounded-full border border-dashed border-line-strong px-2 py-0.5 font-label text-muted",
            text,
          )}
        >
          {INFERRED_TYPE_LABEL}
          <span className="sr-only"> : {INFERRED_TYPE_HINT}</span>
        </span>
      ) : null}
    </span>
  );
}

export interface ChoiceOption<V extends string> {
  value: V;
  label: string;
  detail?: string;
  disabled?: boolean;
}

/**
 * Radio chips (native radios: arrow keys move the choice, one tab stop). Used for day-parts and
 * compact binary choices.
 */
export function ChoiceChips<V extends string>({
  legend,
  hideLegend = false,
  name,
  value,
  options,
  onChange,
  disabled = false,
  className,
  columns,
}: {
  legend: string;
  hideLegend?: boolean;
  name: string;
  value: V;
  options: readonly ChoiceOption<V>[];
  onChange: (value: V) => void;
  disabled?: boolean;
  className?: string;
  columns?: string;
}) {
  return (
    <fieldset className={cx("min-w-0", className)} disabled={disabled}>
      <legend
        className={cx(
          "mb-2 font-label text-[0.8125rem] font-medium text-ink-soft",
          hideLegend && "sr-only",
        )}
      >
        {legend}
      </legend>
      <div className={cx("grid gap-1.5", columns ?? "grid-cols-2 sm:grid-cols-3")}>
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={cx(
                "group/chip relative flex min-h-touch cursor-pointer flex-col justify-center rounded-control border px-3 py-2 transition-[border-color,background-color,box-shadow] duration-200 ease-smooth has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-blue-text",
                checked
                  ? "border-brand-blue-text/60 bg-blue-soft shadow-blue"
                  : "border-line bg-overlay-inset hover:border-line-strong hover:bg-overlay-subtle",
                (option.disabled || disabled) && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                disabled={option.disabled}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span
                className={cx(
                  "font-label text-[0.8125rem] font-semibold",
                  checked ? "text-ink-strong" : "text-ink-soft",
                )}
              >
                {option.label}
              </span>
              {option.detail ? (
                <span
                  className={cx(
                    "text-[0.75rem] tabular",
                    checked ? "text-brand-blue-text" : "text-muted-2",
                  )}
                >
                  {option.detail}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Key/value of the identity grid (sentence-case label, 13 px). */
export function Fact({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("min-w-0", className)}>
      <dt className="font-label text-[0.8125rem] font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-[0.875rem] leading-snug text-ink-soft">{children}</dd>
    </div>
  );
}
