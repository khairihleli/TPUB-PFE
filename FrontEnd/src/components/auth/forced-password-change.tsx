"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PasswordChangeForm } from "@/components/account/password-change-card";
import { postAuthDestination } from "@/components/auth/auth-redirect";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { sessionApi } from "@/lib/api/endpoints";
import { presentError } from "@/lib/api/errors";

/**
 * /mot-de-passe-requis: POST /me/password (which clears `mustChangePassword`), then the session
 * cookie user is re-read from the backend (`GET /api/session?actualiser=1`) before going to the
 * role home (or a valid ?next=).
 */
export function ForcedPasswordChange({ next }: { next: string | null }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const continueToSpace = async () => {
    setRefreshError(null);
    try {
      const { user } = await sessionApi.get({ refresh: true });
      if (user.mustChangePassword === true) {
        setRefreshError("Le nouveau mot de passe n'a pas encore été pris en compte. Réessayez.");
        return;
      }
      router.replace(postAuthDestination(next, user.role));
      router.refresh();
    } catch (e) {
      setRefreshError(presentError(e).message);
    }
  };

  const logout = async () => {
    setLeaving(true);
    try {
      await sessionApi.logout();
    } catch {
      // Cookies may already be gone: go to the login page anyway.
    }
    router.replace("/connexion");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-5">
      {refreshError ? (
        <Alert tone="danger" title="Mot de passe modifié, session à actualiser">
          <p>{refreshError}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => void continueToSpace()}
          >
            Continuer
          </Button>
        </Alert>
      ) : null}
      <PasswordChangeForm
        submitLabel="Enregistrer et continuer"
        hint="Au moins 8 caractères, dont une lettre et un chiffre. Vos autres appareils seront déconnectés."
        showSuccess={false}
        onChanged={continueToSpace}
      />
      <div className="border-t border-line pt-4">
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<LogOut aria-hidden="true" />}
          loading={leaving}
          loadingLabel="Déconnexion…"
          onClick={() => void logout()}
        >
          Se déconnecter
        </Button>
      </div>
    </div>
  );
}
