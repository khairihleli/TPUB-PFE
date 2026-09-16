import { ArrowRight, Briefcase, Landmark, MapPin, Megaphone } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ImageFrame } from "@/components/marketing/image-frame";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { buttonClasses } from "@/components/ui/button-classes";

interface RouteCard {
  icon: ReactNode;
  who: string;
  line: string;
  cta: string;
  href: string;
}

/** Persona routing (brief §4 / §8.2): each link pre-fills the form above. */
const ROUTES: readonly RouteCard[] = [
  {
    icon: <Briefcase />,
    who: "Agences média",
    line: "Achetez une architecture de mesure, pas un volume de contacts.",
    cta: "Demander un plan média",
    href: "/contact?profil=agence&besoin=plan-media#formulaire",
  },
  {
    icon: <Megaphone />,
    who: "Marques",
    line: "Des temps forts planifiés, des dépenses justifiées.",
    cta: "Parler à TPUB",
    href: "/contact?profil=marque&besoin=campagne#formulaire",
  },
  {
    icon: <Landmark />,
    who: "Institutions",
    line: "Un réseau conçu pour l'intérêt général.",
    cta: "Nous contacter",
    href: "/contact?profil=institution&besoin=interet-general#formulaire",
  },
  {
    icon: <MapPin />,
    who: "Propriétaires d'emplacement",
    line: "Vous détenez des emplacements ? Parlons-en.",
    cta: "Présenter un emplacement",
    href: "/contact?profil=proprietaire&besoin=emplacement#formulaire",
  },
];

export function ContactRoutes() {
  return (
    <Section tone="band" labelledBy="contact-routes-titre">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14 [&>*]:min-w-0">
        <Reveal variant="left">
          <ImageFrame
            src="/images/storefront-screen.jpg"
            alt="Écran numérique dans la vitrine d'un commerce de quartier"
            ratio="4/5"
            sizes="(min-width: 1240px) 520px, (min-width: 1040px) 42vw, 100vw"
            scrim="bottom"
            label="Illustration"
            className="max-h-[640px] shadow-card"
          >
            {/* Extra scrim under the copy: the lit shop window sits right behind the text. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[linear-gradient(180deg,transparent_28%,color-mix(in_srgb,var(--color-bg)_70%,transparent)_52%,color-mix(in_srgb,var(--color-bg)_94%,transparent)_78%,var(--color-bg)_100%)]"
            />
            <div className="relative flex h-full flex-col justify-end gap-4 p-6 sm:p-9">
              <p className="eyebrow">Commerces & PME</p>
              <p className="max-w-[20ch] font-display text-[clamp(1.5rem,3vw,2.1rem)] leading-tight font-semibold text-ink-strong">
                Vous voulez préparer une campagne vous-même ?
              </p>
              <p className="max-w-[40ch] text-[0.9375rem] leading-relaxed text-ink-soft">
                Choisissez une zone proche de votre point de vente et les heures où vos clients
                passent, depuis votre espace annonceur.
              </p>
              <div>
                <Link
                  href="/inscription"
                  className={buttonClasses({ variant: "brand", size: "lg" })}
                >
                  Créer mon compte annonceur
                  <ArrowRight aria-hidden="true" />
                </Link>
              </div>
            </div>
          </ImageFrame>
        </Reveal>

        <div className="flex flex-col justify-center gap-8">
          <div className="flex flex-col gap-4">
            <p className="eyebrow">Par où commencer</p>
            <h2 id="contact-routes-titre" className="font-display text-h2 text-ink-strong">
              Une demande, <span className="text-gradient">le bon interlocuteur.</span>
            </h2>
            <p className="max-w-[54ch] text-lead text-muted">
              Choisissez votre profil : le formulaire ci-dessus se pré-remplit, sans effacer ce que
              vous avez déjà saisi, et votre demande arrive au bon interlocuteur.
            </p>
          </div>
          <Reveal as="ul" stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ROUTES.map((r) => (
              <li key={r.who} className="flex">
                <Link
                  href={r.href}
                  className="group/route glass-card flex w-full items-start gap-4 p-5 transition-[transform,border-color] duration-300 ease-smooth hover:-translate-y-1 hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text sm:flex-col"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-control border border-orange-line bg-orange-soft text-brand-orange-text transition-transform duration-300 ease-smooth group-hover/route:-rotate-6 [&_svg]:size-5"
                  >
                    {r.icon}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-3 sm:w-full sm:gap-4">
                    <span className="flex flex-col gap-1.5">
                      <span className="font-label text-[0.9375rem] font-semibold text-ink-strong">
                        {r.who}
                      </span>
                      <span className="text-sm leading-relaxed text-muted">{r.line}</span>
                    </span>
                    <span className="mt-auto inline-flex items-center gap-1.5 font-label text-[0.8125rem] font-semibold text-brand-orange-text">
                      {r.cta}
                      <ArrowRight
                        aria-hidden="true"
                        className="size-3.5 transition-transform duration-300 ease-smooth group-hover/route:translate-x-1"
                      />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
