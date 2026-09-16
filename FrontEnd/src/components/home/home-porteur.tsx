import { ArrowUpRight, Battery, CloudSun, Database, MonitorPlay, Radar, Wifi } from "lucide-react";
import type { ReactNode } from "react";

import { PORTEUR, type PorteurFunctionKey } from "@/components/home/content";
import { ImageFrame } from "@/components/marketing/image-frame";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { Button } from "@/components/ui/button";
import { GROUP } from "@/content/site";
import { cx } from "@/lib/cx";

const FUNCTION_ICON: Record<PorteurFunctionKey, ReactNode> = {
  connectivite: <Wifi />,
  ecran: <MonitorPlay />,
  meteo: <CloudSun />,
  energie: <Battery />,
  supervision: <Radar />,
  stockage: <Database />,
};

/** Porteur / group anchoring: panoramic frame, statement, and the Porteur functions around TPUB. */
export function HomePorteur() {
  return (
    <Section tone="band" labelledBy="porteur-titre">
      <Reveal variant="zoom">
        <ImageFrame
          src="/images/coastal-billboard.jpg"
          alt="Panneau d'affichage numérique en bord de mer au coucher du soleil"
          ratio="21/9"
          sizes="(min-width: 1240px) 1130px, 100vw"
          scrim="side"
          label="Illustration"
          objectPosition="center 60%"
          className="min-h-[250px] shadow-card"
        >
          {/* Caption shown at every width: on phones the frame was a dark box with a lone chip. */}
          <div className="flex h-full items-end p-5 sm:p-8 lg:p-10">
            <p className="max-w-[26ch] font-display text-[clamp(1.125rem,2.6vw,2rem)] leading-tight font-semibold text-ink-strong">
              {PORTEUR.banner}
            </p>
          </div>
        </ImageFrame>
      </Reveal>

      <div className="mt-14 grid grid-cols-1 gap-12 lg:mt-20 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16 [&>*]:min-w-0">
        <Reveal variant="left" className="flex flex-col gap-5">
          <p className="eyebrow">{PORTEUR.eyebrow}</p>
          <h2 id="porteur-titre" className="font-display text-h2 text-ink-strong">
            {PORTEUR.title} <span className="text-gradient">{PORTEUR.highlight}</span>
          </h2>
          <p className="max-w-[56ch] text-lead text-muted">{PORTEUR.body}</p>
          <p className="text-[0.8125rem] text-muted-2 italic">{PORTEUR.mention}</p>
          <div className="mt-2">
            <Button asChild variant="glass" size="lg">
              <a href={GROUP.porteurPage} target="_blank" rel="noopener noreferrer">
                {PORTEUR.cta}
                <ArrowUpRight aria-hidden="true" />
                <span className="sr-only"> (site du groupe Tukhnanutha, nouvel onglet)</span>
              </a>
            </Button>
          </div>
        </Reveal>

        <Reveal
          as="ul"
          stagger
          aria-label="Fonctions du Porteur"
          // Two columns from phone width (six stacked tiles were ~700px of scroll); centred on
          // desktop so tiles keep their natural height instead of stretching to the text column.
          className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:self-center"
        >
          {PORTEUR.functions.map((f) => {
            const self = f.key === "ecran";
            return (
              <li
                key={f.key}
                className={cx(
                  "group/fn relative flex flex-col items-start gap-3 overflow-hidden rounded-card border p-3.5 transition-[transform,border-color] duration-300 ease-smooth hover:translate-x-1 sm:flex-row sm:items-center sm:gap-4 sm:p-4",
                  self
                    ? "border-orange-line bg-orange-soft"
                    : "border-line bg-surface/50 hover:border-line-strong",
                )}
              >
                {self ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 w-[3px] bg-grad-brand"
                  />
                ) : null}
                <span
                  aria-hidden="true"
                  className={cx(
                    "inline-flex size-10 shrink-0 items-center justify-center rounded-control border transition-transform duration-300 ease-smooth group-hover/fn:-rotate-6 [&_svg]:size-5",
                    self
                      ? "border-orange-line bg-bg text-brand-orange-text"
                      : "border-line bg-surface-2 text-ink-soft",
                  )}
                >
                  {FUNCTION_ICON[f.key]}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-display text-[0.9375rem] font-semibold tracking-[0.04em] text-ink-strong">
                    {f.name}
                  </span>
                  <span className="text-[0.8125rem] leading-snug text-muted">{f.role}</span>
                </span>
              </li>
            );
          })}
        </Reveal>
      </div>
    </Section>
  );
}
