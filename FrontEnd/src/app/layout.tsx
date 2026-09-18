import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import type { ReactNode } from "react";

import { GROUP, SITE, siteUrl } from "@/content/site";

const sora = Sora({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sora-var",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter-var",
  display: "swap",
});

export function generateMetadata(): Metadata {
  const base = siteUrl();
  return {
    metadataBase: new URL(base),
    title: {
      default: `${SITE.name} — ${SITE.subline} | ${GROUP.mention}`,
      template: `%s — ${SITE.name}`,
    },
    description: SITE.description,
    applicationName: SITE.name,
    authors: [{ name: "ZELQANE", url: GROUP.zelqanePage }],
    creator: "ZELQANE",
    publisher: "Groupe Tukhnanutha",
    formatDetection: { telephone: false, email: false, address: false },
    openGraph: {
      type: "website",
      locale: SITE.locale,
      siteName: SITE.name,
      title: `${SITE.name} — ${SITE.tagline}`,
      description: SITE.description,
      url: base,
      images: [
        {
          url: SITE.defaultOgImage,
          width: 2752,
          height: 1536,
          alt: "Écran LED numérique sur un boulevard bordé de palmiers, de nuit",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${SITE.name} — ${SITE.tagline}`,
      description: SITE.description,
      images: [SITE.defaultOgImage],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#0a0b10",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" data-theme="dark" className={`${sora.variable} ${inter.variable}`}>
      <body>
        <a
          href="#contenu"
          className="sr-only rounded-control bg-brand-blue px-4 py-2.5 font-label text-sm font-semibold text-on-brand shadow-card focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-(--z-skip)"
        >
          Aller au contenu
        </a>
        {children}
      </body>
    </html>
  );
}
