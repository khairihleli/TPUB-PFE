import type { Metadata } from "next";

import { AuthCard, AuthHeader } from "@/components/auth/auth-header";
import { safeRedirectPath } from "@/components/auth/auth-redirect";
import { TotpVerificationForm } from "@/components/auth/totp-verification-form";

export const metadata: Metadata = {
  title: "Vérification en deux étapes",
  description: "Confirmez votre connexion avec votre application d'authentification.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Second login step (docs/round2-contract.md §3.7); the middleware requires a challenge. */
export default async function VerificationPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  return (
    <div className="flex flex-col gap-8">
      <AuthHeader
        eyebrow="Connexion sécurisée"
        title="Vérification en deux étapes"
        subtitle="Votre mot de passe est correct. Confirmez qu'il s'agit bien de vous."
      />
      <AuthCard>
        <TotpVerificationForm next={next} />
      </AuthCard>
    </div>
  );
}
