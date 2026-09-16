"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { STATUS_NOTICE } from "@/content/site";
import { cx } from "@/lib/cx";

const STORAGE_KEY = "tpub:status-banner-dismissed";

export interface StatusBannerProps {
  message?: string;
  className?: string;
}

/** Discreet, dismissable maturity notice (brief §8.0). Dismissal persists for the session. */
export function StatusBanner({ message = STATUS_NOTICE, className }: StatusBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(STORAGE_KEY) === "1") setDismissed(true);
    } catch {
      /* storage unavailable (private mode) */
    }
  }, []);

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <aside
      aria-label="Statut du projet"
      className={cx("relative z-(--z-header) border-b border-line bg-bg-2/95", className)}
    >
      <div className="container-site flex min-h-10 items-center gap-3 py-2 pr-1">
        <span className="hidden shrink-0 items-center gap-2 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 font-label text-[0.625rem] font-semibold tracking-[0.12em] text-warning uppercase sm:inline-flex">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
          Conception
        </span>
        <p className="min-w-0 flex-1 text-[0.75rem] leading-snug text-muted sm:text-[0.8125rem]">
          {message}
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Masquer le bandeau de statut"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/6 hover:text-ink"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    </aside>
  );
}
