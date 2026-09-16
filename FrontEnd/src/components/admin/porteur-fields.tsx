"use client";

import { Check, TriangleAlert } from "lucide-react";
import Image from "next/image";

import {
  COMPASS_POINTS,
  headingSentence,
  OrientationDial,
} from "@/components/admin/orientation-dial";
import {
  MAST_HEIGHT_OPTIONS,
  PORTEUR_TYPE_OPTIONS,
  type SupportFormValues,
} from "@/components/admin/network-schemas";
import { Field, Input } from "@/components/ui/field";
import { cx } from "@/lib/cx";
import { parseInteger } from "@/components/admin/form-utils";
import {
  DESIGN_INTENTION_NOTICE,
  isPorteurType,
  MAST_HEIGHTS,
  PORTEUR_TYPES,
  resolvePorteurType,
} from "@/lib/network/porteur";
import type { SupportType } from "@/lib/api/types";

type PorteurKey = "porteurType" | "mastHeightM" | "headingDeg";

const legendClass = "font-label text-[0.8125rem] font-semibold text-ink-strong";
const errorClass = "mt-2 text-[0.8125rem] text-danger";

/**
 * Porteur section of the support form: type cards (A–D with the static renders), mast height,
 * orientation (compass dial + numeric field + compass shortcuts). Native radio groups, so arrow
 * keys work and every choice is announced.
 */
export function PorteurFields({
  idPrefix,
  values,
  errors,
  onChange,
  /** The support already has a declared type: « Non déclaré » is no longer offered (PUT null = unchanged). */
  typeLocked,
  heightLocked,
  headingLocked,
}: {
  idPrefix: string;
  values: SupportFormValues;
  errors: Partial<Record<PorteurKey, string>>;
  onChange: (key: PorteurKey, value: string) => void;
  typeLocked: boolean;
  heightLocked: boolean;
  headingLocked: boolean;
}) {
  const declared = isPorteurType(values.porteurType) ? values.porteurType : null;
  const estimated = resolvePorteurType({
    supportType: values.supportType as SupportType,
    porteurType: declared,
  });
  const headingValue = parseInteger(values.headingDeg);
  const heading =
    headingValue !== null && headingValue >= 0 && headingValue <= 359 ? headingValue : null;
  const shownType = declared ?? estimated.type;
  const typeErrorId = `${idPrefix}-type-erreur`;
  const heightErrorId = `${idPrefix}-hauteur-erreur`;

  return (
    <div className="flex flex-col gap-6">
      {/* Type */}
      <fieldset aria-describedby={errors.porteurType ? typeErrorId : undefined}>
        <legend className={legendClass}>Type de Porteur</legend>
        <p className="mt-1 text-[0.8125rem] text-muted">
          {declared
            ? "Typologie déclarée : elle pilote la carte, le studio 3D et la réservation."
            : `Non déclaré : la carte affiche une typologie estimée (type ${estimated.type}) d'après le type de support.`}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {PORTEUR_TYPE_OPTIONS.map((code) => {
            const meta = PORTEUR_TYPES[code];
            const checked = values.porteurType === code;
            return (
              <label
                key={code}
                className={cx(
                  "group relative flex cursor-pointer flex-col overflow-hidden rounded-card border bg-surface-2/60 transition-[border-color,background-color,box-shadow] duration-200 ease-smooth has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-blue-text",
                  checked
                    ? "border-brand-blue-text/70 bg-blue-soft/60 shadow-blue"
                    : "border-line hover:border-line-strong",
                )}
              >
                <input
                  type="radio"
                  name={`${idPrefix}-porteur-type`}
                  value={code}
                  checked={checked}
                  onChange={() => onChange("porteurType", code)}
                  className="sr-only"
                />
                <span className="relative block aspect-[4/5] bg-[radial-gradient(circle_at_50%_30%,var(--color-surface-3),var(--color-bg))]">
                  <Image
                    src={meta.image}
                    alt=""
                    fill
                    sizes="(min-width: 640px) 150px, 45vw"
                    className={cx(
                      "object-contain p-2 transition-transform duration-300 ease-smooth group-hover:scale-[1.03]",
                      !checked && "opacity-80",
                    )}
                  />
                  <span
                    aria-hidden="true"
                    className={cx(
                      "absolute top-2 left-2 grid size-7 place-items-center rounded-full border font-display text-xs font-bold",
                      checked
                        ? "border-brand-blue bg-brand-blue text-on-brand"
                        : "border-line-strong bg-bg/70 text-ink-strong",
                    )}
                  >
                    {checked ? <Check className="size-3.5" /> : code}
                  </span>
                </span>
                <span className="flex flex-col gap-0.5 px-2.5 py-2">
                  <span className="font-label text-[0.8125rem] font-semibold text-ink-strong">
                    Type {code} · {meta.name}
                  </span>
                  <span className="text-xs leading-snug text-muted">{meta.context}</span>
                </span>
              </label>
            );
          })}
        </div>
        {!typeLocked ? (
          <label className="mt-2.5 inline-flex min-h-touch cursor-pointer items-center gap-2 text-[0.8125rem] text-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-blue-text">
            <input
              type="radio"
              name={`${idPrefix}-porteur-type`}
              value=""
              checked={values.porteurType === ""}
              onChange={() => onChange("porteurType", "")}
              className="size-4 accent-brand-blue"
            />
            Non déclaré (typologie estimée)
          </label>
        ) : (
          <p className="mt-2 text-[0.75rem] text-muted-2">
            Une typologie déclarée peut être modifiée mais pas effacée.
          </p>
        )}
        {values.porteurType === "D" && values.supportType === "ECRAN" ? (
          <p className="mt-2 flex gap-1.5 text-[0.8125rem] text-warning">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Un Porteur de type D n&apos;a pas d&apos;écran : choisissez un autre type de support que
            « Écran ».
          </p>
        ) : null}
        {errors.porteurType ? (
          <p id={typeErrorId} className={errorClass}>
            {errors.porteurType}
          </p>
        ) : null}
      </fieldset>

      {/* Mast height */}
      <fieldset aria-describedby={errors.mastHeightM ? heightErrorId : undefined}>
        <legend className={legendClass}>Hauteur de mât</legend>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MAST_HEIGHT_OPTIONS.map((h) => {
            const meta = MAST_HEIGHTS.find((m) => String(m.value) === h);
            const checked = values.mastHeightM === h;
            return (
              <label
                key={h}
                title={meta?.description}
                className={cx(
                  "flex min-h-touch cursor-pointer flex-col items-start justify-center rounded-control border px-3 py-2 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-blue-text",
                  checked
                    ? "border-brand-blue-text/70 bg-blue-soft/60"
                    : "border-line bg-surface-2/60 hover:border-line-strong",
                )}
              >
                <input
                  type="radio"
                  name={`${idPrefix}-mat`}
                  value={h}
                  checked={checked}
                  onChange={() => onChange("mastHeightM", h)}
                  className="sr-only"
                />
                <span className="font-display text-base font-semibold text-ink-strong tabular">
                  {h} m
                </span>
                <span className="text-xs text-muted">{meta?.tier}</span>
              </label>
            );
          })}
        </div>
        {!heightLocked ? (
          <label className="mt-2 inline-flex min-h-touch cursor-pointer items-center gap-2 text-[0.8125rem] text-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-blue-text">
            <input
              type="radio"
              name={`${idPrefix}-mat`}
              value=""
              checked={values.mastHeightM === ""}
              onChange={() => onChange("mastHeightM", "")}
              className="size-4 accent-brand-blue"
            />
            Non déclarée (20 m par défaut dans le studio 3D)
          </label>
        ) : null}
        {errors.mastHeightM ? (
          <p id={heightErrorId} className={errorClass}>
            {errors.mastHeightM}
          </p>
        ) : null}
      </fieldset>

      {/* Orientation */}
      <fieldset>
        <legend className={legendClass}>Orientation de l&apos;écran principal</legend>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
          <OrientationDial
            value={heading}
            type={shownType}
            onChange={(deg) => onChange("headingDeg", String(deg))}
            disabled={shownType === "D"}
            className="self-center sm:self-start"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <Field
              label="Orientation (degrés)"
              hint={
                shownType === "D"
                  ? "Type D : sans écran, orientation facultative."
                  : heading !== null
                    ? `${headingSentence(heading)}. 0 = nord, sens horaire.`
                    : "0 = nord, 90 = est, sens horaire. Cliquez ou glissez sur la boussole."
              }
              error={errors.headingDeg}
            >
              <Input
                value={values.headingDeg}
                inputMode="numeric"
                autoComplete="off"
                placeholder={headingLocked ? undefined : "Non déclarée"}
                onChange={(e) =>
                  onChange("headingDeg", e.target.value.replace(/[^\d]/g, "").slice(0, 3))
                }
                onKeyDown={(e) => {
                  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                  e.preventDefault();
                  const step = (e.shiftKey ? 15 : 1) * (e.key === "ArrowUp" ? 1 : -1);
                  const next = ((((heading ?? 0) + step) % 360) + 360) % 360;
                  onChange("headingDeg", String(next));
                }}
              />
            </Field>
            <div role="group" aria-label="Orientations rapides" className="flex flex-wrap gap-1.5">
              {COMPASS_POINTS.map(({ deg, label }) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={heading === deg}
                  aria-label={`${label} (${deg}°)`}
                  onClick={() => onChange("headingDeg", String(deg))}
                  className={cx(
                    "min-h-9 min-w-10 rounded-full border px-2.5 font-label text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-text",
                    heading === deg
                      ? "border-orange-line bg-orange-soft text-brand-orange-text"
                      : "border-line text-muted hover:border-line-strong hover:text-ink",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {headingLocked ? (
              <p className="text-[0.75rem] text-muted-2">
                Une orientation déclarée peut être modifiée mais pas effacée.
              </p>
            ) : null}
          </div>
        </div>
      </fieldset>

      <p className="rounded-control border border-line bg-overlay-inset px-3 py-2 text-[0.75rem] leading-relaxed text-muted-2">
        {DESIGN_INTENTION_NOTICE}
      </p>
    </div>
  );
}
