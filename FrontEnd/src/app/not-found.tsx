import { ArrowLeft, Mail } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { CONTACT } from "@/content/site";

export const metadata: Metadata = {
  title: "Page introuvable",
  robots: { index: false, follow: true },
};

const SUGGESTIONS = [
  { label: "Annonceurs", href: "/annonceurs" },
  { label: "Réseau & zones", href: "/reseau" },
  { label: "Fonctionnement", href: "/fonctionnement" },
  { label: "Tarifs", href: "/tarifs" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
] as const;

export default function NotFound() {
  return (
    <main id="contenu" className="relative isolate flex min-h-dvh flex-col overflow-hidden">
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <Image
          src="/images/led-closeup.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover opacity-40"
        />
        <div className="bg-scrim-v absolute inset-0" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,var(--color-bg)_85%)]" />
        <div className="pixel-grid absolute inset-0 opacity-50 mix-blend-overlay" />
      </div>

      <div className="container-site flex h-(--header-h) items-center">
        <Logo href="/" subline />
      </div>

      <div className="container-site flex flex-1 flex-col justify-center py-16">
        <p className="eyebrow enter">Erreur 404 · Signal perdu</p>
        <p
          aria-hidden="true"
          className="enter enter-1 mt-6 font-display text-[clamp(6rem,22vw,15rem)] leading-[0.85] font-bold tracking-tighter text-transparent [-webkit-text-stroke:1.5px_var(--color-orange-line)]"
        >
          404
        </p>
        <h1 className="enter enter-2 mt-6 max-w-[16ch] font-display text-h1 text-ink-strong">
          Cet écran ne diffuse <span className="text-gradient">aucune page.</span>
        </h1>
        <p className="enter enter-3 mt-5 max-w-[56ch] text-lead text-ink-soft">
          L&apos;adresse demandée n&apos;existe pas ou a été déplacée. Reprenez depuis
          l&apos;accueil ou choisissez une rubrique.
        </p>
        <div className="enter enter-4 mt-8 flex flex-wrap gap-3">
          <Button asChild variant="brand" size="lg">
            <Link href="/">
              <ArrowLeft aria-hidden="true" />
              Retour à l&apos;accueil
            </Link>
          </Button>
          <Button asChild variant="glass" size="lg">
            <a href={`mailto:${CONTACT.email}`}>
              <Mail aria-hidden="true" />
              Signaler un lien cassé
            </a>
          </Button>
        </div>
        <nav aria-label="Rubriques" className="enter enter-4 mt-12 border-t border-line pt-6">
          <ul className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className="inline-flex min-h-10 items-center rounded-full border border-line-strong bg-white/[0.03] px-4 font-label text-[0.8125rem] font-medium text-ink-soft transition-colors hover:border-orange-line hover:text-brand-orange-text"
                >
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
