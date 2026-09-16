"use client";

import {
  ChevronDown,
  Clock4,
  Info,
  RectangleHorizontal,
  RectangleVertical,
  Type,
} from "lucide-react";
import { useState } from "react";

import { CreativeDropzone } from "@/components/campaign/creative-dropzone";
import { useLocalCreative } from "@/components/campaign/creative-store";
import {
  OrientationToggle,
  ScreenMockup,
  type ScreenOrientation,
} from "@/components/campaign/screen-mockup";
import { CONTACT } from "@/content/site";
import type { CampaignResponse } from "@/lib/api/types";
import { frTypo } from "@/lib/fr-typo";

const GUIDANCE = [
  {
    icon: RectangleHorizontal,
    title: "Paysage 16:9",
    text: "Écrans et panneaux numériques, par exemple 1920 × 1080 px.",
  },
  {
    icon: RectangleVertical,
    title: "Portrait 9:16",
    text: "Totems et écrans verticaux, par exemple 1080 × 1920 px.",
  },
  { icon: Clock4, title: "10 secondes", text: "Durée d'un passage : un message, une idée." },
  {
    icon: Type,
    title: "Lisible à distance",
    text: "Texte court, contrasté, logo visible. Évitez « gratuit » ou « garanti » sans justification.",
  },
] as const;

export interface CreativePreviewSectionProps {
  campaign: CampaignResponse;
  /** Opened by default (e.g. a preview already exists). */
  defaultOpen?: boolean;
}

/**
 * Optional, collapsible « Aperçu du visuel (facultatif) » of step 3 (FLOW-08). Local preview
 * only, nothing is uploaded (no endpoint, contract §7.1).
 */
export function CreativePreviewSection({ campaign, defaultOpen }: CreativePreviewSectionProps) {
  const creative = useLocalCreative(campaign.id);
  const [orientation, setOrientation] = useState<ScreenOrientation>("landscape");
  const [open, setOpen] = useState(defaultOpen ?? creative !== null);

  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="group rounded-panel border border-line bg-surface"
    >
      <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 rounded-panel px-5 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-col">
          <span className="font-display text-[1rem] font-semibold text-ink-strong">
            Aperçu du visuel (facultatif)
          </span>
          <span className="text-[0.8125rem] text-muted">
            {creative
              ? `« ${creative.name} » · aperçu local, rien n'est envoyé`
              : "Prévisualisez votre visuel sur un écran. Rien n'est envoyé depuis cette page."}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180"
        />
      </summary>

      {open ? (
        <div className="border-t border-line p-5 sm:p-6">
          <p className="mb-5 flex gap-2 text-[0.8125rem] leading-relaxed text-muted">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-blue-text" />
            <span>
              Le dépôt de fichiers n&apos;est pas encore disponible : votre conseiller TPUB récupère
              le visuel après validation. Vous pouvez aussi l&apos;envoyer à{" "}
              <a
                href={`mailto:${CONTACT.email}`}
                className="text-brand-blue-text underline-offset-4 hover:underline"
              >
                {CONTACT.email}
              </a>
              .
            </span>
          </p>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] xl:items-start">
            <div className="flex min-w-0 flex-col gap-5">
              <CreativeDropzone campaignId={campaign.id} compact />
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
                {GUIDANCE.map(({ icon: Icon, title, text }) => (
                  <li key={title} className="flex gap-3 bg-surface p-4">
                    <Icon
                      aria-hidden="true"
                      className="mt-0.5 size-[18px] shrink-0 text-brand-orange-text"
                    />
                    <div>
                      <p className="font-label text-[0.8125rem] font-semibold text-ink-strong">
                        {title}
                      </p>
                      <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-muted">
                        {frTypo(text)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="min-w-0 rounded-panel border border-line p-5">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <p className="font-label text-[0.875rem] font-semibold text-ink-strong">
                  Aperçu à l&apos;écran
                </p>
                <OrientationToggle value={orientation} onChange={setOrientation} />
              </div>
              <ScreenMockup
                creative={creative}
                orientation={orientation}
                campaignName={campaign.name}
                objective={campaign.objective}
              />
              <p className="mt-4 text-[0.8125rem] leading-relaxed text-muted">
                Rendu indicatif : le cadrage final dépend de l&apos;écran. L&apos;aperçu reste sur
                cet appareil et disparaît si vous rechargez la page.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </details>
  );
}
