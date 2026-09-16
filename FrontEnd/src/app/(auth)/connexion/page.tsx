import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard, AuthHeader } from "@/components/auth/auth-header";
import { safeRedirectPath, withNext } from "@/components/auth/auth-redirect";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Connexion",
  description: "Connectez-vous à votre espace annonceur TPUB.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ConnexionPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  const expired = params.expire === "1";

  return (
    <div className="flex flex-col gap-8">
      <AuthHeader
        eyebrow="Espace annonceur"
        title="Bon retour"
        subtitle="Accédez à vos campagnes, réservations et statistiques."
      />
      <AuthCard>
        <LoginForm next={next} expired={expired} />
      </AuthCard>
      <div className="enter enter-3 flex flex-col gap-2 text-center text-[0.875rem] text-muted">
        <p>
          Pas encore de compte ?{" "}
          <Link
            href={withNext("/inscription", next)}
            className="font-medium text-brand-orange-text underline decoration-brand-orange-text/45 decoration-1 underline-offset-4 hover:decoration-current"
          >
            Créer un compte annonceur
          </Link>
        </p>
      </div>
    </div>
  );
}
