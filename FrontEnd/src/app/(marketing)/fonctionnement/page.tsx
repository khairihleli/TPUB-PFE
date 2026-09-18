import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand } from "@/components/marketing/cta-band";
import { PageHero } from "@/components/marketing/page-hero";
import { DoubleControl } from "@/components/story/double-control";
import {
  FONCTIONNEMENT_CTA,
  FONCTIONNEMENT_HERO,
  FONCTIONNEMENT_TOC,
} from "@/components/story/fonctionnement-content";
import { JourneyTimeline } from "@/components/story/journey-timeline";
import { MeasureSection } from "@/components/story/measure-section";
import { PriorityTakeover } from "@/components/story/priority-takeover";
import { SectionToc } from "@/components/story/section-toc";
import { StatusTable } from "@/components/story/status-table";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Fonctionnement",
  description:
    "Le parcours d'une campagne ZELQANE, de l'inscription au journal de diffusion : statuts, analyse IA et validation humaine, ce qui est prouvé et ce qui est estimé, priorité aux messages d'intérêt général.",
  alternates: { canonical: "/fonctionnement" },
};

/**
 * Fonctionnement — brief §8.4. Rhythm: photo hero + in-page nav → sticky-split 9-step
 * timeline → status table (band) → double control (deep) → confidence ladder →
 * public-interest takeover schematic (band) → closing CTA.
 */
export default function FonctionnementPage() {
  return (
    <>
      <PageHero
        eyebrow={FONCTIONNEMENT_HERO.eyebrow}
        title={FONCTIONNEMENT_HERO.title}
        highlight={FONCTIONNEMENT_HERO.highlight}
        lede={FONCTIONNEMENT_HERO.lede}
        image={{ src: "/images/dashboard-hands.jpg", position: "center 45%" }}
        actions={
          <>
            <Button asChild variant="brand" size="lg">
              <Link href={FONCTIONNEMENT_HERO.primary.href}>
                {FONCTIONNEMENT_HERO.primary.label}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="glass" size="lg">
              <a href={FONCTIONNEMENT_HERO.secondary.href}>{FONCTIONNEMENT_HERO.secondary.label}</a>
            </Button>
          </>
        }
        bottom={<SectionToc items={FONCTIONNEMENT_TOC} />}
      />
      <JourneyTimeline />
      <StatusTable />
      <DoubleControl />
      <MeasureSection />
      <PriorityTakeover />
      <CtaBand
        headingId="fonctionnement-cta-titre"
        title={FONCTIONNEMENT_CTA.title}
        highlight={FONCTIONNEMENT_CTA.highlight}
        lede={FONCTIONNEMENT_CTA.lede}
        primary={FONCTIONNEMENT_CTA.primary}
        secondary={FONCTIONNEMENT_CTA.secondary}
        image={{ src: "/images/screen-mall.jpg", alt: "", position: "center 50%" }}
      />
    </>
  );
}
