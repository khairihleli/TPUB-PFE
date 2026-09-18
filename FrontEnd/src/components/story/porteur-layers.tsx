import { Activity, Battery, CalendarRange, MonitorPlay, Radar, Shuffle, Wifi } from "lucide-react";
import type { ReactNode } from "react";

import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import {
  LAYERS,
  type LayerKey,
  PORTEUR_SECTION,
  type PorteurSharedKey,
} from "@/components/story/reseau-content";
import { cx } from "@/lib/cx";

const SHARED_ICON: Record<PorteurSharedKey, ReactNode> = {
  energie: <Battery />,
  connectivite: <Wifi />,
  supervision: <Radar />,
};

const LAYER_ICON: Record<LayerKey, ReactNode> = {
  ecrans: <MonitorPlay />,
  diffusion: <Shuffle />,
  campagnes: <CalendarRange />,
  suivi: <Activity />,
};

/** The four layers « du support au rapport », drawn as a stack on a rail. */
export function LayerStack({ className }: { className?: string }) {
  return (
    <div className={cx("relative", className)}>
      <p className="mb-4 flex items-center justify-between font-label text-[0.6875rem] font-semibold tracking-[0.18em] text-muted-2 uppercase">
        <span>Du support</span>
        <span aria-hidden="true" className="mx-4 h-px flex-1 bg-line" />
        <span>au rapport</span>
      </p>
      <Reveal
        as="ol"
        stagger
        aria-label="Du support au rapport : quatre couches"
        className="relative flex flex-col gap-3"
      >
        {LAYERS.map((layer, i) => {
          const focus = layer.key === "diffusion";
          return (
            <li
              key={layer.key}
              className="relative grid grid-cols-[40px_1fr] gap-4 sm:grid-cols-[48px_1fr] sm:gap-5"
            >
              {i < LAYERS.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute top-12 -bottom-3 left-[19.5px] w-px bg-[linear-gradient(180deg,var(--color-orange-line),var(--color-blue-line))] sm:top-14 sm:left-[23.5px]"
                />
              ) : null}
              <span
                aria-hidden="true"
                className={cx(
                  "relative inline-flex size-10 items-center justify-center rounded-full border bg-bg sm:size-12 [&_svg]:size-[18px] sm:[&_svg]:size-5",
                  focus
                    ? "border-orange-line text-brand-orange-text shadow-[0_0_24px_var(--color-orange-soft)]"
                    : "border-line-strong text-ink-soft",
                )}
              >
                {LAYER_ICON[layer.key]}
              </span>
              <div
                className={cx(
                  "relative overflow-hidden rounded-card border p-4 transition-[transform,border-color] duration-300 ease-smooth hover:translate-x-1 sm:p-5",
                  focus
                    ? "border-orange-line bg-orange-soft/60"
                    : "border-line bg-surface/55 hover:border-line-strong",
                )}
              >
                {focus ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-[3px] bg-grad-brand"
                  />
                ) : null}
                <p className="font-label text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-2 uppercase tabular">
                  Couche {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-1 font-display text-[1.0625rem] font-semibold text-ink-strong">
                  {layer.title}
                </h3>
                <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted">{layer.text}</p>
              </div>
            </li>
          );
        })}
      </Reveal>
    </div>
  );
}

/** Porteur as the carrier of the screen: shared functions + the four layers. */
export function PorteurSection() {
  return (
    <Section labelledBy="porteur-titre">
      <div className="grid grid-cols-1 gap-14 lg:grid-cols-[0.92fr_1.08fr] lg:gap-20 [&>*]:min-w-0">
        <Reveal variant="left" className="flex flex-col gap-5 lg:sticky lg:top-28 lg:self-start">
          <p className="eyebrow">{PORTEUR_SECTION.eyebrow}</p>
          <h2 id="porteur-titre" className="font-display text-h2 text-ink-strong">
            {PORTEUR_SECTION.title}{" "}
            <span className="text-gradient">{PORTEUR_SECTION.highlight}</span>
          </h2>
          <p className="max-w-[56ch] text-lead text-muted">{PORTEUR_SECTION.body}</p>

          <ul
            aria-label="Fonctions partagées avec le Porteur"
            className="mt-2 flex flex-col border-t border-line"
          >
            {PORTEUR_SECTION.shared.map((f) => (
              <li
                key={f.key}
                className="group/shared flex items-center gap-4 border-b border-line py-3.5"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-line bg-surface-2 text-brand-blue-text transition-transform duration-300 ease-smooth group-hover/shared:-rotate-6 [&_svg]:size-[18px]"
                >
                  {SHARED_ICON[f.key]}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                  <span className="font-display text-[0.9375rem] font-semibold text-ink-strong">
                    {f.label}
                  </span>
                  <span className="text-[0.875rem] text-muted">{f.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[0.8125rem] text-muted-2 italic">{PORTEUR_SECTION.mention}</p>
        </Reveal>

        <LayerStack />
      </div>
    </Section>
  );
}
