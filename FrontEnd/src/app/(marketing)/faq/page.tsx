import { ArrowRight, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand } from "@/components/marketing/cta-band";
import { Faq } from "@/components/marketing/faq";
import { PageHero } from "@/components/marketing/page-hero";
import { Reveal } from "@/components/marketing/reveal";
import { Section } from "@/components/marketing/section";
import { FAQ_THEMES } from "@/components/offer/faq-content";
import { frTypo } from "@/components/offer/fr-typo";
import { buildFaqJsonLd, serializeJsonLd } from "@/components/offer/faq-jsonld";
import { FaqThemeNav } from "@/components/offer/faq-theme-nav";
import { Button } from "@/components/ui/button";
import { CONTACT } from "@/content/site";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Statut, prix, mesure, modération des contenus et ciblage : les réponses aux questions des annonceurs sur ZELQANE, la plateforme d'affichage numérique extérieur du groupe Tukhnanutha.",
  alternates: { canonical: "/faq" },
};

const QUICK_ANSWERS = [
  {
    label: "Statut",
    text: "En phase de conception. Comptes annonceurs et brouillons dès maintenant.",
  },
  { label: "Prix", text: "Sur critères explicites, sans grille publique ni montant affiché." },
  {
    label: "Mesure",
    text: "Diffusions observées et journalisées, audience présentée comme estimée.",
  },
] as const;

export default function FaqPage() {
  const questionCount = FAQ_THEMES.reduce((n, t) => n + t.entries.length, 0);
  const navThemes = FAQ_THEMES.map((t) => ({ id: t.id, title: t.title, count: t.entries.length }));

  return (
    <>
      <script type="application/ld+json">{serializeJsonLd(buildFaqJsonLd(FAQ_THEMES))}</script>

      <PageHero
        eyebrow="Questions fréquentes"
        title="Les bonnes questions,"
        highlight="avant de réserver un écran."
        lede={frTypo(
          "Statut, prix, mesure, modération, ciblage : les réponses aux questions que se posent les annonceurs, en distinguant toujours ce qui est conçu, ce qui est observé et ce qui est estimé.",
        )}
        actions={
          <>
            <Button asChild variant="brand" size="lg">
              <Link href="/contact#formulaire">
                Poser une question
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="glass" size="lg">
              <Link href="/inscription">Créer mon compte annonceur</Link>
            </Button>
          </>
        }
        note={`${questionCount} questions réparties en ${FAQ_THEMES.length} thèmes.`}
        aside={
          <div className="glass relative overflow-hidden rounded-panel p-6 shadow-card sm:p-8">
            <div
              aria-hidden="true"
              className="hairline-tricolor absolute inset-x-0 top-0 opacity-80"
            />
            <p className="eyebrow">En bref</p>
            <dl className="mt-6 flex flex-col divide-y divide-line">
              {QUICK_ANSWERS.map((item) => (
                <div
                  key={item.label}
                  className="grid gap-1 py-4 first:pt-0 last:pb-0 sm:grid-cols-[96px_1fr] sm:gap-5"
                >
                  <dt className="font-label text-[0.8125rem] font-semibold tracking-[0.04em] text-brand-orange-text">
                    {item.label}
                  </dt>
                  <dd className="text-[0.9375rem] leading-relaxed text-ink-soft">{item.text}</dd>
                </div>
              ))}
            </dl>
          </div>
        }
      />

      <Section spacing="default" divider="hairline">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[272px_minmax(0,1fr)] lg:gap-14 xl:gap-20">
          {/* Phones: the theme chips stay pinned under the header while reading. */}
          <div className="sticky top-(--header-h) z-20 -mx-[clamp(16px,3.6vw,56px)] flex min-w-0 flex-col gap-8 border-y border-line bg-bg/90 px-[clamp(16px,3.6vw,56px)] py-2.5 backdrop-blur-md lg:top-[calc(var(--header-h)+32px)] lg:z-auto lg:mx-0 lg:self-start lg:border-y-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
            <div className="flex flex-col gap-4">
              <p className="eyebrow eyebrow-plain hidden text-muted lg:flex">Thèmes</p>
              <FaqThemeNav themes={navThemes} />
            </div>
            <div className="hidden rounded-card border border-line bg-surface/40 p-5 lg:block">
              <p className="font-display text-base font-semibold text-ink-strong">
                Votre question n&apos;y est pas&nbsp;?
              </p>
              <p className="mt-2 text-[0.875rem] leading-relaxed text-muted">
                L&apos;équipe ZELQANE vous répond par e-mail.
              </p>
              <Link
                href="/contact#formulaire"
                className="underline-slide mt-3 inline-flex min-h-touch items-center gap-1.5 font-label text-[0.875rem] font-semibold text-brand-blue-text"
              >
                Écrire à ZELQANE
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
              <p className="mt-1 flex items-center gap-2 text-[0.8125rem] text-muted-2">
                <Mail aria-hidden="true" className="size-3.5" />
                {CONTACT.email}
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-16 sm:gap-20">
            {FAQ_THEMES.map((theme, i) => {
              const headingId = `${theme.id}-titre`;
              return (
                <section
                  key={theme.id}
                  id={theme.id}
                  aria-labelledby={headingId}
                  className="scroll-mt-20 lg:scroll-mt-0"
                >
                  <Reveal variant="up" className="mb-6 flex flex-col gap-3 sm:mb-8">
                    <p className="font-label text-xs font-semibold tracking-[0.2em] text-muted-2 tabular">
                      {String(i + 1).padStart(2, "0")} /{" "}
                      {String(FAQ_THEMES.length).padStart(2, "0")}
                    </p>
                    <h2 id={headingId} className="font-display text-h3 text-ink-strong">
                      {theme.title}
                    </h2>
                    <p className="max-w-[60ch] text-[0.9375rem] text-muted">
                      {frTypo(theme.intro)}
                    </p>
                  </Reveal>
                  <Faq
                    headingLevel="h3"
                    defaultOpen={i === 0 ? 0 : undefined}
                    items={theme.entries.map((entry) => ({
                      question: frTypo(entry.question),
                      answer: (
                        <>
                          <p>{frTypo(entry.answer)}</p>
                          {entry.link ? (
                            <Link
                              href={entry.link.href}
                              className="underline-slide mt-3 inline-flex min-h-touch items-center gap-1.5 font-label text-[0.875rem] font-semibold text-brand-blue-text"
                            >
                              {entry.link.label}
                              <ArrowRight aria-hidden="true" className="size-3.5" />
                            </Link>
                          ) : null}
                        </>
                      ),
                    }))}
                  />
                </section>
              );
            })}
          </div>
        </div>
      </Section>

      <CtaBand
        headingId="faq-cta"
        title={frTypo("Une question plus précise ?")}
        highlight="Parlons-en."
        lede={frTypo(
          "Dites-nous vos objectifs, vos cibles et vos zones : l'équipe ZELQANE revient vers vous par e-mail.",
        )}
        primary={{ label: "Parler à ZELQANE", href: "/contact#formulaire" }}
        secondary={{ label: "Créer mon compte annonceur", href: "/inscription" }}
        image={{ src: "/images/led-closeup.jpg", alt: "" }}
      />
    </>
  );
}
