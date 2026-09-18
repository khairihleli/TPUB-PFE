import { ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { Reveal } from "@/components/marketing/reveal";
import { FOOTER_COLUMNS, LEGAL_NAV } from "@/content/nav";
import { CONTACT, copyrightLine, GROUP, SITE, SOCIAL } from "@/content/site";

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="currentColor">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="currentColor">
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z" />
    </svg>
  );
}

function FooterLink({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: ReactNode;
}) {
  const cls =
    "underline-slide inline-flex items-center gap-1 py-1 text-[0.875rem] text-muted transition-colors hover:text-ink-strong";
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
        <ArrowUpRight aria-hidden="true" className="size-3.5 opacity-60" />
        <span className="sr-only"> (nouvel onglet)</span>
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

/** Editorial footer: tricolor hairline, spaced ZELQANE monument, link columns, group card, legal bar. */
export function SiteFooter() {
  return (
    <footer className="relative isolate overflow-hidden border-t border-line bg-[linear-gradient(180deg,var(--color-bg),var(--color-bg-2))]">
      <div
        aria-hidden="true"
        className="hairline-tricolor absolute inset-x-0 top-0 shadow-[0_0_28px_var(--color-orange-soft)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_40%_at_50%_0%,var(--color-orange-soft),transparent_70%)] opacity-60"
      />

      <div className="container-site pt-[clamp(56px,8vw,96px)] pb-8">
        {/* Monument */}
        <Reveal variant="blur" className="border-b border-line pb-10 text-center">
          <p
            aria-hidden="true"
            className="text-gradient font-display text-[clamp(2.75rem,12vw,8.5rem)] leading-none font-bold tracking-[0.3em] [margin-right:-0.3em]"
          >
            ZELQANE
          </p>
          <p className="mx-auto mt-6 max-w-[520px] text-[0.9375rem] leading-relaxed text-muted">
            {SITE.pitch}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <a
              href={SOCIAL.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="ZELQANE et le groupe Tukhnanutha sur LinkedIn (nouvel onglet)"
              className="inline-flex size-11 items-center justify-center rounded-control border border-line bg-white/[0.03] text-muted transition-[transform,background-color,color,border-color] duration-200 hover:-translate-y-0.5 hover:border-orange-line hover:bg-orange-soft hover:text-brand-orange-text"
            >
              <LinkedInIcon />
            </a>
            <a
              href={SOCIAL.youtube}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Le groupe Tukhnanutha sur YouTube (nouvel onglet)"
              className="inline-flex size-11 items-center justify-center rounded-control border border-line bg-white/[0.03] text-muted transition-[transform,background-color,color,border-color] duration-200 hover:-translate-y-0.5 hover:border-orange-line hover:bg-orange-soft hover:text-brand-orange-text"
            >
              <YouTubeIcon />
            </a>
          </div>
        </Reveal>

        {/* Columns */}
        <div className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.1fr_1.3fr] lg:gap-8">
          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="mb-4 font-label text-[0.6875rem] font-bold tracking-[0.22em] text-brand-orange-text uppercase">
                {col.title}
              </h2>
              <ul className="flex flex-col gap-1.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <FooterLink href={l.href} external={l.external}>
                      {l.label}
                    </FooterLink>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div>
            <h2 className="mb-4 font-label text-[0.6875rem] font-bold tracking-[0.22em] text-brand-orange-text uppercase">
              Contact
            </h2>
            <address className="flex flex-col gap-2.5 text-[0.875rem] text-muted not-italic">
              <a
                href={`mailto:${CONTACT.email}`}
                className="inline-flex items-center gap-2.5 transition-colors hover:text-ink-strong"
              >
                <Mail aria-hidden="true" className="size-4 text-muted-2" />
                {CONTACT.email}
              </a>
              <a
                href={CONTACT.phoneHref}
                className="inline-flex items-center gap-2.5 transition-colors hover:text-ink-strong"
              >
                <Phone aria-hidden="true" className="size-4 text-muted-2" />
                {CONTACT.phone}
              </a>
              <span className="inline-flex items-center gap-2.5">
                <MapPin aria-hidden="true" className="size-4 text-muted-2" />
                {CONTACT.address}
              </span>
            </address>

            <a
              href={GROUP.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group/grp mt-6 flex items-center gap-3.5 rounded-card border border-line bg-white/[0.02] p-3.5 transition-colors hover:border-orange-line"
            >
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[10px] border border-line bg-black/30">
                <Image
                  src="/brand/tukhnanutha.png"
                  alt=""
                  width={28}
                  height={27}
                  className="h-auto w-7"
                />
              </span>
              <span className="min-w-0">
                <span className="block font-label text-[0.8125rem] font-semibold text-ink-strong">
                  {GROUP.mention}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-[0.75rem] text-muted group-hover/grp:text-brand-orange-text">
                  Découvrir le groupe
                  <ArrowUpRight aria-hidden="true" className="size-3.5" />
                </span>
                <span className="sr-only"> (nouvel onglet)</span>
              </span>
            </a>
          </div>
        </div>

        <p className="max-w-[70ch] border-t border-line pt-6 text-[0.8125rem] leading-relaxed text-muted-2">
          {GROUP.pole}
        </p>

        {/* Legal bar */}
        <div className="mt-6 flex flex-col gap-4 border-t border-line pt-6 text-[0.8125rem] text-muted-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
            <Logo variant="mark" size="sm" />
            <span>{copyrightLine()}</span>
            <span className="hidden text-brand-orange-text/80 sm:inline">{SITE.tagline}</span>
          </div>
          <nav aria-label="Informations légales">
            <ul className="flex flex-wrap gap-x-5 gap-y-1">
              {LEGAL_NAV.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="inline-flex min-h-8 items-center transition-colors hover:text-ink-strong"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
