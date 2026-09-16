import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export interface AuthHeaderProps {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}

/** Page heading of the auth screens (the page's single h1), CSS-only entrance. */
export function AuthHeader({ eyebrow, title, subtitle, className }: AuthHeaderProps) {
  return (
    <header className={cx("flex flex-col gap-3", className)}>
      <p className="enter eyebrow">{eyebrow}</p>
      <h1 className="enter enter-1 font-display text-[clamp(1.9rem,4vw,2.5rem)] leading-[1.08] font-semibold tracking-[-0.02em] text-ink-strong">
        {title}
      </h1>
      {subtitle ? (
        <p className="enter enter-2 text-[0.9375rem] leading-relaxed text-muted">{subtitle}</p>
      ) : null}
    </header>
  );
}

/** Frosted card around auth forms. */
export function AuthCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "enter enter-2 glass-card overflow-hidden rounded-panel p-5 min-[400px]:p-6 sm:p-8",
        className,
      )}
    >
      <span aria-hidden="true" className="hairline-tricolor absolute inset-x-0 top-0 opacity-70" />
      {children}
    </div>
  );
}
