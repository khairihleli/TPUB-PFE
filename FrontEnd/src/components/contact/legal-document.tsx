import { ArrowRight, ChevronDown, FileText, Scale } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { LegalToc } from "@/components/contact/legal-toc";
import { PageHero } from "@/components/marketing/page-hero";
import { Section } from "@/components/marketing/section";
import { Alert } from "@/components/ui/alert";
import { LEGAL_NAV } from "@/content/nav";
import { CONTACT, LEGAL_REVIEW_NOTICE } from "@/content/site";

export interface LegalSection {
  id: string;
  title: string;
  content: ReactNode;
}

export interface LegalDocumentProps {
  /** Path of the current document (e.g. "/cgu"), to list the other documents. */
  href: string;
  title: ReactNode;
  /** Plain title used for the breadcrumb. */
  label: string;
  lede: ReactNode;
  /** Version line, e.g. « Version provisoire · septembre 2026 ». */
  version: string;
  sections: readonly LegalSection[];
}

/**
 * Sober legal layout shared by /mentions-legales, /confidentialite, /cgu and /cookies:
 * compact hero, visible legal-review notice, sticky table of contents, numbered sections.
 */
export function LegalDocument({ href, title, label, lede, version, sections }: LegalDocumentProps) {
  const others = LEGAL_NAV.filter((l) => l.href !== href);

  return (
    <>
      <PageHero
        size="compact"
        eyebrow="Informations légales"
        title={title}
        lede={lede}
        breadcrumbs={[{ label: "Accueil", href: "/" }, { label }]}
      />

      <Section spacing="tight" className="pt-10! sm:pt-14!">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-16 xl:gap-20">
          <aside className="lg:sticky lg:top-[calc(var(--header-h)+28px)] lg:self-start">
            {/* Below lg: collapsed summary, so the legal-review notice stays near the top. */}
            <details className="group/sommaire rounded-card border border-line bg-surface/40 lg:hidden">
              <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 rounded-card px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text [&::-webkit-details-marker]:hidden">
                <span className="font-label text-[0.75rem] font-semibold tracking-[0.18em] text-muted uppercase">
                  Sommaire
                  <span className="ml-2 font-sans text-[0.8125rem] font-normal tracking-normal text-muted-2 normal-case">
                    {sections.length} sections
                  </span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 text-muted transition-transform duration-200 ease-smooth group-open/sommaire:rotate-180"
                />
              </summary>
              <nav aria-label="Sommaire du document" className="border-t border-line p-2">
                <ol className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                  {sections.map((s, i) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className="flex min-h-touch items-baseline gap-3 rounded-[10px] px-2.5 py-2.5 text-[0.9375rem] leading-snug text-ink-soft transition-colors hover:bg-white/5 hover:text-ink-strong"
                      >
                        <span
                          aria-hidden="true"
                          className="font-label text-[0.6875rem] font-semibold text-muted-2 tabular"
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span>{s.title}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </details>

            <div className="hidden lg:block">
              <LegalToc items={sections.map((s) => ({ id: s.id, title: s.title }))} />
              <div className="mt-8 border-t border-line pt-6">
                <p className="text-[0.8125rem] leading-relaxed text-muted">
                  Une question sur ce document ?
                </p>
                <Link
                  href="/contact"
                  className="mt-2 inline-flex min-h-touch items-center gap-1.5 font-label text-[0.8125rem] font-semibold text-brand-blue-text hover:text-ink-strong"
                >
                  Écrire à TPUB
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </Link>
              </div>
            </div>
          </aside>

          <article className="min-w-0">
            <Alert
              tone="warning"
              live="none"
              icon={<Scale />}
              title={LEGAL_REVIEW_NOTICE}
              className="rounded-panel"
            >
              Ce document présente les informations connues à ce jour sur TPUB et sur la plateforme,
              au stade de la conception. Il sera complété et validé par un juriste avant la mise en
              service. Pour toute question : {CONTACT.email}.
            </Alert>
            <p className="mt-5 flex items-center gap-2 text-[0.8125rem] text-muted-2">
              <FileText aria-hidden="true" className="size-3.5" />
              {version}
            </p>

            <div className="mt-6">
              {sections.map((s, i) => (
                <section
                  key={s.id}
                  id={s.id}
                  aria-labelledby={`${s.id}-titre`}
                  className="scroll-mt-[calc(var(--header-h)+24px)] border-t border-line py-9 first:border-t-0 sm:py-11"
                >
                  <h2
                    id={`${s.id}-titre`}
                    className="flex items-baseline gap-4 font-display text-[clamp(1.25rem,2.2vw,1.55rem)] leading-tight font-semibold tracking-[-0.01em] text-ink-strong"
                  >
                    <span
                      aria-hidden="true"
                      className="font-label text-[0.75rem] font-semibold tracking-[0.12em] text-brand-orange-text tabular"
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{s.title}</span>
                  </h2>
                  <div className="prose-tpub mt-5 max-w-[68ch]">{s.content}</div>
                </section>
              ))}
            </div>

            <nav aria-label="Autres documents légaux" className="mt-4 border-t border-line pt-10">
              <p className="font-label text-[0.75rem] font-semibold tracking-[0.18em] text-muted uppercase">
                Autres documents
              </p>
              <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {others.map((o) => (
                  <li key={o.href} className="flex">
                    <Link
                      href={o.href}
                      className="group/doc flex min-h-touch w-full items-center justify-between gap-3 rounded-card border border-line bg-surface/40 px-4 py-3.5 text-[0.9375rem] text-ink-soft transition-[border-color,color,background-color] duration-200 ease-smooth hover:border-line-strong hover:bg-surface/70 hover:text-ink-strong"
                    >
                      {o.label}
                      <ArrowRight
                        aria-hidden="true"
                        className="size-4 text-muted transition-transform duration-200 ease-smooth group-hover/doc:translate-x-0.5"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </article>
        </div>
      </Section>
    </>
  );
}

/** Term / value list for identification facts. */
export function LegalFacts({ items }: { items: readonly { term: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 overflow-hidden rounded-card border border-line sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
      {items.map((it, i) => (
        <div key={it.term} className="contents">
          <dt
            className={`px-4 pt-3.5 text-[0.8125rem] font-medium text-muted sm:bg-surface/50 sm:py-3.5 ${i > 0 ? "sm:border-t sm:border-line" : ""}`}
          >
            {it.term}
          </dt>
          <dd
            className={`px-4 pt-1 pb-3.5 text-[0.9375rem] text-ink sm:py-3.5 ${i > 0 ? "sm:border-t sm:border-line" : ""} ${i < items.length - 1 ? "border-b border-line sm:border-b-0" : ""}`}
          >
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Data table for legal pages (cookies inventory…): stacked cards below md (readable at 360px,
 * SPEC §4 « tables become cards < md »), a real table from md up in a keyboard-reachable region.
 */
export function LegalTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: readonly string[];
  rows: readonly (readonly ReactNode[])[];
}) {
  return (
    <div>
      <div role="list" aria-label={caption} className="flex flex-col gap-3 md:hidden">
        {rows.map((r, i) => (
          <div
            key={i}
            role="listitem"
            className="rounded-card border border-line bg-surface/40 px-4 py-4"
          >
            <p className="font-label text-[0.9375rem] leading-snug font-semibold text-ink-strong [overflow-wrap:anywhere]">
              {r[0]}
            </p>
            <dl className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
              {r.slice(1).map((cell, j) => (
                <div key={j}>
                  <dt className="font-label text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-2 uppercase">
                    {head[j + 1]}
                  </dt>
                  <dd className="mt-0.5 text-[0.9375rem] leading-relaxed text-ink-soft">{cell}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <LegalTableDesktop caption={caption} head={head} rows={rows} />
    </div>
  );
}

function LegalTableDesktop({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: readonly string[];
  rows: readonly (readonly ReactNode[])[];
}) {
  return (
    <div
      role="region"
      aria-label={caption}
      // Scrollable region must be keyboard-reachable (WCAG 2.1.1, axe scrollable-region-focusable).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      className="relative hidden overflow-x-auto rounded-card border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text md:block"
    >
      <table className="w-full min-w-[560px] border-collapse text-left text-[0.875rem]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-surface/60">
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="px-4 py-3 font-label text-[0.75rem] font-semibold tracking-[0.08em] text-muted uppercase"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line align-top">
              {r.map((cell, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="px-4 py-3.5 font-medium text-ink">
                    {cell}
                  </th>
                ) : (
                  <td key={j} className="px-4 py-3.5 text-ink-soft">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
