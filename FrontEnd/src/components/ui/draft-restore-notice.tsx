"use client";

import { History } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";

export interface DraftRestoreNoticeProps {
  restoredAt: Date;
  /** Discards the local draft (consumer resets its fields). */
  onDiscard: () => void;
  className?: string;
}

/** « Saisie restaurée (il y a 5 min). » + « Effacer » (UX-PLAN §7.2). */
export function DraftRestoreNotice({ restoredAt, onDiscard, className }: DraftRestoreNoticeProps) {
  return (
    <Alert
      tone="info"
      live="status"
      icon={<History />}
      className={className}
      action={
        // Negative margin: the ghost label lines up with the text above it.
        <Button variant="ghost" size="sm" onClick={onDiscard} className="-ml-3.5">
          Effacer
        </Button>
      }
    >
      Saisie restaurée ({formatRelative(restoredAt)}). Elle est conservée sur cet appareil tant que
      vous n&apos;avez pas enregistré.
    </Alert>
  );
}
