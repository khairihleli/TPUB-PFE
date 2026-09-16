import { Mail, MapPin, Phone } from "lucide-react";

import { ImageFrame } from "@/components/marketing/image-frame";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { TUNISIE_SECTION } from "@/components/story/a-propos-content";
import { CONTACT } from "@/content/site";

/** « Conçue en Tunisie » — panoramic frame with the statement, then the contact line. */
export function TunisieBand() {
  return (
    <Section spacing="tight" labelledBy="tunisie-titre">
      <Reveal variant="zoom">
        <ImageFrame
          src="/images/coastal-billboard.jpg"
          alt={TUNISIE_SECTION.imageAlt}
          ratio="21/9"
          sizes="(min-width: 1240px) 1130px, 100vw"
          scrim="side"
          label="Illustration"
          objectPosition="center 58%"
          className="min-h-[300px] shadow-card sm:min-h-[340px]"
        >
          <div className="flex h-full flex-col justify-end gap-3 p-5 sm:p-8 lg:p-12">
            <p className="eyebrow">{TUNISIE_SECTION.eyebrow}</p>
            <h2
              id="tunisie-titre"
              className="max-w-[22ch] font-display text-[clamp(1.5rem,3.4vw,2.75rem)] leading-[1.08] font-semibold tracking-[-0.02em] text-ink-strong"
            >
              {TUNISIE_SECTION.statement}
            </h2>
            <p className="max-w-[46ch] text-[0.9375rem] leading-relaxed text-ink-soft">
              {TUNISIE_SECTION.text}
            </p>
          </div>
        </ImageFrame>
      </Reveal>

      <Reveal
        as="ul"
        stagger
        aria-label="Coordonnées TPUB"
        className="mt-4 grid grid-cols-1 overflow-hidden rounded-card border border-line sm:grid-cols-3"
      >
        <li className="flex items-center gap-3 border-b border-line p-4 sm:border-r sm:border-b-0 sm:p-5">
          <MapPin aria-hidden="true" className="size-4.5 shrink-0 text-brand-orange-text" />
          <span className="text-[0.9375rem] text-ink-soft">{CONTACT.address}</span>
        </li>
        <li className="border-b border-line sm:border-r sm:border-b-0">
          <a
            href={`mailto:${CONTACT.email}`}
            className="flex min-h-touch items-center gap-3 p-4 text-[0.9375rem] text-ink-soft transition-colors hover:text-ink-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-blue-text sm:p-5"
          >
            <Mail aria-hidden="true" className="size-4.5 shrink-0 text-brand-orange-text" />
            <span className="break-all">{CONTACT.email}</span>
          </a>
        </li>
        <li>
          <a
            href={CONTACT.phoneHref}
            className="flex min-h-touch items-center gap-3 p-4 text-[0.9375rem] text-ink-soft transition-colors hover:text-ink-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-blue-text sm:p-5"
          >
            <Phone aria-hidden="true" className="size-4.5 shrink-0 text-brand-orange-text" />
            <span className="tabular">{CONTACT.phone}</span>
          </a>
        </li>
      </Reveal>
    </Section>
  );
}
