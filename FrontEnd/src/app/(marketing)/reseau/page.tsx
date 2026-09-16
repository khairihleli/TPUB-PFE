import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CtaBand } from "@/components/marketing/cta-band";
import { PageHero } from "@/components/marketing/page-hero";
import { ChannelsStrip } from "@/components/story/channels-strip";
import { DiffusionCascade } from "@/components/story/diffusion-cascade";
import { EmplacementTypes } from "@/components/story/emplacement-types";
import { PorteurSection } from "@/components/story/porteur-layers";
import { RESEAU_CTA, RESEAU_HERO } from "@/components/story/reseau-content";
import { VisibilitySection } from "@/components/story/visibility-diagram";
import { ZonesExplainer } from "@/components/story/zones-explainer";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Réseau & zones",
  description:
    "Le Porteur comme support de l'écran, les types d'emplacements A à D, la logique de zones et l'ordre de diffusion des contenus : le réseau TPUB tel qu'il est conçu.",
  alternates: { canonical: "/reseau" },
};

/**
 * Réseau & zones — brief §8.3. Rhythm: photo hero → Porteur + layer stack (sticky split) →
 * A–D typology cards (band) → diffusion cascade (deep) → zones map (glow) →
 * visibility schematic (band, tight) → channels grid → closing CTA.
 */
export default function ReseauPage() {
  return (
    <>
      <PageHero
        eyebrow={RESEAU_HERO.eyebrow}
        title={RESEAU_HERO.title}
        highlight={RESEAU_HERO.highlight}
        lede={RESEAU_HERO.lede}
        image={{ src: "/images/screen-transport.jpg", position: "center 55%" }}
        actions={
          <>
            <Button asChild variant="brand" size="lg" wrap>
              <Link href={RESEAU_HERO.primary.href}>
                {RESEAU_HERO.primary.label}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="glass" size="lg" wrap>
              <Link href={RESEAU_HERO.secondary.href}>{RESEAU_HERO.secondary.label}</Link>
            </Button>
          </>
        }
        note={RESEAU_HERO.note}
      />
      <PorteurSection />
      <EmplacementTypes />
      <DiffusionCascade />
      <ZonesExplainer />
      <VisibilitySection />
      <ChannelsStrip />
      <CtaBand
        headingId="reseau-cta-titre"
        title={RESEAU_CTA.title}
        highlight={RESEAU_CTA.highlight}
        lede={RESEAU_CTA.lede}
        primary={RESEAU_CTA.primary}
        secondary={RESEAU_CTA.secondary}
        image={{ src: "/images/zones-map.jpg", alt: "", position: "center 40%" }}
      />
    </>
  );
}
