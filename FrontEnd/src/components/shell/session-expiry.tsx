"use client";

/**
 * Session expiry UI (UX-PLAN §7.5, FFA-01): banner at T−10 min (role="status"), again with
 * role="alert" at T−2 min, and a non-dismissible dialog at T or on the first 401.
 */
import { Clock, LogIn } from "lucide-react";
import { Dialog as RadixDialog } from "radix-ui";
import { useEffect, useState } from "react";

import { useSession } from "@/components/shell/session-provider";
import { Button } from "@/components/ui/button";
import { useHasDirtyDrafts } from "@/lib/forms/form-draft";
import { suspendUnsavedGuards } from "@/lib/forms/unsaved-guard";
import { formatTime } from "@/lib/format";
import { routes } from "@/lib/routes";

function currentPath(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

export function reloginHref(path: string = currentPath(), expired = false): string {
  return routes.login({ next: path, expire: expired, renew: !expired });
}

export function SessionExpiryBanner() {
  const { deadline } = useSession();
  const [hiddenPhase, setHiddenPhase] = useState<"warning" | null>(null);
  const { phase, expiresAt } = deadline;

  useEffect(() => {
    if (phase === "ok") setHiddenPhase(null);
  }, [phase]);

  if (phase !== "warning" && phase !== "critical") return null;
  if (phase === "warning" && hiddenPhase === "warning") return null;

  const critical = phase === "critical";
  return (
    <div
      role={critical ? "alert" : "status"}
      className={
        critical
          ? "border-b border-danger/35 bg-surface-2 text-ink"
          : "border-b border-warning/30 bg-surface-2 text-ink"
      }
    >
      <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-10">
        <Clock
          aria-hidden="true"
          className={critical ? "size-4 shrink-0 text-danger" : "size-4 shrink-0 text-warning"}
        />
        <p className="min-w-0 flex-1 text-sm">
          Votre session expire à <strong className="tabular">{formatTime(expiresAt)}</strong>.
          Enregistrez votre travail.
        </p>
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" size="sm">
            <a href={reloginHref()} target="_blank" rel="noopener noreferrer">
              <LogIn aria-hidden="true" />
              Se reconnecter
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          </Button>
          {!critical ? (
            <Button variant="ghost" size="sm" onClick={() => setHiddenPhase("warning")}>
              Masquer
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export interface SessionExpiredDialogProps {
  open: boolean;
  /** Test hook: overrides the dirty-draft detection. */
  hasDrafts?: boolean;
}

/** Not dismissible: « Session expirée » + « Se reconnecter » → /connexion?next={path}&expire=1. */
export function SessionExpiredDialog({ open, hasDrafts }: SessionExpiredDialogProps) {
  const dirtyDrafts = useHasDirtyDrafts();
  const kept = hasDrafts ?? dirtyDrafts;
  const [href, setHref] = useState("/connexion?expire=1");

  useEffect(() => {
    if (open) setHref(reloginHref(currentPath(), true));
  }, [open]);

  return (
    <RadixDialog.Root open={open}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-(--z-modal) bg-scrim" />
        <div className="fixed inset-0 z-(--z-modal) flex items-end justify-center p-3 sm:items-center sm:p-6">
          <RadixDialog.Content
            role="alertdialog"
            onEscapeKeyDown={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
            className="relative flex w-full max-w-md animate-panel-in flex-col gap-4 rounded-panel border border-line-strong bg-surface p-6 shadow-card focus:outline-none sm:p-7"
          >
            <RadixDialog.Title className="font-display text-xl font-semibold text-ink-strong">
              Session expirée
            </RadixDialog.Title>
            <RadixDialog.Description className="text-sm leading-relaxed text-muted">
              {kept
                ? "Vos saisies de cette page sont conservées sur cet appareil. Reconnectez-vous pour continuer."
                : "Reconnectez-vous pour continuer."}
            </RadixDialog.Description>
            <div className="flex justify-end">
              <Button asChild variant="primary">
                <a href={href} data-guard="off" onClick={() => suspendUnsavedGuards()}>
                  Se reconnecter
                </a>
              </Button>
            </div>
          </RadixDialog.Content>
        </div>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
