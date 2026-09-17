"use client";

import { LogOut, UserRound } from "lucide-react";

import { PasswordChangeCard } from "@/components/account/password-change-card";
import { LoginHistoryCard, SessionsCard } from "@/components/account/sessions-card";
import { TwoFactorCard } from "@/components/account/two-factor-card";
import { Fact } from "@/components/espace/espace-ui";
import { useSession } from "@/components/shell/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { meApi } from "@/lib/api/endpoints";
import { ROLE_LABEL } from "@/lib/campaign-status";
import { formatDateTime } from "@/lib/format";
import { resourceKeys } from "@/lib/resource-cache";
import { useResource } from "@/lib/use-resource";

/**
 * /admin/compte — the staff member's own account (docs/round2-contract.md §3.7): profile summary,
 * password, two-factor authentication, active sessions and login history.
 */
export function AccountView() {
  const { user, logout, loggingOut } = useSession();
  const me = useResource("admin:me", (signal) => meApi.get({ signal }), {
    cacheKey: resourceKeys.me,
  });

  return (
    <>
      <PageHeader
        title="Mon compte"
        description="Votre profil, votre mot de passe, la double authentification et les appareils connectés."
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2 xl:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <Card as="section" aria-labelledby="account-summary-title">
            <CardHeader
              title={<span id="account-summary-title">Profil</span>}
              description="Informations de votre compte TPUB."
              icon={<UserRound />}
              actions={
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<LogOut aria-hidden="true" />}
                  loading={loggingOut}
                  loadingLabel="Déconnexion…"
                  onClick={() => void logout()}
                >
                  Se déconnecter
                </Button>
              }
            />
            {me.error && !me.data ? (
              <ErrorState error={me.error} onRetry={me.reload} scope="section" />
            ) : !me.data ? (
              <LoadingRegion label="Chargement du profil…">
                <Skeleton className="h-28 rounded-card" />
              </LoadingRegion>
            ) : (
              <dl className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-2">
                <Fact label="Nom">{me.data.nom}</Fact>
                <Fact label="E-mail de connexion">
                  <span className="break-all">{me.data.email}</span>
                </Fact>
                <Fact label="Rôle">
                  <Badge tone="brand">{ROLE_LABEL[me.data.role]}</Badge>
                </Fact>
                <Fact label="Double authentification">
                  {me.data.twoFactorEnabled ? "Active" : "Inactive"}
                  {me.data.twoFactorRequired ? " · obligatoire pour ce rôle" : ""}
                </Fact>
                <Fact label="Dernière connexion">
                  {me.data.lastLoginAt ? formatDateTime(me.data.lastLoginAt) : "—"}
                </Fact>
                <Fact label="Compte créé le">{formatDateTime(me.data.createdAt)}</Fact>
              </dl>
            )}
          </Card>
          <PasswordChangeCard />
          <TwoFactorCard email={user.email} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <SessionsCard />
          <LoginHistoryCard />
        </div>
      </div>
    </>
  );
}
