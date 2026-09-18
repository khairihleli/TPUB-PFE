import type { Metadata } from "next";

import { ContactCoordinates } from "@/components/contact/contact-coordinates";
import { ContactForm } from "@/components/contact/contact-form";
import { ContactRoutes } from "@/components/contact/contact-routes";
import { parseContactPrefill } from "@/components/contact/contact-schema";
import { PageHero } from "@/components/marketing/page-hero";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Parlons de votre campagne : dites-nous vos objectifs, vos cibles et vos zones. Agences, marques, institutions et propriétaires d'emplacement, écrivez à ZELQANE.",
  alternates: { canonical: "/contact" },
};

const NEXT_STEPS = [
  { title: "Nous lisons votre demande", text: "Elle est transmise à l'équipe ZELQANE." },
  { title: "Nous clarifions votre besoin", text: "Objectifs, cibles, zones et périodes." },
  {
    title: "Nous revenons vers vous",
    text: "Par e-mail, avec une proposition adaptée à votre profil.",
  },
] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ContactPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const prefill = parseContactPrefill({ profil: params.profil, besoin: params.besoin });

  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Parlons de votre"
        highlight="campagne."
        lede="Dites-nous vos objectifs, vos cibles et vos zones. Nous revenons vers vous avec une proposition adaptée."
        image={{ src: "/images/team-planning.jpg", position: "center 35%" }}
      />

      <Section id="formulaire" spacing="tight" className="scroll-mt-(--header-h)">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)] lg:gap-10 xl:gap-14">
          <div className="glass-card rounded-panel p-5 min-[420px]:p-7 sm:p-10">
            <ContactForm initial={prefill} />
          </div>

          <aside
            aria-label="Coordonnées et suite de votre demande"
            className="flex flex-col gap-6 lg:sticky lg:top-[calc(var(--header-h)+24px)] lg:self-start"
          >
            <ContactCoordinates />

            <div className="rounded-panel border border-line p-6 sm:p-8">
              <h2 className="font-label text-[0.8125rem] font-semibold tracking-[0.16em] text-ink-soft uppercase">
                Ce qui se passe ensuite
              </h2>
              <ol className="relative mt-6 flex flex-col gap-6">
                <span
                  aria-hidden="true"
                  className="absolute top-3 bottom-3 left-[13px] w-px bg-[linear-gradient(180deg,var(--color-orange-line),var(--color-blue-line))]"
                />
                {NEXT_STEPS.map((s, i) => (
                  <li key={s.title} className="relative flex gap-4">
                    <span
                      aria-hidden="true"
                      className="relative inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-line-strong bg-bg font-label text-[0.6875rem] font-semibold text-brand-orange-text tabular"
                    >
                      {i + 1}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <p className="font-label text-[0.9375rem] font-semibold text-ink-strong">
                        {s.title}
                      </p>
                      <p className="text-sm leading-relaxed text-muted">{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      </Section>

      <ContactRoutes />
    </>
  );
}
