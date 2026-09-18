import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand } from "@/components/marketing/cta-band";
import { PageHero } from "@/components/marketing/page-hero";
import { APROPOS_CTA, APROPOS_HERO } from "@/components/story/a-propos-content";
import { GroupChain } from "@/components/story/group-chain";
import { MaturityPanel } from "@/components/story/maturity-panel";
import { MissionBlock } from "@/components/story/mission-block";
import { PrinciplesList } from "@/components/story/principles-list";
import { TunisieBand } from "@/components/story/tunisie-band";
import { Button } from "@/components/ui/button";
import { GROUP } from "@/content/site";

export const metadata: Metadata = {
  title: "À propos",
  description:
    "ZELQANE, société d'affichage numérique extérieur du groupe Tukhnanutha : mission, principes, place dans le pôle Médias, audience & données, et statut de maturité.",
  alternates: { canonical: "/a-propos" },
};

/**
 * À propos — brief §8.6. Rhythm: photo hero → mission + quote + risk shift → principles
 * (band, sticky image) → group chain (glow, tricolor) → maturity panel (deep) →
 * Tunisia panoramic → closing CTA.
 */
export default function AProposPage() {
  return (
    <>
      <PageHero
        eyebrow={APROPOS_HERO.eyebrow}
        title={APROPOS_HERO.title}
        highlight={APROPOS_HERO.highlight}
        lede={APROPOS_HERO.lede}
        image={{ src: "/images/team-planning.jpg", position: "center 40%" }}
        actions={
          <>
            <Button asChild variant="brand" size="lg">
              <Link href={APROPOS_HERO.primary.href}>
                {APROPOS_HERO.primary.label}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="glass" size="lg">
              <a href={GROUP.zelqanePage} target="_blank" rel="noopener noreferrer">
                {APROPOS_HERO.secondary.label}
                <ArrowUpRight aria-hidden="true" />
                <span className="sr-only"> (site du groupe Tukhnanutha, nouvel onglet)</span>
              </a>
            </Button>
          </>
        }
        note={GROUP.mention}
      />
      <MissionBlock />
      <PrinciplesList />
      <GroupChain />
      <MaturityPanel />
      <TunisieBand />
      <CtaBand
        headingId="apropos-cta-titre"
        title={APROPOS_CTA.title}
        highlight={APROPOS_CTA.highlight}
        lede={APROPOS_CTA.lede}
        primary={APROPOS_CTA.primary}
        secondary={{ label: "Découvrir le groupe", href: GROUP.url }}
        image={{ src: "/images/led-closeup.jpg", alt: "", position: "center 50%" }}
      />
    </>
  );
}
