import {
  ArrowDown,
  ArrowRight,
  CalendarClock,
  MapPinned,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import { HERO, MECHANISMS } from "@/components/home/content";
import { BroadcastScreen } from "@/components/marketing/broadcast-screen";
import { PageHero } from "@/components/marketing/page-hero";
import { StatBand } from "@/components/marketing/stat-band";
import { Button } from "@/components/ui/button";

const MECHANISM_ICONS = [
  <MapPinned key="zone" />,
  <CalendarClock key="creneau" />,
  <ShieldCheck key="controle" />,
  <ScrollText key="journal" />,
];

/** Full-bleed home hero: night boulevard photo, split with the broadcast screen, mechanisms band. */
export function HomeHero() {
  return (
    <PageHero
      size="full"
      // Keep the eyebrow pill on a single line on phones (360–390px): tighter tracking only there.
      className="max-sm:[&_.eyebrow-pill]:text-[0.6875rem] max-sm:[&_.eyebrow-pill]:tracking-[0.1em]"
      eyebrow={HERO.eyebrow}
      title={HERO.title}
      highlight={HERO.highlight}
      lede={HERO.lede}
      image={{ src: "/images/hero-city.jpg", position: "62% center" }}
      actions={
        <>
          <Button asChild variant="brand" size="lg">
            <Link href={HERO.primary.href}>
              {HERO.primary.label}
              <ArrowRight
                aria-hidden="true"
                className="transition-transform duration-200 group-hover/btn:translate-x-0.5"
              />
            </Link>
          </Button>
          <Button asChild variant="glass" size="lg">
            <Link href={HERO.secondary.href}>{HERO.secondary.label}</Link>
          </Button>
          <a
            href={HERO.tertiary.href}
            className="group inline-flex min-h-touch items-center gap-2 px-1 font-label text-[0.875rem] font-semibold text-ink-soft transition-colors hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text"
          >
            {HERO.tertiary.label}
            <ArrowDown
              aria-hidden="true"
              className="size-4 transition-transform duration-300 ease-smooth group-hover:translate-y-0.5"
            />
          </a>
        </>
      }
      note={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {HERO.note.map((item, i) => (
            <span key={item} className="inline-flex items-center gap-3">
              {i > 0 ? (
                <span aria-hidden="true" className="size-1 rounded-full bg-brand-orange-text/70" />
              ) : null}
              {item}
            </span>
          ))}
        </span>
      }
      aside={
        <div className="relative mx-auto w-full max-w-[420px] lg:mr-0 lg:ml-auto">
          {/* Corner ticks: frame the screen like a viewfinder (decorative) */}
          <div aria-hidden="true" className="pointer-events-none absolute -inset-4 hidden sm:block">
            <span className="absolute top-0 left-0 size-5 border-t border-l border-orange-line" />
            <span className="absolute top-0 right-0 size-5 border-t border-r border-orange-line" />
            <span className="absolute bottom-0 left-0 size-5 border-b border-l border-blue-line" />
            <span className="absolute right-0 bottom-0 size-5 border-r border-b border-blue-line" />
          </div>
          <BroadcastScreen hideLogBelow="lg" />
        </div>
      }
      bottom={
        <StatBand
          variant="overlay"
          label="Mécanismes de la plateforme"
          items={MECHANISMS.map((m, i) => ({ ...m, icon: MECHANISM_ICONS[i] }))}
        />
      }
    />
  );
}
