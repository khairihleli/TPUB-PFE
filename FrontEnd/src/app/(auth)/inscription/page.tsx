import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard, AuthHeader } from "@/components/auth/auth-header";
import { safeRedirectPath, withNext } from "@/components/auth/auth-redirect";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Créer un compte annonceur",
  description:
    "Créez votre compte annonceur TPUB : préparez vos campagnes, réservez vos créneaux et suivez leur validation.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function InscriptionPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);

  return (
    <div className="flex flex-col gap-8">
      <AuthHeader
        eyebrow="Espace annonceur"
        title="Créer votre compte annonceur"
        subtitle="Préparez vos campagnes, réservez vos créneaux et suivez leur validation."
      />
      <AuthCard>
        <RegisterForm next={next} />
      </AuthCard>
      <div className="enter enter-3 flex flex-col gap-2 text-center text-[0.875rem] text-muted">
        <p>
          Déjà un compte ?{" "}
          <Link
            href={withNext("/connexion", next)}
            className="font-medium text-brand-blue-text underline decoration-brand-blue-text/45 decoration-1 underline-offset-4 hover:decoration-current"
          >
            Se connecter
          </Link>
        </p>
        <p>
          Agence ou marque nationale ?{" "}
          <Link
            href="/contact?profil=agence&besoin=plan-media#formulaire"
            className="font-medium text-brand-orange-text underline decoration-brand-orange-text/45 decoration-1 underline-offset-4 hover:decoration-current"
          >
            Demandez un plan média
          </Link>
        </p>
      </div>
    </div>
  );
}
