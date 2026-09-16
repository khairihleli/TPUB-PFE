import { ArrowDown, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand } from "@/components/marketing/cta-band";
import { IconTile } from "@/components/marketing/icon-tile";
import { PageHero } from "@/components/marketing/page-hero";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { SectionHeader } from "@/components/marketing/section-header";
import { CAPABILITIES, PERSONAS, SIGNING_QUESTIONS } from "@/components/offer/annonceurs-content";
import { frTypo } from "@/components/offer/fr-typo";
import { PersonaSection } from "@/components/offer/persona-section";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Annonceurs",
  description:
    "Commerces et PME, marques, agences média, institutions : comment TPUB est conçu pour réserver du temps d'écran par zone et par créneau, avec des contenus contrôlés et des diffusions journalisées.",
  alternates: { canonical: "/annonceurs" },
};

const pad = (n: number) => String(n).padStart(2, "0");

function PersonaJumpStrip() {
  return (
    <nav aria-label="Choisir votre profil" className="container-site pb-10 sm:pb-14">
      <ol className="enter enter-4 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line-strong bg-line lg:grid-cols-4">
        {PERSONAS.map((p, i) => {
          const Icon = p.icon;
          return (
            <li key={p.id} className="min-w-0">
              <a
                href={`#${p.id}`}
                className="group/jump flex h-full min-h-touch items-center gap-2 bg-bg/75 px-3.5 py-3.5 backdrop-blur-md transition-colors duration-200 ease-smooth hover:bg-surface/80 sm:gap-3 sm:px-5 sm:py-4"
              >
                {/* IconTile sets its own display: hide it through a wrapper, never a class clash. */}
                <span aria-hidden="true" className="hidden sm:block">
                  <IconTile icon={<Icon />} tone="orange" size="sm" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-label text-[0.6875rem] font-semibold tracking-[0.16em] text-muted-2 tabular">
                    {pad(i + 1)}
                  </span>
                  <span className="font-label text-[0.875rem] leading-snug font-semibold text-ink-strong sm:text-[0.9375rem]">
                    {p.short}
                  </span>
                </span>
                <ArrowDown
                  aria-hidden="true"
                  className="hidden size-4 shrink-0 text-muted transition-transform duration-300 ease-expo group-hover/jump:translate-y-0.5 group-hover/jump:text-brand-orange-text sm:block"
                />
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function AnnonceursPage() {
  return (
    <>
      <PageHero
        eyebrow="Annonceurs"
        title="Votre message,"
        highlight="là où sont vos clients."
        lede={frTypo(
          "Commerce de quartier, marque ou agence : TPUB est conçu pour vous permettre de réserver du temps d'écran par zone et par créneau, avec des contenus contrôlés et des diffusions journalisées.",
        )}
        image={{ src: "/images/screen-street.jpg", position: "center 35%" }}
        actions={
          <>
            <Button asChild variant="brand" size="lg">
              <Link href="/inscription">
                Créer mon compte
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="glass" size="lg">
              <Link href="/contact?besoin=plan-media#formulaire">Demander un plan média</Link>
            </Button>
          </>
        }
        bottom={<PersonaJumpStrip />}
      />

      <Section tone="band" labelledBy="capacites-titre">
        <SectionHeader
          id="capacites-titre"
          eyebrow="Ce que vous pouvez faire"
          title="Cinq gestes,"
          highlight="un seul espace annonceur."
          align="split"
          lede="De la zone choisie sur la carte au budget consommé, chaque étape de votre campagne se prépare et se suit au même endroit."
        />
        <Reveal
          as="ol"
          stagger
          className="grid grid-cols-1 gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-2 lg:grid-cols-5"
        >
          {CAPABILITIES.map((c, i) => {
            const Icon = c.icon;
            return (
              <li
                key={c.title}
                className="group/cap relative grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-1.5 bg-bg p-5 transition-colors duration-300 ease-smooth hover:bg-surface sm:flex sm:flex-col sm:gap-4 sm:p-7 sm:last:col-span-2 lg:last:col-span-1"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-grad-brand transition-transform duration-500 ease-expo group-hover/cap:scale-x-100"
                />
                <div className="row-span-2 sm:flex sm:items-center sm:justify-between">
                  <IconTile icon={<Icon />} tone={i % 2 === 0 ? "orange" : "blue"} />
                  <span
                    aria-hidden="true"
                    className="hidden font-label text-xs font-semibold tracking-[0.18em] text-muted-2 tabular sm:inline"
                  >
                    {pad(i + 1)}
                  </span>
                </div>
                <h3 className="pt-2 font-display text-[1.25rem] leading-tight font-semibold tracking-[-0.01em] text-ink-strong sm:pt-0 sm:text-[1.5rem]">
                  {c.title}
                </h3>
                <p className="text-[0.9375rem] leading-relaxed text-muted">{frTypo(c.text)}</p>
              </li>
            );
          })}
        </Reveal>
      </Section>

      {PERSONAS.map((persona, i) => (
        <PersonaSection
          key={persona.id}
          persona={persona}
          index={i}
          total={PERSONAS.length}
          reverse={i % 2 === 1}
          tone={i % 2 === 1 ? "deep" : "default"}
        />
      ))}

      <Section id="questions" tone="glow" divider="tricolor" labelledBy="questions-titre">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 [&>*]:min-w-0">
          <div className="flex flex-col gap-8 lg:sticky lg:top-[calc(var(--header-h)+32px)] lg:self-start">
            <Reveal variant="left" className="flex flex-col gap-5">
              <p className="eyebrow">Guide d&apos;achat</p>
              <h2 id="questions-titre" className="font-display text-h2 text-ink-strong">
                Les questions à poser <span className="text-gradient">avant de signer.</span>
              </h2>
              <p className="max-w-[52ch] text-lead text-muted">
                Cinq questions valables pour toute offre d&apos;affichage numérique, y compris celle
                de TPUB.
              </p>
            </Reveal>
            <Reveal variant="left" delay={120}>
              <blockquote className="relative rounded-card border border-line bg-surface/50 p-6 sm:p-7">
                <span
                  aria-hidden="true"
                  className="absolute inset-y-6 left-0 w-[3px] rounded-full bg-grad-brand"
                />
                <p className="font-display text-[1.25rem] leading-snug font-semibold text-ink-strong sm:text-[1.375rem]">
                  Exigez ces réponses avant de signer. Leur absence est une information en soi.
                </p>
              </blockquote>
            </Reveal>
          </div>

          <Reveal as="ol" stagger className="flex flex-col border-t border-line-strong">
            {SIGNING_QUESTIONS.map((q, i) => (
              <li
                key={q.question}
                className="group/q grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 border-b border-line py-6 sm:gap-x-8 sm:py-8"
              >
                <span
                  aria-hidden="true"
                  className="row-span-2 font-display text-[2rem] leading-none font-bold tracking-[-0.03em] text-muted-2 tabular transition-colors duration-300 group-hover/q:text-brand-orange-text sm:text-[2.5rem]"
                >
                  {pad(i + 1)}
                </span>
                <p className="font-display text-[1.125rem] leading-snug font-semibold text-ink-strong sm:text-[1.25rem]">
                  {frTypo(q.question)}
                </p>
                <p className="text-[0.9375rem] leading-relaxed text-muted">{frTypo(q.why)}</p>
              </li>
            ))}
          </Reveal>
        </div>
      </Section>

      <CtaBand
        headingId="annonceurs-cta"
        title={frTypo("Compte annonceur ou plan média :")}
        highlight="choisissez votre point de départ."
        lede="Créez votre compte pour préparer une campagne en brouillon, ou confiez-nous vos objectifs pour construire un plan média."
        primary={{ label: "Créer mon compte annonceur", href: "/inscription" }}
        secondary={{
          label: "Demander un plan média",
          href: "/contact?besoin=plan-media#formulaire",
        }}
      />
    </>
  );
}
