"use client";

import { ArrowRight, Check, Copy, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import {
  BUILDER_CRITERIA,
  buildMediaPlanHref,
  buildMediaPlanMessage,
  type ChoiceOption,
  countSpecifiedCriteria,
  criterionLabels,
  EMPTY_SELECTION,
  type FieldSpec,
  labelFor,
  type MediaPlanSelection,
  PROFILE_FIELD,
  toggleValue,
} from "@/components/offer/media-plan";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { cx } from "@/lib/cx";

interface ChoiceChipProps {
  type: "checkbox" | "radio";
  name: string;
  option: ChoiceOption;
  checked: boolean;
  onChange: () => void;
}

/** Pill-shaped native checkbox/radio (44px target, visible focus, state not colour-only). */
function ChoiceChip({ type, name, option, checked, onChange }: ChoiceChipProps) {
  return (
    <label className="relative inline-flex cursor-pointer">
      <input
        type={type}
        name={name}
        value={option.value}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        className={cx(
          "inline-flex min-h-touch items-center gap-2 rounded-full border border-line-strong bg-white/[0.02] py-2 pr-4 pl-2.5 text-[0.875rem] leading-tight text-ink-soft",
          "transition-[border-color,background-color,color] duration-200 ease-smooth hover:border-muted-2 hover:text-ink-strong",
          "peer-checked:border-orange-line peer-checked:bg-orange-soft peer-checked:text-ink-strong",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-blue-text",
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            "inline-flex size-5 shrink-0 items-center justify-center border transition-colors",
            type === "radio" ? "rounded-full" : "rounded-[6px]",
            checked
              ? "border-brand-orange bg-brand-orange text-on-orange"
              : "border-line-strong text-transparent",
          )}
        >
          <Check className="size-3.5" strokeWidth={3} />
        </span>
        {option.label}
      </span>
    </label>
  );
}

interface FieldRendererProps {
  field: FieldSpec;
  selection: MediaPlanSelection;
  onChange: (next: MediaPlanSelection) => void;
}

function FieldRenderer({ field, selection, onChange }: FieldRendererProps) {
  if (field.kind === "text") {
    return (
      <Field label={field.legend} hint={field.hint}>
        <Input
          name={field.key}
          value={selection.zones}
          maxLength={200}
          placeholder={field.placeholder}
          autoComplete="off"
          onChange={(e) => onChange({ ...selection, zones: e.target.value })}
        />
      </Field>
    );
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <legend className="mb-3 font-label text-[0.8125rem] font-semibold text-ink">
        {field.legend}
        {field.kind === "multi" ? (
          <span className="ml-2 font-sans font-normal text-muted-2">plusieurs choix possibles</span>
        ) : null}
      </legend>
      <div className="flex flex-wrap gap-2.5">
        {field.options.map((option) =>
          field.kind === "multi" ? (
            <ChoiceChip
              key={option.value}
              type="checkbox"
              name={field.key}
              option={option}
              checked={selection[field.key].includes(option.value)}
              onChange={() =>
                onChange({
                  ...selection,
                  [field.key]: toggleValue(selection[field.key], option.value),
                })
              }
            />
          ) : (
            <ChoiceChip
              key={option.value}
              type="radio"
              name={field.key}
              option={option}
              checked={selection[field.key] === option.value}
              onChange={() => onChange({ ...selection, [field.key]: option.value })}
            />
          ),
        )}
      </div>
    </fieldset>
  );
}

export interface MediaPlanBuilderProps {
  className?: string;
}

/**
 * Interactive brief: the visitor ticks what they already know about each pricing criterion,
 * copies the brief and is routed to /contact?besoin=plan-media&…#formulaire. Never shows a price.
 * The contact page currently prefills only `profil` and `besoin` from the query (the other keys
 * are carried for when it reads them), hence the explicit « Copier mon brief » step.
 * Works without JS as a native GET form to /contact (same parameter names).
 */
export function MediaPlanBuilder({ className }: MediaPlanBuilderProps) {
  const router = useRouter();
  const [selection, setSelection] = useState<MediaPlanSelection>(EMPTY_SELECTION);

  const specified = countSpecifiedCriteria(selection);
  const total = BUILDER_CRITERIA.length;
  const profileLabel = labelFor("profil", selection.profil);
  const isEmpty = specified === 0 && !profileLabel;
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  function update(next: MediaPlanSelection) {
    setSelection(next);
    setCopy("idle");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(`${buildMediaPlanHref(selection)}#formulaire`);
  }

  async function handleCopy() {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(buildMediaPlanMessage(selection));
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <form
      action="/contact"
      method="get"
      onSubmit={handleSubmit}
      aria-label="Construire mon plan média"
      className={cx(
        "grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,370px)] lg:gap-10",
        className,
      )}
    >
      <input type="hidden" name="besoin" value="plan-media" />

      <div className="overflow-hidden rounded-panel border border-line bg-surface/40">
        <div className="grid gap-4 border-b border-line bg-white/[0.015] p-5 sm:p-7 md:grid-cols-[180px_minmax(0,1fr)] md:gap-8 lg:grid-cols-1 lg:gap-4 xl:grid-cols-[180px_minmax(0,1fr)] xl:gap-8">
          <div className="flex items-baseline gap-3 md:flex-col md:gap-1 lg:flex-row lg:gap-3 xl:flex-col xl:gap-1">
            <span className="font-label text-xs font-semibold tracking-[0.18em] text-muted-2 tabular">
              00
            </span>
            <h3 className="font-display text-lg font-semibold text-ink-strong">Votre profil</h3>
          </div>
          <FieldRenderer field={PROFILE_FIELD} selection={selection} onChange={update} />
        </div>

        <ol className="divide-y divide-line">
          {BUILDER_CRITERIA.map((criterion) => {
            const done = criterionLabels(criterion, selection).length > 0;
            return (
              <li
                key={criterion.id}
                id={`brief-${criterion.id}`}
                className="grid gap-4 p-5 transition-colors duration-700 target:bg-orange-soft sm:p-7 md:grid-cols-[180px_minmax(0,1fr)] md:gap-8 lg:grid-cols-1 lg:gap-4 xl:grid-cols-[180px_minmax(0,1fr)] xl:gap-8"
              >
                <div className="flex items-baseline gap-3 md:flex-col md:gap-1 lg:flex-row lg:gap-3 xl:flex-col xl:gap-1">
                  <span
                    className={cx(
                      "font-label text-xs font-semibold tracking-[0.18em] tabular transition-colors",
                      done ? "text-brand-orange-text" : "text-muted-2",
                    )}
                  >
                    {criterion.number}
                  </span>
                  <h3 className="font-display text-lg font-semibold text-ink-strong">
                    {criterion.title}
                  </h3>
                </div>
                <div className="flex min-w-0 flex-col gap-6">
                  {criterion.fields.map((field) => (
                    <FieldRenderer
                      key={field.key}
                      field={field}
                      selection={selection}
                      onChange={update}
                    />
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <aside
        aria-label="Récapitulatif de votre brief"
        className="glass flex flex-col gap-6 rounded-panel p-6 shadow-card sm:p-7 lg:sticky lg:top-[calc(var(--header-h)+24px)]"
      >
        <div className="flex flex-col gap-3">
          <p className="eyebrow">Votre brief</p>
          <p aria-live="polite" className="font-display text-2xl font-semibold text-ink-strong">
            <span className="tabular">{specified}</span> critère{specified > 1 ? "s" : ""} sur{" "}
            {total} précisé{specified > 1 ? "s" : ""}
          </p>
          <div aria-hidden="true" className="grid grid-cols-6 gap-1.5">
            {BUILDER_CRITERIA.map((criterion) => (
              <span
                key={criterion.id}
                className={cx(
                  "h-1 rounded-full transition-colors duration-300",
                  criterionLabels(criterion, selection).length > 0
                    ? "bg-grad-brand"
                    : "bg-line-strong",
                )}
              />
            ))}
          </div>
        </div>

        <dl className="flex flex-col divide-y divide-line border-y border-line text-[0.875rem]">
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-muted">Profil</dt>
            <dd className={cx("text-right", profileLabel ? "text-ink-strong" : "text-muted-2")}>
              {profileLabel ?? "À préciser"}
            </dd>
          </div>
          {BUILDER_CRITERIA.map((criterion) => {
            const labels = criterionLabels(criterion, selection);
            return (
              <div key={criterion.id} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="shrink-0 text-muted">{criterion.title}</dt>
                <dd
                  className={cx(
                    "min-w-0 text-right break-words",
                    labels.length > 0 ? "text-ink-strong" : "text-muted-2",
                  )}
                >
                  {labels.length > 0 ? labels.join(", ") : "À préciser"}
                </dd>
              </div>
            );
          })}
        </dl>

        <p className="text-[0.8125rem] leading-relaxed text-muted">
          Aucun prix n&apos;est calculé ici. Le formulaire de contact s&apos;ouvre avec le besoin
          «&nbsp;Plan média&nbsp;» et votre profil présélectionnés&nbsp;: collez-y votre brief dans
          le message. Rien n&apos;est envoyé avant que vous validiez ce formulaire.
        </p>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="secondary"
            size="md"
            fullWidth
            iconLeft={copy === "copied" ? <Check /> : <Copy />}
            disabled={isEmpty}
            onClick={() => void handleCopy()}
          >
            {copy === "copied" ? "Brief copié" : "Copier mon brief"}
          </Button>
          <p aria-live="polite" className="text-center text-[0.8125rem] text-muted empty:sr-only">
            {copy === "copied"
              ? "Collez-le dans le champ « Message » du formulaire."
              : copy === "failed"
                ? "Copie impossible : sélectionnez le texte ci-dessous."
                : ""}
          </p>
          {copy === "failed" ? (
            <Field label="Texte de votre brief">
              <Textarea readOnly rows={6} value={buildMediaPlanMessage(selection)} />
            </Field>
          ) : null}
          <Button type="submit" variant="brand" size="lg" fullWidth iconRight={<ArrowRight />}>
            Continuer vers le formulaire
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="md"
            fullWidth
            iconLeft={<RotateCcw />}
            disabled={isEmpty}
            onClick={() => update(EMPTY_SELECTION)}
          >
            Tout effacer
          </Button>
        </div>
      </aside>
    </form>
  );
}
