import type { Metadata } from "next";

import { AuthCard, AuthHeader } from "@/components/auth/auth-header";
import { safeRedirectPath } from "@/components/auth/auth-redirect";
import { ForcedPasswordChange } from "@/components/auth/forced-password-change";

export const metadata: Metadata = {
  title: "Définissez un nouveau mot de passe",
  description: "Un nouveau mot de passe est requis avant d'accéder à votre espace ZELQANE.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Forced password change (docs/round2-contract.md §3.2, §3.7); the middleware requires a session. */
export default async function MotDePasseRequisPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  return (
    <div className="flex flex-col gap-8">
      <AuthHeader
        eyebrow="Sécurité du compte"
        title="Définissez un nouveau mot de passe"
        subtitle="Votre mot de passe actuel doit être remplacé avant de continuer (compte créé automatiquement ou changement demandé par un administrateur)."
      />
      <AuthCard>
        <ForcedPasswordChange next={next} />
      </AuthCard>
    </div>
  );
}
