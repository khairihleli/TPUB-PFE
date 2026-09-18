import { ArrowUpRight, Linkedin, Mail, MapPin, Phone } from "lucide-react";
import type { ReactNode } from "react";

import { CopyButton } from "@/components/contact/copy-button";
import { CONTACT, GROUP, SOCIAL } from "@/content/site";

function Row({
  icon,
  label,
  children,
  aside,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-4 py-3.5">
      <span
        aria-hidden="true"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-control border border-line bg-surface-2 text-brand-orange-text [&_svg]:size-4.5"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.6875rem] font-semibold tracking-[0.16em] text-muted-2 uppercase">
          {label}
        </p>
        <div className="mt-0.5 truncate text-[0.9375rem] text-ink-strong">{children}</div>
      </div>
      {aside}
    </li>
  );
}

const linkClass =
  "underline-slide rounded-sm transition-colors hover:text-brand-blue-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text";

/** « Parler à ZELQANE » card: coordinates from content/site.ts only (brief §8.7). */
export function ContactCoordinates() {
  return (
    <div className="glass-card overflow-hidden rounded-panel p-6 sm:p-8">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-grad-brand" />
      <p className="eyebrow">Parler à ZELQANE</p>
      <h2 className="mt-4 font-display text-h3 text-ink-strong">Nos coordonnées</h2>
      <ul className="mt-5 divide-y divide-line border-y border-line">
        <Row
          icon={<Mail />}
          label="E-mail"
          aside={<CopyButton value={CONTACT.email} label="Copier l'adresse e-mail" />}
        >
          <span className="select-all">{CONTACT.email}</span>
        </Row>
        <Row icon={<Phone />} label="Téléphone">
          <a href={CONTACT.phoneHref} className={linkClass}>
            {CONTACT.phone}
          </a>
        </Row>
        <Row icon={<MapPin />} label="Ville">
          {CONTACT.address}
        </Row>
        <Row icon={<Linkedin />} label="LinkedIn">
          <a href={SOCIAL.linkedin} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {GROUP.name}
            <span className="sr-only"> (nouvel onglet)</span>
          </a>
        </Row>
      </ul>
      <p className="mt-5 text-sm leading-relaxed text-muted">
        Avant toute réservation, nous clarifions vos objectifs, vos cibles et vos zones, pour que
        votre message passe là où il compte.
      </p>
      <a
        href={GROUP.zelqanePage}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex min-h-touch items-center gap-1.5 text-[0.8125rem] font-medium text-ink-soft transition-colors hover:text-ink-strong"
      >
        {GROUP.mention}
        <ArrowUpRight aria-hidden="true" className="size-3.5" />
        <span className="sr-only"> (site du groupe, nouvel onglet)</span>
      </a>
    </div>
  );
}
