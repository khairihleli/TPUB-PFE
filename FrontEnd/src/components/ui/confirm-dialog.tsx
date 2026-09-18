"use client";

import { type ReactNode, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { presentError } from "@/lib/api/errors";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Extra content (e.g. a reason textarea). */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = destructive red action · primary = blue · brand = gradient. */
  tone?: "danger" | "primary" | "brand";
  /**
   * Called on confirm. If it returns a promise the dialog shows a pending state, closes on
   * success, and shows the French error inline on failure (the dialog stays open).
   */
  onConfirm: () => void | Promise<void>;
  /** Disable the confirm button (e.g. required reason empty). */
  confirmDisabled?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  tone = "danger",
  onConfirm,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Initial focus (APG alert dialog): the first field when there is one (reason textarea),
  // otherwise the least destructive action — never the close icon or the confirm button.
  const focusSafeTarget = (event: Event) => {
    event.preventDefault();
    const field = bodyRef.current?.querySelector<HTMLElement>(
      "input:not([type=hidden]):not(:disabled), textarea:not(:disabled), select:not(:disabled)",
    );
    (field ?? cancelRef.current)?.focus();
  };

  const handleOpenChange = (next: boolean) => {
    if (pending) return;
    if (!next) setError(null);
    onOpenChange(next);
  };

  const handleConfirm = async () => {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      await onConfirm();
      setPending(false);
      onOpenChange(false);
    } catch (e) {
      setPending(false);
      setError(presentError(e).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        title={title}
        description={description}
        size="sm"
        preventOutsideClose={pending}
        hideCloseButton={pending}
        onOpenAutoFocus={focusSafeTarget}
        footer={
          <>
            <Button
              ref={cancelRef}
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              {cancelLabel}
            </Button>
            <Button
              variant={tone}
              loading={pending}
              disabled={confirmDisabled}
              onClick={() => void handleConfirm()}
            >
              {confirmLabel}
            </Button>
          </>
        }
      >
        {children ? <div ref={bodyRef}>{children}</div> : null}
        {error ? (
          <Alert tone="danger" className={children ? "mt-4" : undefined}>
            {error}
          </Alert>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
