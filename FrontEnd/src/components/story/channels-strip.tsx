import { AppWindow, Globe, MonitorPlay, PanelsTopLeft, Wifi } from "lucide-react";
import type { ReactNode } from "react";

import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { SectionHeader } from "@/components/marketing/section-header";
import { CHANNELS_SECTION } from "@/components/story/reseau-content";
import type { SupportType } from "@/lib/api/types";
import { SUPPORT_TYPE_LABEL } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";

const CHANNEL_ICON: Record<SupportType, ReactNode> = {
  ECRAN: <MonitorPlay />,
  PANNEAU_NUMERIQUE: <PanelsTopLeft />,
  POINT_WIFI: <Wifi />,
  APPLICATION: <AppWindow />,
  SITE_WEB: <Globe />,
};

/** Order of display; connected channels can also report clicks and interactions. */
export const CHANNELS: readonly { type: SupportType; connected: boolean }[] = [
  { type: "ECRAN", connected: false },
  { type: "PANNEAU_NUMERIQUE", connected: false },
  { type: "POINT_WIFI", connected: true },
  { type: "APPLICATION", connected: true },
  { type: "SITE_WEB", connected: true },
];

/** « Au-delà de l'écran » — support types planned by the platform. */
export function ChannelsStrip() {
  return (
    <Section labelledBy="canaux-titre">
      <SectionHeader
        id="canaux-titre"
        eyebrow={CHANNELS_SECTION.eyebrow}
        title={CHANNELS_SECTION.title}
        highlight={CHANNELS_SECTION.highlight}
        lede={CHANNELS_SECTION.text}
        align="split"
      />
      <div className="overflow-hidden rounded-panel border border-line bg-surface/30">
        <Reveal
          as="ul"
          stagger
          aria-label="Types de supports prévus par la plateforme"
          className="-mr-px -mb-px grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
        >
          {CHANNELS.map((c, i) => (
            <li
              key={c.type}
              className={cx(
                "group/channel relative flex min-h-[168px] flex-col gap-5 border-line p-5 transition-colors duration-300 hover:bg-white/[0.025] sm:p-6",
                "border-b border-r",
                i === CHANNELS.length - 1 && "col-span-2 lg:col-span-1",
              )}
            >
              <span
                aria-hidden="true"
                className={cx(
                  "inline-flex size-11 items-center justify-center rounded-control border transition-transform duration-300 ease-smooth group-hover/channel:-translate-y-0.5 group-hover/channel:-rotate-6 [&_svg]:size-5",
                  c.connected
                    ? "border-blue-line bg-blue-soft text-brand-blue-text"
                    : "border-orange-line bg-orange-soft text-brand-orange-text",
                )}
              >
                {CHANNEL_ICON[c.type]}
              </span>
              <span className="flex flex-col gap-2">
                <span className="font-display text-[1.0625rem] font-semibold text-ink-strong">
                  {SUPPORT_TYPE_LABEL[c.type]}
                </span>
                <span
                  className={cx(
                    "w-fit rounded-full border px-2 py-0.5 font-label text-[0.6875rem] font-semibold",
                    c.connected
                      ? "border-blue-line text-brand-blue-text"
                      : "border-line-strong text-muted",
                  )}
                >
                  {c.connected ? CHANNELS_SECTION.interactiveNote : "Diffusion"}
                </span>
              </span>
            </li>
          ))}
        </Reveal>
      </div>
    </Section>
  );
}
