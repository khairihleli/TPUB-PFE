"use client";

import {
  CloudOff,
  Hourglass,
  Lock,
  RefreshCw,
  SearchX,
  ServerCrash,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { type ErrorCategory, presentError } from "@/lib/api/errors";
import { cx } from "@/lib/cx";

export interface ErrorStateProps {
  /** Any thrown value (ApiError, ApiTransportError…). Messages differ for 502 / 401 / 400 / timeout / offline. */
  error: unknown;
  /** Re-runs the failed request (e.g. useResource().reload). */
  onRetry?: () => void;
  /** Override the title (default depends on the error category). */
  title?: string;
  /** Override the message. */
  message?: string;
  /** Link shown for not-found errors or as a section home exit. */
  backHref?: string;
  backLabel?: string;
  /**
   * "page" = the page's primary resource failed (centred, roomy) · "section" = compact card inside
   * the failing section; data outside it stays visible (UX-PLAN §4.6). Default "page".
   */
  scope?: "page" | "section";
  /** @deprecated use scope="section". */
  compact?: boolean;
  /** Next.js error digest: « Référence de l'incident : … ». */
  digest?: string;
  className?: string;
}

const ICONS: Record<ErrorCategory, typeof CloudOff> = {
  unreachable: CloudOff,
  offline: WifiOff,
  slow: Hourglass,
  unauthorized: Lock,
  forbidden: Lock,
  "not-found": SearchX,
  server: ServerCrash,
  invalid: TriangleAlert,
  conflict: TriangleAlert,
  unknown: TriangleAlert,
};

/** Error state for async screens: plain French, never a code, always a way out. */
export function ErrorState({
  error,
  onRetry,
  title,
  message,
  backHref,
  backLabel = "Retour",
  scope,
  compact = false,
  digest,
  className,
}: ErrorStateProps) {
  const p = presentError(error);
  const Icon = ICONS[p.category];
  const section = scope === "section" || (scope === undefined && compact);

  const loginHref =
    typeof window !== "undefined"
      ? `/connexion?next=${encodeURIComponent(window.location.pathname + window.location.search)}&expire=1`
      : "/connexion?expire=1";

  return (
    <div
      role="alert"
      className={cx(
        "flex flex-col rounded-card border border-danger/25 bg-danger/[0.04]",
        section
          ? "items-start gap-2 px-5 py-5 text-left"
          : "items-center gap-3 px-6 py-12 text-center",
        className,
      )}
    >
      <div className={cx("flex gap-3", section ? "items-start" : "flex-col items-center")}>
        <span
          aria-hidden="true"
          className={cx(
            "inline-flex shrink-0 items-center justify-center rounded-full border border-danger/30 bg-danger/10 text-danger",
            section ? "size-9" : "mb-1 size-12",
          )}
        >
          <Icon className={section ? "size-4.5" : "size-5.5"} />
        </span>
        <div className={cx("flex flex-col", section ? "gap-1" : "items-center gap-3")}>
          <p
            className={cx(
              "font-display font-semibold text-ink-strong",
              section ? "text-base" : "text-lg",
            )}
          >
            {title ?? p.title}
          </p>
          <p className="max-w-md text-sm leading-relaxed text-muted">{message ?? p.message}</p>
        </div>
      </div>
      <div
        className={cx("flex flex-wrap gap-2", section ? "mt-1 sm:pl-12" : "mt-3 justify-center")}
      >
        {p.category === "unauthorized" ? (
          <Button asChild variant="primary" size={section ? "sm" : "md"}>
            <Link href={loginHref}>Se reconnecter</Link>
          </Button>
        ) : null}
        {onRetry && p.category !== "unauthorized" && p.category !== "not-found" ? (
          <Button
            variant="secondary"
            size={section ? "sm" : "md"}
            onClick={onRetry}
            iconLeft={<RefreshCw aria-hidden="true" />}
          >
            Réessayer
          </Button>
        ) : null}
        {backHref ? (
          <Button asChild variant="ghost" size={section ? "sm" : "md"}>
            <Link href={backHref}>{backLabel}</Link>
          </Button>
        ) : null}
      </div>
      {digest ? (
        <p className={cx("text-xs text-muted-2", section ? "sm:pl-12" : "mt-2")}>
          Référence de l&apos;incident : <code className="font-mono text-muted">{digest}</code>
        </p>
      ) : null}
    </div>
  );
}
