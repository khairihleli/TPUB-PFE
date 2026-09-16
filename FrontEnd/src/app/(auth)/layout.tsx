import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { SITE } from "@/content/site";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Split layout: form column (left) + brand image panel (right, lg+).
 * Pages render their own card content with a single h1.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-ground grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex min-h-dvh flex-col">
        <div className="flex h-(--header-h) items-center justify-between gap-4 px-5 sm:px-10">
          {/* The subline wraps on narrow phones: wordmark only below sm. */}
          <span className="sm:hidden">
            <Logo href="/" />
          </span>
          <span className="hidden sm:inline-flex">
            <Logo href="/" subline />
          </span>
          <Link
            href="/"
            className="-mr-3 inline-flex min-h-touch shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-medium whitespace-nowrap text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Retour au site
          </Link>
        </div>
        <main
          id="contenu"
          tabIndex={-1}
          className="flex flex-1 items-center justify-center px-5 py-10 focus:outline-none sm:px-10"
        >
          <div className="w-full max-w-[460px]">{children}</div>
        </main>
        <p className="px-5 pb-6 text-center text-[0.75rem] text-muted-2 sm:px-10">{SITE.tagline}</p>
      </div>

      <aside
        aria-hidden="true"
        className="relative hidden overflow-hidden border-l border-line lg:block"
      >
        <Image
          src="/images/hero-city.jpg"
          alt=""
          fill
          priority
          sizes="52vw"
          className="ken-burns object-cover object-[62%_center]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-bg)_30%,transparent),color-mix(in_srgb,var(--color-bg)_92%,transparent))]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--color-bg),transparent_35%)]" />
        <div className="pixel-grid absolute inset-0 opacity-40 mix-blend-overlay" />
        <div className="hairline-tricolor absolute inset-x-0 top-0" />
        <div className="absolute inset-x-0 bottom-0 p-12 xl:p-16">
          <p className="eyebrow">Affichage numérique de proximité</p>
          <p className="mt-5 max-w-[18ch] font-display text-h2 text-ink-strong">
            Réservez l&apos;écran. <span className="text-gradient">Suivez votre campagne.</span>
          </p>
          <ul className="mt-8 flex flex-col gap-3 text-[0.9375rem] text-ink-soft">
            <li className="flex items-center gap-3">
              <span className="size-1.5 rounded-full bg-brand-orange" />
              Réservation par zone et par créneau
            </li>
            <li className="flex items-center gap-3">
              <span className="size-1.5 rounded-full bg-brand-orange" />
              Analyse IA puis validation par un expert TPUB
            </li>
            <li className="flex items-center gap-3">
              <span className="size-1.5 rounded-full bg-brand-orange" />
              Journal de diffusion par campagne — mise en service progressive
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
