import type { Metadata } from "next";

import { AuthCard, AuthHeader } from "@/components/auth/auth-header";
import { safeRedirectPath } from "@/components/auth/auth-redirect";
import { TotpEnrolmentFlow } from "@/components/auth/totp-enrolment-flow";

export const metadata: Metadata = {
  title: "Activez la double authentification",
  description: "La double authentification est obligatoire pour votre rôle.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Mandatory 2FA enrolment (docs/round2-contract.md §3.7); the middleware requires a challenge. */
export default async function ActiverDeuxFacteursPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  return (
    <div className="flex flex-col gap-8">
      <AuthHeader
        eyebrow="Connexion sécurisée"
        title="Activez la double authentification"
        subtitle="Elle est obligatoire pour votre rôle : un code de votre téléphone sera demandé à chaque connexion."
      />
      <AuthCard>
        <TotpEnrolmentFlow next={next} />
      </AuthCard>
    </div>
  );
}
