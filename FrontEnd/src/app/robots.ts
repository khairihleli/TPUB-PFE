import type { MetadataRoute } from "next";

import { siteUrl } from "@/content/site";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/espace",
          "/admin",
          "/ecran",
          "/api/",
          "/connexion",
          "/inscription",
          "/mot-de-passe-oublie",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
