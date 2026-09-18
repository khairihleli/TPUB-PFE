"use client";

import { ExternalLink, KeyRound, RefreshCw, ShieldOff } from "lucide-react";
import { useState } from "react";

import { QrCodeSvg } from "@/components/account/qr-code-svg";
import { CopyButton } from "@/components/contact/copy-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { deviceKeysApi } from "@/lib/api/endpoints";
import { presentError } from "@/lib/api/errors";
import type {
  DeviceKeyIssuedResponse,
  DeviceKeyStatusResponse,
  SupportResponse,
} from "@/lib/api/types";
import { formatDateTime, formatRelative } from "@/lib/format";

/**
 * Full pairing URL opened on the screen: `origin` + the backend `pairingPath`
 * (`/ecran/{id}?cle=…`). A path that is not a player path is refused (null).
 */
export function pairingUrl(origin: string, pairingPath: string): string | null {
  if (!/^\/ecran\/\d+\?cle=tpd_[A-Za-z0-9_-]{43}$/.test(pairingPath)) return null;
  return `${origin.replace(/\/+$/, "")}${pairingPath}`;
}

/** « Écran appairé · dernier contact il y a 3 min » / « Écran non appairé ». */
export function deviceStatusLabel(
  status: Pick<DeviceKeyStatusResponse, "paired" | "lastUsedAt"> | null | undefined,
): string {
  if (!status?.paired) return "Écran non appairé";
  return status.lastUsedAt
    ? `Écran appairé · dernier contact ${formatRelative(status.lastUsedAt)}`
    : "Écran appairé · jamais connecté";
}

/** Status after an issue, without refetching the list. */
export function statusAfterIssue(
  support: Pick<SupportResponse, "id" | "name">,
  issued: DeviceKeyIssuedResponse,
): DeviceKeyStatusResponse {
  return {
    supportId: support.id,
    supportName: support.name,
    paired: true,
    keyPrefix: issued.keyPrefix,
    createdAt: issued.createdAt,
    lastUsedAt: null,
    lastUsedIp: null,
  };
}

export interface DevicePairingDialogProps {
  support: SupportResponse | null;
  /** Current key status (undefined while the list loads or failed to load). */
  status: DeviceKeyStatusResponse | undefined;
  /** ADMINISTRATEUR: issue, rotate and revoke. Other staff: read-only status. */
  canAct: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (status: DeviceKeyStatusResponse) => void;
}

/**
 * « Appairer l'écran » (docs/round2-contract.md §3.4, §3.7): generates or rotates the device key of
 * a Porteur, shows it once with the pairing URL, a copy button, a QR code and a link to open the
 * player, and revokes it.
 */
export function DevicePairingDialog({
  support,
  status,
  canAct,
  onOpenChange,
  onStatusChange,
}: DevicePairingDialogProps) {
  const { toast } = useToast();
  const [issued, setIssued] = useState<DeviceKeyIssuedResponse | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const paired = status?.paired === true;
  const shownIssued = issued && support && issued.supportId === support.id ? issued : null;
  const url =
    shownIssued && typeof window !== "undefined"
      ? pairingUrl(window.location.origin, shownIssued.pairingPath)
      : null;

  const close = (open: boolean) => {
    if (issuing) return;
    if (!open) {
      // The key is never shown again once the dialog is closed.
      setIssued(null);
      setIssueError(null);
    }
    onOpenChange(open);
  };

  const issue = async () => {
    if (!support) return;
    setIssueError(null);
    setIssuing(true);
    try {
      const res = await deviceKeysApi.issue(support.id);
      setIssued(res);
      onStatusChange(statusAfterIssue(support, res));
      toast({ title: paired ? "Clé remplacée" : "Clé générée", variant: "success" });
    } catch (e) {
      setIssueError(presentError(e).message);
    } finally {
      setIssuing(false);
    }
  };

  return (
    <Dialog open={support !== null} onOpenChange={close}>
      {support ? (
        <DialogContent
          size="md"
          title={`Appairer l'écran « ${support.name} »`}
          description="Une clé d'appareil autorise ce seul écran à demander ses contenus."
          preventOutsideClose={shownIssued !== null || issuing}
        >
          <div className="flex flex-col gap-5">
            <dl className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-card border border-line bg-overlay-inset p-4 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-[0.75rem] text-muted">État</dt>
                <dd className="mt-1">
                  {status === undefined ? (
                    <span className="text-muted">Indisponible</span>
                  ) : paired ? (
                    <Badge tone="success" size="sm">
                      Écran appairé
                    </Badge>
                  ) : (
                    <Badge tone="muted" size="sm">
                      Écran non appairé
                    </Badge>
                  )}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[0.75rem] text-muted">Clé</dt>
                <dd className="mt-1 font-mono text-[0.8125rem] text-ink-soft">
                  {status?.keyPrefix ? `${status.keyPrefix}…` : "—"}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[0.75rem] text-muted">Générée le</dt>
                <dd className="mt-1 text-ink-soft">
                  {status?.createdAt ? formatDateTime(status.createdAt) : "—"}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[0.75rem] text-muted">Dernier contact</dt>
                <dd className="mt-1 text-ink-soft">
                  {status?.lastUsedAt
                    ? `${formatDateTime(status.lastUsedAt)}${status.lastUsedIp ? ` · IP ${status.lastUsedIp}` : ""}`
                    : "—"}
                </dd>
              </div>
            </dl>

            {shownIssued ? (
              <section aria-labelledby="pairing-key-title" className="flex flex-col gap-4">
                <h3
                  id="pairing-key-title"
                  className="font-label text-[0.9375rem] font-semibold text-ink-strong"
                >
                  Lien d&apos;appairage
                </h3>
                <Alert tone="warning" live="status" title="Cette clé ne sera plus affichée">
                  Ouvrez le lien sur l&apos;écran maintenant, ou copiez-le dans un endroit sûr. Il
                  suffit à faire diffuser ce Porteur.
                </Alert>
                {url ? (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <QrCodeSvg
                      value={url}
                      label="QR code du lien d'appairage de l'écran"
                      className="mx-auto w-40 shrink-0 p-1 sm:mx-0"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-3">
                      <div className="flex items-start gap-2">
                        <code className="min-w-0 flex-1 rounded-control border border-line bg-overlay-inset px-3 py-2 font-mono text-[0.75rem] break-all text-ink-strong">
                          {url}
                        </code>
                        <CopyButton value={url} label="Copier le lien d'appairage" />
                      </div>
                      <div>
                        <Button asChild variant="secondary" size="sm">
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink aria-hidden="true" />
                            Ouvrir le lecteur
                            <span className="sr-only"> (nouvel onglet)</span>
                          </a>
                        </Button>
                      </div>
                      <p className="text-[0.75rem] text-muted">
                        Préfixe de la clé :{" "}
                        <span className="font-mono">{shownIssued.keyPrefix}</span>
                      </p>
                    </div>
                  </div>
                ) : (
                  <Alert tone="danger" title="Lien d'appairage illisible">
                    Réponse inattendue du service : régénérez la clé.
                  </Alert>
                )}
              </section>
            ) : null}

            {issueError ? (
              <Alert tone="danger" title="Clé non générée">
                {issueError}
              </Alert>
            ) : null}

            {canAct ? (
              <div className="flex flex-wrap items-center gap-2">
                {paired ? (
                  <>
                    <Button
                      variant="primary"
                      iconLeft={<RefreshCw aria-hidden="true" />}
                      loading={issuing}
                      loadingLabel="Génération…"
                      onClick={() => setConfirmRotate(true)}
                    >
                      Remplacer la clé
                    </Button>
                    <Button
                      variant="ghost"
                      iconLeft={<ShieldOff aria-hidden="true" />}
                      disabled={issuing}
                      onClick={() => setConfirmRevoke(true)}
                    >
                      Révoquer
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    iconLeft={<KeyRound aria-hidden="true" />}
                    loading={issuing}
                    loadingLabel="Génération…"
                    disabledReason={
                      status === undefined ? "État de l'appairage indisponible : actualisez." : null
                    }
                    onClick={() => void issue()}
                  >
                    Générer la clé de l&apos;écran
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-[0.8125rem] text-muted">
                Seul un administrateur peut générer, remplacer ou révoquer la clé d&apos;un écran.
              </p>
            )}
          </div>

          <ConfirmDialog
            open={confirmRotate}
            onOpenChange={setConfirmRotate}
            tone="primary"
            title="Remplacer la clé de cet écran ?"
            description="L'ancien écran sera déconnecté : il faudra ouvrir le nouveau lien d'appairage sur le Porteur."
            confirmLabel="Remplacer la clé"
            onConfirm={() => issue()}
          />
          <ConfirmDialog
            open={confirmRevoke}
            onOpenChange={setConfirmRevoke}
            title="Révoquer la clé de cet écran ?"
            description="L'écran cessera immédiatement de diffuser jusqu'à un nouvel appairage."
            confirmLabel="Révoquer"
            onConfirm={async () => {
              await deviceKeysApi.revoke(support.id);
              setIssued(null);
              onStatusChange({
                supportId: support.id,
                supportName: support.name,
                paired: false,
                keyPrefix: null,
                createdAt: null,
                lastUsedAt: null,
                lastUsedIp: null,
              });
              toast({ title: "Clé révoquée", variant: "success" });
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
