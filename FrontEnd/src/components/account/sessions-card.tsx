"use client";

import { CheckCircle2, History, LogOut, MonitorSmartphone, XCircle } from "lucide-react";
import { useState } from "react";

import {
  describeUserAgent,
  loginOutcomeLabel,
  sortSessions,
} from "@/components/espace/profile-model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { meApi } from "@/lib/api/endpoints";
import { hasErrorCode } from "@/lib/api/errors";
import type { LoginHistoryResponse, UserSessionResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { formatDateTime, formatRelative } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

export const LOGIN_HISTORY_LIMIT = 20;

// ---------------------------------------------------------------------------
// Active sessions
// ---------------------------------------------------------------------------
/** Active sessions of the account (GET /me/sessions), with per-device and « others » revocation. */
export function SessionsCard() {
  const { toast } = useToast();
  const sessions = useResource("espace:me:sessions", (signal) => meApi.sessions({ signal }));
  const { setData } = sessions;
  const [revoking, setRevoking] = useState<UserSessionResponse | null>(null);
  const [othersOpen, setOthersOpen] = useState(false);
  const list = sortSessions(sessions.data ?? []);
  const others = list.filter((s) => !s.current);

  return (
    <Card as="section" aria-labelledby="sessions-title">
      <CardHeader
        title={<span id="sessions-title">Sessions actives</span>}
        description="Les appareils actuellement connectés à votre compte."
        icon={<MonitorSmartphone />}
        actions={
          others.length > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => setOthersOpen(true)}>
              Déconnecter les autres appareils
            </Button>
          ) : undefined
        }
      />
      {sessions.error && !sessions.data ? (
        <ErrorState error={sessions.error} onRetry={sessions.reload} scope="section" />
      ) : !sessions.data ? (
        <LoadingRegion label="Chargement des sessions…">
          <Skeleton className="h-24 rounded-card" />
        </LoadingRegion>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">Aucune session active.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
          {list.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-label text-[0.9375rem] font-semibold text-ink-strong">
                  {describeUserAgent(s.userAgent)}
                  {s.current ? (
                    <Badge tone="success" size="sm">
                      Cet appareil
                    </Badge>
                  ) : null}
                </p>
                <p className="mt-0.5 text-[0.8125rem] text-muted">
                  {s.ipAddress ? `IP ${s.ipAddress} · ` : ""}Dernière activité{" "}
                  <time dateTime={s.lastSeenAt} title={formatDateTime(s.lastSeenAt)}>
                    {formatRelative(s.lastSeenAt)}
                  </time>{" "}
                  · Connecté le {formatDateTime(s.createdAt)}
                </p>
              </div>
              {s.current ? null : (
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft={<LogOut aria-hidden="true" />}
                  onClick={() => setRevoking(s)}
                >
                  Déconnecter
                  <span className="sr-only"> : {describeUserAgent(s.userAgent)}</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        title="Déconnecter cet appareil ?"
        description={
          revoking
            ? `${describeUserAgent(revoking.userAgent)}${revoking.ipAddress ? ` (IP ${revoking.ipAddress})` : ""} devra se reconnecter.`
            : undefined
        }
        confirmLabel="Déconnecter"
        onConfirm={async () => {
          if (!revoking) return;
          try {
            await meApi.revokeSession(revoking.id);
          } catch (e) {
            // Already gone (expired or revoked elsewhere): the list is simply out of date.
            if (!hasErrorCode(e, "SESSION_NOT_FOUND")) throw e;
          }
          const id = revoking.id;
          setData((prev) => (prev ?? []).filter((s) => s.id !== id));
          toast({ title: "Appareil déconnecté", variant: "success" });
        }}
      />
      <ConfirmDialog
        open={othersOpen}
        onOpenChange={setOthersOpen}
        title="Déconnecter les autres appareils ?"
        description="Tous les appareils sauf celui-ci devront se reconnecter."
        confirmLabel="Déconnecter les autres"
        onConfirm={async () => {
          const { revoked } = await meApi.revokeOtherSessions();
          setData((prev) => (prev ?? []).filter((s) => s.current));
          toast({
            title:
              revoked > 1
                ? `${revoked} appareils déconnectés`
                : revoked === 1
                  ? "1 appareil déconnecté"
                  : "Aucun autre appareil connecté",
            variant: "success",
          });
        }}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Login history
// ---------------------------------------------------------------------------
/** The last login attempts of the account (GET /me/login-history). */
export function LoginHistoryCard() {
  const history = useResource("espace:me:login-history", (signal) =>
    meApi.loginHistory(LOGIN_HISTORY_LIMIT, { signal }),
  );
  const rows: LoginHistoryResponse[] = history.data ?? [];

  return (
    <Card as="section" aria-labelledby="history-title">
      <CardHeader
        title={<span id="history-title">Historique des connexions</span>}
        description={`Les ${LOGIN_HISTORY_LIMIT} dernières tentatives de connexion à votre compte.`}
        icon={<History />}
      />
      {history.error && !history.data ? (
        <ErrorState error={history.error} onRetry={history.reload} scope="section" />
      ) : !history.data ? (
        <LoadingRegion label="Chargement de l'historique…">
          <Skeleton className="h-32 rounded-card" />
        </LoadingRegion>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">Aucune connexion enregistrée.</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <caption className="sr-only">Historique des connexions</caption>
            <thead>
              <tr className="border-b border-line text-left font-label text-[0.75rem] text-muted">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Date
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Résultat
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Appareil
                </th>
                <th scope="col" className="py-2 pl-3 font-semibold">
                  IP
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id} className="border-b border-line last:border-b-0">
                  <td className="py-2.5 pr-3 whitespace-nowrap tabular">
                    {formatDateTime(h.createdAt)}
                  </td>
                  <td className={cx("px-3 py-2.5", h.success ? "text-success" : "text-danger")}>
                    <span className="inline-flex items-center gap-1.5">
                      {h.success ? (
                        <CheckCircle2 aria-hidden="true" className="size-4" />
                      ) : (
                        <XCircle aria-hidden="true" className="size-4" />
                      )}
                      {loginOutcomeLabel(h)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-ink-soft">{describeUserAgent(h.userAgent)}</td>
                  <td className="py-2.5 pl-3 text-muted tabular">{h.ipAddress ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[0.8125rem] text-muted">
        Une tentative que vous ne reconnaissez pas ? Changez votre mot de passe puis déconnectez les
        autres appareils.
      </p>
    </Card>
  );
}

