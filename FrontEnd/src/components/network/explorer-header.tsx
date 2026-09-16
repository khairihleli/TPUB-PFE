"use client";

import {
  Box,
  CircleDashed,
  CircleHelp,
  Keyboard,
  ListChecks,
  PanelRightClose,
  PanelRightOpen,
  Ruler,
  X,
} from "lucide-react";
import { Popover } from "radix-ui";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { cx } from "@/lib/cx";

export interface ExplorerHeaderProps {
  zoneCount: number;
  porteurCount: number;
  bookableCount: number;
  panelOpen?: boolean;
  /** Desktop side panel toggle (hidden when omitted). */
  onTogglePanel?: () => void;
}

function Stat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-full border border-line bg-surface px-3 py-1">
      <span className={cx("font-display text-[0.9375rem] font-semibold tabular", tone)}>
        {value}
      </span>
      <span className="text-[0.75rem] text-muted">{label}</span>
    </span>
  );
}

const HELP: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: <ListChecks />,
    title: "Composer une sélection",
    text: "Touchez une zone sur la carte pour sélectionner ses Porteurs réservables, ou utilisez « + » dans la liste.",
  },
  {
    icon: <Box />,
    title: "Studio 3D",
    text: "Touchez un Porteur, ou le bouton « Ouvrir le Studio 3D » de la liste : choisissez une campagne, vérifiez le créneau, prévisualisez votre visuel puis réservez.",
  },
  {
    icon: <CircleDashed />,
    title: "Zone de chalandise",
    text: "Placez un centre, réglez le rayon, puis sélectionnez les Porteurs réservables qu'il contient.",
  },
  {
    icon: <Ruler />,
    title: "Mesurer",
    text: "Cliquez plusieurs points pour mesurer une distance ; Échap termine la mesure.",
  },
];

const SHORTCUTS: [string, string][] = [
  ["+ / −", "Zoom"],
  ["M", "Mesurer"],
  ["C", "Zone de chalandise"],
  ["F", "Filtres"],
  ["L", "Légende"],
  ["Échap", "Fermer l'outil"],
];

/** Title strip of the explorer: counts, « Aide » popover, side panel toggle. */
export function ExplorerHeader({
  zoneCount,
  porteurCount,
  bookableCount,
  panelOpen = true,
  onTogglePanel,
}: ExplorerHeaderProps) {
  return (
    <PageHeader
      title="Réseau & Studio 3D"
      className="mb-5! gap-3! sm:mb-6!"
      description={
        <span className="flex flex-wrap items-center gap-2">
          <Stat
            value={zoneCount}
            label={zoneCount > 1 ? "zones ouvertes" : "zone ouverte"}
            tone="text-brand-orange-text"
          />
          <Stat
            value={porteurCount}
            label={porteurCount > 1 ? "Porteurs" : "Porteur"}
            tone="text-ink-strong"
          />
          <Stat
            value={bookableCount}
            label={bookableCount > 1 ? "réservables" : "réservable"}
            tone="text-success"
          />
        </span>
      }
      secondaryActions={
        <>
          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                type="button"
                className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-control border border-line-strong bg-surface px-4 font-label text-[0.8125rem] font-semibold text-ink-soft transition-colors hover:border-muted-2 hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text data-[state=open]:border-brand-blue-text/60 data-[state=open]:text-ink-strong"
              >
                <CircleHelp aria-hidden="true" className="size-4 text-brand-blue-text" />
                Aide
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="end"
                sideOffset={8}
                collisionPadding={12}
                className="z-(--z-overlay) w-[min(24rem,calc(100vw-1.5rem))] animate-panel-in rounded-card border border-line-strong bg-surface-2 p-4 shadow-card focus:outline-none"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-display text-[0.9375rem] font-semibold text-ink-strong">
                    Explorer le réseau
                  </p>
                  <Popover.Close
                    aria-label="Fermer l'aide"
                    className="-mt-1 -mr-1 grid size-8 cursor-pointer place-items-center rounded-full text-muted hover:bg-overlay-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-blue-text"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </Popover.Close>
                </div>
                <ul className="mt-3 flex flex-col gap-3">
                  {HELP.map((item) => (
                    <li key={item.title} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-line bg-overlay-inset text-brand-orange-text [&_svg]:size-4"
                      >
                        {item.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-label text-[0.8125rem] font-semibold text-ink-strong">
                          {item.title}
                        </span>
                        <span className="block text-[0.75rem] leading-relaxed text-muted">
                          {item.text}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 border-t border-line pt-3">
                  <p className="flex items-center gap-2 font-label text-[0.8125rem] font-medium text-muted">
                    <Keyboard aria-hidden="true" className="size-3.5" />
                    Raccourcis de la carte
                  </p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[0.75rem]">
                    {SHORTCUTS.map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between gap-2">
                        <dt className="text-muted">{label}</dt>
                        <dd>
                          <kbd className="rounded-[6px] border border-line-strong bg-overlay-inset px-1.5 py-0.5 font-label text-[0.75rem] text-ink-soft">
                            {key}
                          </kbd>
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-[0.75rem] leading-relaxed text-muted-2">
                    Dans le Studio 3D : touches 1 à 5 pour les points de vue, flèches pour tourner,
                    R pour réinitialiser.
                  </p>
                </div>
                <Popover.Arrow className="fill-surface-2" />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          {onTogglePanel ? (
            <button
              type="button"
              onClick={onTogglePanel}
              aria-expanded={panelOpen}
              aria-controls="reseau-panneau"
              className="hidden min-h-10 cursor-pointer items-center gap-2 rounded-control border border-line-strong bg-surface px-4 font-label text-[0.8125rem] font-semibold text-ink-soft transition-colors hover:border-muted-2 hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text lg:inline-flex"
            >
              {panelOpen ? (
                <PanelRightClose aria-hidden="true" className="size-4" />
              ) : (
                <PanelRightOpen aria-hidden="true" className="size-4" />
              )}
              {panelOpen ? "Masquer le panneau" : "Afficher le panneau"}
            </button>
          ) : null}
        </>
      }
    />
  );
}
