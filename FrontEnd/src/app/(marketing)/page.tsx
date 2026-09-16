import type { Metadata } from "next";

import { FINAL_CTA } from "@/components/home/content";
import {
  HomeFaq,
  HomeHero,
  HomeIntro,
  HomeMeasurement,
  HomeModeration,
  HomeNetwork,
  HomePersonas,
  HomePillars,
  HomePorteur,
  HomeSteps,
  OrganizationJsonLd,
} from "@/components/home";
import { CtaBand } from "@/components/marketing/cta-band";
import { SITE } from "@/content/site";

export const metadata: Metadata = {
  title: { absolute: "TPUB — Des écrans réels. Des diffusions tracées." },
  description: SITE.description,
  alternates: { canonical: "/" },
};

/**
 * Accueil — brief §8.1. Rhythm: immersive hero → editorial statement → steps (band) →
 * full-bleed pillars → persona image cards → network (glow) → moderation (deep) →
 * measurement → Porteur (band) → FAQ (deep) → closing CTA.
 */
export default function HomePage() {
  return (
    <>
      <OrganizationJsonLd />
      <HomeHero />
      <HomeIntro />
      <HomeSteps />
      <HomePillars />
      <HomePersonas />
      <HomeNetwork />
      <HomeModeration />
      <HomeMeasurement />
      <HomePorteur />
      <HomeFaq />
      <CtaBand
        headingId="cta-final-titre"
        title={FINAL_CTA.title}
        highlight={FINAL_CTA.highlight}
        lede={FINAL_CTA.lede}
        primary={FINAL_CTA.primary}
        secondary={FINAL_CTA.secondary}
        image={{ src: "/images/zones-map.jpg", alt: "", position: "center 40%" }}
      />
    </>
  );
}
