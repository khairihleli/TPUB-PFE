"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import { cx } from "@/lib/cx";
import type { AutosaveState } from "@/lib/forms/autosave";
import { formatRelative } from "@/lib/format";

export interface AutosaveStatusProps {
  state: AutosaveState;
  savedAt?: Date | null;
  onRetry?: () => void;
  className?: string;
}

/** Re-render every 15 s so « il y a 5 s » stays true. */
function useNow(active: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** « Enregistrement… » · « Enregistré · il y a 5 s » · « Échec de l'enregistrement · Réessayer ». */
export function AutosaveStatus({ state, savedAt, onRetry, className }: AutosaveStatusProps) {
  const now = useNow(state === "saved");
  return (
    <p
      role="status"
      className={cx(
        "inline-flex min-h-9 items-center gap-1.5 text-[0.8125rem] text-muted",
        className,
      )}
    >
      {state === "saving" ? (
        <>
          <Spinner size="sm" />
          Enregistrement…
        </>
      ) : state === "saved" ? (
        <>
          <CircleCheck aria-hidden="true" className="size-4 text-success" />
          Enregistré
          {savedAt ? ` · ${formatRelative(savedAt, now < savedAt ? savedAt : now)}` : null}
        </>
      ) : state === "error" ? (
        <>
          <CircleAlert aria-hidden="true" className="size-4 text-danger" />
          <span className="text-danger">Échec de l&apos;enregistrement</span>
          {onRetry ? (
            <>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={onRetry}
                className="hit-area relative font-semibold text-brand-blue-text underline-offset-4 hover:underline"
              >
                Réessayer
              </button>
            </>
          ) : null}
        </>
      ) : null}
    </p>
  );
}
