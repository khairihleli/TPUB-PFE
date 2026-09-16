import { ArrowLeft, ArrowRight, KeyRound, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard, AuthHeader } from "@/components/auth/auth-header";
import { CopyButton } from "@/components/contact/copy-button";
import { buttonClasses } from "@/components/ui/button-classes";
import { CONTACT } from "@/content/site";

export const metadata: Metadata = {
  title: "Mot de passe oublié",
  description: "Retrouver l'accès à votre compte annonceur TPUB.",
};

/**
 * No reset endpoint exists in the backend (contract §7): tell the truth and route to TPUB,
 * never simulate an e-mail being sent.
 */
export default function MotDePasseOubliePage() {
  return (
    <div className="flex flex-col gap-8">
      <AuthHeader
        eyebrow="Accès au compte"
        title="Réinitialiser le mot de passe"
        subtitle="La réinitialisation en ligne n'est pas encore disponible. L'équipe TPUB vous aide à retrouver l'accès à votre compte."
      />

      <AuthCard>
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-4">
            <span
              aria-hidden="true"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-control border border-blue-line bg-blue-soft text-brand-blue-text [&_svg]:size-5"
            >
              <KeyRound />
            </span>
            <div className="flex flex-col gap-1.5">
              <h2 className="font-label text-[1rem] font-semibold text-ink-strong">
                Comment retrouver l&apos;accès
              </h2>
              <p className="text-[0.9375rem] leading-relaxed text-ink-soft">
                Écrivez-nous depuis l&apos;adresse e-mail de votre compte. Pour protéger votre
                compte, nous vérifions votre identité avant toute modification.
              </p>
            </div>
          </div>

          <ul className="divide-y divide-line rounded-card border border-line">
            <li className="flex items-center gap-3 px-4 py-2.5">
              <Mail aria-hidden="true" className="size-4 shrink-0 text-brand-orange-text" />
              <span className="min-w-0 flex-1 truncate text-[0.9375rem] text-ink-strong select-all">
                {CONTACT.email}
              </span>
              <CopyButton value={CONTACT.email} label="Copier l'adresse e-mail de TPUB" />
            </li>
            <li className="flex min-h-touch items-center gap-3 px-4 py-2.5">
              <Phone aria-hidden="true" className="size-4 shrink-0 text-brand-orange-text" />
              <a
                href={CONTACT.phoneHref}
                className="text-[0.9375rem] text-ink-strong underline decoration-line-strong decoration-1 underline-offset-4 hover:text-brand-blue-text hover:decoration-current"
              >
                {CONTACT.phone}
              </a>
            </li>
          </ul>

          <Link
            href="/contact?besoin=autre"
            className={buttonClasses({ variant: "primary", size: "lg", fullWidth: true })}
          >
            Contacter TPUB
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </AuthCard>

      <div className="enter enter-3 flex justify-center">
        <Link
          href="/connexion"
          className="inline-flex min-h-touch items-center gap-1.5 text-[0.875rem] font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Retour à la connexion
        </Link>
      </div>
    </div>
  );
}
