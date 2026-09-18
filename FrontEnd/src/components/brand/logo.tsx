import Image from "next/image";
import Link from "next/link";

import { SITE } from "@/content/site";
import { cx } from "@/lib/cx";

export interface LogoProps {
  /** mark = monogram only · full = monogram + ZELQANE wordmark (+ subline) · wordmark = text only */
  variant?: "mark" | "full" | "wordmark";
  size?: "sm" | "md" | "lg";
  /** Show « Affichage numérique extérieur » under the wordmark. */
  subline?: boolean;
  /** Wraps in a link (e.g. "/"). The accessible name becomes « ZELQANE — Accueil ». */
  href?: string;
  /** Load eagerly (header). */
  priority?: boolean;
  className?: string;
}

const MARK = { sm: 28, md: 36, lg: 52 } as const;
const WORD = { sm: "text-[0.95rem]", md: "text-[1.1rem]", lg: "text-[1.5rem]" } as const;

export function Logo({
  variant = "full",
  size = "md",
  subline = false,
  href,
  priority = false,
  className,
}: LogoProps) {
  const px = MARK[size];
  const content = (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      {variant !== "wordmark" ? (
        <Image
          src="/brand/zelqane.png"
          alt={variant === "mark" && !href ? SITE.name : ""}
          width={px}
          height={Math.round((px * 296) / 274)}
          priority={priority}
          draggable={false}
          className="shrink-0 drop-shadow-[0_2px_10px_color-mix(in_srgb,var(--color-brand-orange)_28%,transparent)]"
        />
      ) : null}
      {variant !== "mark" ? (
        <span className="flex flex-col leading-none">
          <span
            className={cx("font-display font-bold tracking-[0.14em] text-ink-strong", WORD[size])}
          >
            T<span className="text-ink">PUB</span>
          </span>
          {subline ? (
            <span className="mt-1 font-label text-[0.625rem] font-medium tracking-[0.13em] text-brand-orange-text uppercase">
              {SITE.subline}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );

  if (!href) return content;
  return (
    <Link href={href} aria-label={`${SITE.name} — Accueil`} className="inline-flex rounded-[10px]">
      {content}
    </Link>
  );
}
