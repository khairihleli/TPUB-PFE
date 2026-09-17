"use client";

import { Download } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

import { recoveryCodesFileName, recoveryCodesText } from "@/components/account/two-factor-model";
import { CopyButton } from "@/components/contact/copy-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { saveBlob } from "@/lib/api/client";

export interface RecoveryCodesListProps {
  codes: readonly string[];
  email: string;
  /** Date written in the downloaded file. */
  generatedAt?: Date;
}

/** The recovery codes (shown once) with « Copier » and « Télécharger (.txt) ». */
export function RecoveryCodesList({ codes, email, generatedAt }: RecoveryCodesListProps) {
  const [at] = useState(() => generatedAt ?? new Date());
  const text = recoveryCodesText(codes, email, at);
  return (
    <div className="flex flex-col gap-3">
      <Alert tone="warning" live="none" title="Ces codes ne seront plus affichés">
        Chaque code permet une seule connexion si vous n&apos;avez plus accès à votre application.
        Conservez-les hors de votre téléphone.
      </Alert>
      <ol
        aria-label="Codes de secours"
        className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-control border border-line bg-overlay-inset p-4 font-mono text-[0.9375rem] tracking-wide text-ink-strong"
      >
        {codes.map((code) => (
          <li key={code} className="tabular">
            {code}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton value={text} label="Copier les codes de secours" />
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Download aria-hidden="true" />}
          onClick={() =>
            saveBlob(
              new Blob([text], { type: "text/plain;charset=utf-8" }),
              recoveryCodesFileName(at),
            )
          }
        >
          Télécharger (.txt)
        </Button>
      </div>
    </div>
  );
}

/**
 * Checkbox « J'ai conservé mes codes de secours » gating the continue action. Returns the
 * checkbox element and whether it is ticked.
 */
export function useKeptCodesConfirmation(): { kept: boolean; checkbox: ReactNode } {
  const [kept, setKept] = useState(false);
  const id = useId();
  return {
    kept,
    checkbox: (
      <Checkbox
        id={`kept-${id.replace(/:/g, "")}`}
        label="J'ai conservé mes codes de secours"
        checked={kept}
        onChange={(e) => setKept(e.target.checked)}
      />
    ),
  };
}

export interface RecoveryCodesDialogProps {
  open: boolean;
  codes: readonly string[];
  email: string;
  /** Closing is only possible once the codes are confirmed as kept. */
  onClose: () => void;
  title?: string;
}

/** Shows freshly generated recovery codes; closing requires the « conservés » confirmation. */
export function RecoveryCodesDialog({
  open,
  codes,
  email,
  onClose,
  title = "Vos codes de secours",
}: RecoveryCodesDialogProps) {
  const { kept, checkbox } = useKeptCodesConfirmation();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && kept) onClose();
      }}
    >
      <DialogContent
        title={title}
        description="Dix codes à usage unique, à garder en lieu sûr."
        hideCloseButton
        preventOutsideClose
        footer={
          <Button
            variant="primary"
            disabledReason={kept ? null : "Confirmez d'abord la conservation des codes."}
            onClick={onClose}
          >
            Terminer
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          <RecoveryCodesList codes={codes} email={email} />
          {checkbox}
        </div>
      </DialogContent>
    </Dialog>
  );
}
