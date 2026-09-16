import type { ReactNode } from "react";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { StatusBanner } from "@/components/marketing/status-banner";

/**
 * Public site. The header overlays the first section: every page must start with a
 * <PageHero> (or reserve `var(--header-h)` of top padding itself).
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="aurora flex min-h-dvh flex-col">
      <StatusBanner />
      <SiteHeader />
      <main id="contenu" tabIndex={-1} className="flex-1 focus:outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
