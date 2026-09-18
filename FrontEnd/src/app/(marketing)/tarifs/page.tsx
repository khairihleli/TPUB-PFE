import { ArrowDown, ArrowRight, Check, Clock3, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand } from "@/components/marketing/cta-band";
import { ImageFrame } from "@/components/marketing/image-frame";
import { PageHero } from "@/components/marketing/page-hero";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { SectionHeader } from "@/components/marketing/section-header";
import { CriteriaBento } from "@/components/offer/criteria-bento";
import { frTypo } from "@/components/offer/fr-typo";
import { MediaPlanBuilder } from "@/components/offer/media-plan-builder";
import { COMPARE_POINTS, PRICE_CRITERIA } from "@/components/offer/tarifs-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cx } from "@/lib/cx";

export const metadata: Metadata = {
  title: "Tarifs",
  description:
    "Emplacement, format, pression, créneaux, saison, création : les critères qui font le prix d'une campagne ZELQANE. Coût estimé indicatif dans l'espace annonceur, plan média sur devis pour les marques et les agences.",
  alternates: { canonical: "/tarifs" },
};

interface PricePath {
  audience: string;
  title: string;
  text: string;
  /** `soon` = not available yet (clock icon instead of a check mark). */
  points: readonly { text: string; soon?: boolean }[];
  cta: { label: string; href: string };
  image: { src: string; alt: string };
  badge: { label: string; tone: "warning" | "blue" };
}

const PRICE_PATHS: readonly PricePath[] = [
  {
    audience: "Commerces et PME",
    title: "Dans votre espace.",
    text: "Lors de la réservation, la plateforme affiche un coût estimé indicatif et suit votre budget en dinars.",
    points: [
      { text: "Budget total en TND, fixé par vous" },
      { text: "Coût estimé affiché à chaque réservation" },
      { text: "Paiement en ligne : bientôt disponible", soon: true },
    ],
    cta: { label: "Créer mon compte", href: "/inscription" },
    image: {
      src: "/images/dashboard-hands.jpg",
      alt: "Mains sur un ordinateur portable affichant un tableau de bord de campagne",
    },
    badge: { label: "Estimation indicative", tone: "warning" },
  },
  {
    audience: "Marques et agences",
    title: "Sur devis.",
    text: "Nous partons de vos objectifs, zones et périodes pour construire un plan média.",
    points: [
      { text: "Objectifs, cibles et zones clarifiés avant toute réservation" },
      { text: "Ce qui sera prouvé et ce qui sera estimé, précisé d'emblée" },
      { text: "Un interlocuteur unique ZELQANE" },
    ],
    cta: { label: "Demander un plan média", href: "/contact?besoin=plan-media#formulaire" },
    image: {
      src: "/images/team-planning.jpg",
      alt: "Équipe préparant un plan média devant une carte murale",
    },
    badge: { label: "Plan média", tone: "blue" },
  },
];

export default function TarifsPage() {
  return (
    <>
      <PageHero
        eyebrow="Tarifs"
        title="Un prix média,"
        highlight="pas un prix au mètre carré."
        lede="Il n'existe pas de grille unique pour l'affichage numérique. Le prix d'une campagne dépend de critères concrets, que ZELQANE rend explicites."
        note={frTypo("Aucun montant affiché : chaque proposition part de vos critères.")}
        image={{ src: "/images/led-closeup.jpg", position: "center 40%" }}
        actions={
          <>
            <Button asChild variant="brand" size="lg">
              <a href="#plan-media">
                Construire mon plan média
                <ArrowDown aria-hidden="true" />
              </a>
            </Button>
            <Button asChild variant="glass" size="lg">
              <Link href="/inscription">Créer mon compte</Link>
            </Button>
          </>
        }
      />

      <Section labelledBy="criteres-titre">
        <SectionHeader
          id="criteres-titre"
          eyebrow="Les critères"
          title="Six critères"
          highlight="qui font le prix."
          align="split"
          lede="Chacun est un levier que vous pouvez régler. C'est leur combinaison, et non une grille générique, qui détermine le coût d'une campagne."
        />
        <CriteriaBento criteria={PRICE_CRITERIA} />
      </Section>

      <Section tone="band" labelledBy="obtenir-titre">
        <SectionHeader
          id="obtenir-titre"
          eyebrow="Obtenir un prix"
          title="Deux chemins,"
          highlight="selon votre façon d'acheter."
          align="center"
        />
        <Reveal stagger className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6 [&>*]:min-w-0">
          {PRICE_PATHS.map((path) => (
            <article
              key={path.audience}
              className="group/path flex h-full flex-col overflow-hidden rounded-panel border border-line bg-bg/60 transition-[border-color,transform] duration-500 ease-expo hover:-translate-y-1 hover:border-line-strong"
            >
              <ImageFrame
                src={path.image.src}
                alt={path.image.alt}
                ratio="21/9"
                sizes="(min-width: 1240px) 600px, (min-width: 1040px) 50vw, 100vw"
                scrim="bottom"
                radius="none"
                label="Illustration"
                className="border-0"
              />
              <div className="flex flex-1 flex-col gap-5 p-6 sm:p-9">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="eyebrow">{path.audience}</p>
                  <Badge tone={path.badge.tone} size="sm">
                    {path.badge.label}
                  </Badge>
                </div>
                <h3 className="font-display text-h2 text-ink-strong">{path.title}</h3>
                <p className="max-w-[48ch] text-lead text-muted">{path.text}</p>
                <ul className="flex flex-col gap-2.5 border-t border-line pt-5">
                  {path.points.map((point) => (
                    <li
                      key={point.text}
                      className={cx(
                        "flex items-start gap-3 text-[0.9375rem] leading-snug",
                        point.soon ? "text-muted" : "text-ink-soft",
                      )}
                    >
                      {point.soon ? (
                        <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
                      ) : (
                        <Check
                          aria-hidden="true"
                          className="mt-0.5 size-4 shrink-0 text-brand-orange-text"
                        />
                      )}
                      {frTypo(point.text)}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-2">
                  <Button asChild variant="brand" size="lg">
                    <Link href={path.cta.href}>
                      {path.cta.label}
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </Reveal>
      </Section>

      <Section id="plan-media" tone="deep" labelledBy="plan-media-titre" divider="tricolor">
        <SectionHeader
          id="plan-media-titre"
          eyebrow="Plan média"
          title="Construire"
          highlight="mon plan média."
          align="split"
          lede={frTypo(
            "Cochez ce que vous savez déjà, critère par critère, puis copiez votre brief : le formulaire de contact s'ouvre avec le besoin « Plan média » et votre profil présélectionnés. Le reste, nous le construisons ensemble.",
          )}
        />
        <MediaPlanBuilder />
      </Section>

      <Section labelledBy="comparer-titre">
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20 [&>*]:min-w-0">
          <Reveal variant="left" className="flex flex-col gap-6">
            <p className="eyebrow">Comparer deux offres</p>
            <h2
              id="comparer-titre"
              className="font-display text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.12] font-semibold tracking-[-0.02em] text-ink-strong"
            >
              Deux écrans au même tarif mensuel peuvent offrir des contacts réels{" "}
              <span className="text-gradient">très différents.</span>
            </h2>
            <p className="max-w-[56ch] text-lead text-muted">
              Pour comparer, ne vous arrêtez pas au prix&nbsp;: demandez ce qui se cache derrière.
            </p>
            <Link
              href="/annonceurs#questions"
              className="group/more inline-flex min-h-touch w-fit items-center gap-2 font-label text-[0.875rem] font-semibold text-brand-blue-text"
            >
              <span className="underline-slide">Les questions à poser avant de signer</span>
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-300 group-hover/more:translate-x-0.5"
              />
            </Link>
          </Reveal>

          <div className="flex flex-col gap-3">
            <Reveal as="ol" stagger className="flex flex-col gap-3">
              {COMPARE_POINTS.map((point, i) => (
                <li
                  key={point.title}
                  className="border-glow flex items-start gap-5 rounded-card border border-line bg-surface/40 p-5 sm:p-6"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-orange-line font-label text-[0.8125rem] font-semibold text-brand-orange-text tabular"
                  >
                    {i + 1}
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="font-display text-[1.0625rem] font-semibold text-ink-strong">
                      {point.title}
                    </h3>
                    <p className="text-[0.9375rem] leading-relaxed text-muted">
                      {frTypo(point.text)}
                    </p>
                  </div>
                </li>
              ))}
            </Reveal>
            <p className="flex items-start gap-2 px-1 pt-2 text-[0.8125rem] text-muted">
              <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Des questions sur la facturation ou les estimations&nbsp;?{" "}
                <Link
                  href="/faq#prix"
                  className="text-brand-blue-text underline decoration-brand-blue-text/50 underline-offset-4 hover:decoration-brand-blue-text"
                >
                  Consultez la FAQ Prix et achat
                </Link>
                .
              </span>
            </p>
          </div>
        </div>
      </Section>

      <CtaBand
        headingId="tarifs-cta"
        title="Parlons de vos objectifs,"
        highlight="pas d'une grille."
        lede={frTypo(
          "Marques et agences : nous construisons un plan média à partir de vos zones et de vos périodes. Commerces : créez votre compte et suivez votre budget en dinars.",
        )}
        primary={{ label: "Demander un plan média", href: "/contact?besoin=plan-media#formulaire" }}
        secondary={{ label: "Créer mon compte", href: "/inscription" }}
        image={{ src: "/images/hero-city.jpg", alt: "", position: "center 55%" }}
      />
    </>
  );
}
