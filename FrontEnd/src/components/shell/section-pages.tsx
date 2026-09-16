"use client";

/**
 * In-app 404 and error content (UX-PLAN §3.4, IA-01/IA-02/FLOW-13/FFA-14/VD-14/VD-23): rendered
 * inside the section layout so the shell never disappears.
 */
import {
  Gauge,
  LayoutDashboard,
  MapPinned,
  Megaphone,
  Search,
  SearchX,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { useBreadcrumbs, useDocumentTitle } from "@/components/shell/breadcrumbs";
import { useCommandPalette } from "@/components/shell/command-palette";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Kbd } from "@/components/ui/kbd";
import { PageHeader } from "@/components/ui/page-header";
import { routes } from "@/lib/routes";

export const NOT_FOUND_TITLE = "Page introuvable";
export const NOT_FOUND_DESCRIPTION = "Ce lien ne correspond à aucune page de votre espace.";

const EXITS = {
  espace: [
    { label: "Tableau de bord", href: routes.espace.home(), Icon: LayoutDashboard },
    { label: "Campagnes", href: routes.espace.campaigns(), Icon: Megaphone },
    { label: "Réseau & Studio 3D", href: routes.espace.network(), Icon: MapPinned },
  ],
  admin: [
    { label: "Vue d'ensemble", href: routes.admin.home(), Icon: Gauge },
    { label: "Modération", href: routes.admin.moderation(), Icon: ShieldCheck },
    { label: "Réseau", href: routes.admin.network(), Icon: MapPinned },
  ],
} as const;

export function SectionNotFound({ section }: { section: "espace" | "admin" }) {
  const { open } = useCommandPalette();
  useBreadcrumbs([{ label: NOT_FOUND_TITLE }]);
  useDocumentTitle(NOT_FOUND_TITLE, section === "admin" ? "Back-office" : "Espace annonceur");

  return (
    <>
      <PageHeader title={NOT_FOUND_TITLE} description={NOT_FOUND_DESCRIPTION} />
      <EmptyState
        icon={<SearchX />}
        title="Où voulez-vous aller ?"
        description="Choisissez une section ci-dessous ou recherchez une campagne, un Porteur ou une zone."
        action={
          <div className="flex flex-col items-center gap-3">
            <ul className="flex flex-wrap justify-center gap-2">
              {EXITS[section].map(({ label, href, Icon }) => (
                <li key={href}>
                  <Button asChild variant="secondary">
                    <Link href={href}>
                      <Icon aria-hidden="true" />
                      {label}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
            <Button variant="ghost" onClick={() => open()} iconLeft={<Search aria-hidden="true" />}>
              Rechercher
              <Kbd keys="mod+k" className="ml-1" />
            </Button>
          </div>
        }
      />
    </>
  );
}

export function SectionError({
  section,
  error,
  reset,
}: {
  section: "espace" | "admin";
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useBreadcrumbs([{ label: "Incident" }]);

  useEffect(() => {
    console.error(error);
  }, [error]);

  const home = section === "admin" ? routes.admin.home() : routes.espace.home();
  return (
    <>
      <PageHeader title="Un problème est survenu" description="Cette page n'a pas pu s'afficher." />
      <ErrorState
        error={error}
        title="La page n'a pas pu s'afficher"
        message="Réessayez. Si le problème persiste, revenez plus tard ou contactez TPUB avec la référence ci-dessous."
        onRetry={reset}
        backHref={home}
        backLabel={section === "admin" ? "Vue d'ensemble" : "Tableau de bord"}
        digest={error.digest}
      />
    </>
  );
}
