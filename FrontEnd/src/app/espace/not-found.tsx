import type { Metadata } from "next";

import { SectionNotFound } from "@/components/shell/section-pages";

export const metadata: Metadata = {
  title: "Page introuvable",
};

/** In-app 404: sidebar + h1 « Page introuvable » + 3 exits + search (UX-PLAN §3.4). */
export default function NotFound() {
  return <SectionNotFound section="espace" />;
}
