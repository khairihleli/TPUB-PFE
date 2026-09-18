import type { MetadataRoute } from "next";

import { MARKETING_ROUTES } from "@/content/nav";
import { siteUrl } from "@/content/site";

export const dynamic = "force-dynamic";

const LEGAL = new Set(["/mentions-legales", "/confidentialite", "/cgu", "/cookies"]);

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();
  return MARKETING_ROUTES.map((path) => ({
    url: `${base}${path === "/" ? "" : path}`,
    lastModified: now,
    changeFrequency: LEGAL.has(path) ? "yearly" : "monthly",
    priority: path === "/" ? 1 : LEGAL.has(path) ? 0.2 : 0.7,
  }));
}
