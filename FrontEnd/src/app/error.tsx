"use client";

import { RefreshCw, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="contenu" className="app-ground flex min-h-dvh flex-col">
      <div className="container-site flex h-(--header-h) items-center">
        <Logo href="/" subline />
      </div>
      <div className="container-narrow flex flex-1 flex-col items-start justify-center py-16">
        <p className="eyebrow">Incident</p>
        <h1 className="mt-5 font-display text-h1 text-ink-strong">
          Un problème est survenu <span className="text-gradient">de notre côté.</span>
        </h1>
        <p className="mt-5 max-w-[56ch] text-lead text-ink-soft">
          La page n&apos;a pas pu s&apos;afficher. Réessayez : si le problème persiste, rechargez la
          page ou revenez plus tard.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button
            variant="brand"
            size="lg"
            onClick={reset}
            iconLeft={<RefreshCw aria-hidden="true" />}
          >
            Réessayer
          </Button>
          <Button
            variant="glass"
            size="lg"
            onClick={() => window.location.reload()}
            iconLeft={<RotateCcw aria-hidden="true" />}
          >
            Recharger la page
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/">Accueil</Link>
          </Button>
        </div>
        {error.digest ? (
          <p className="mt-10 text-[0.8125rem] text-muted-2">
            Référence de l&apos;incident :{" "}
            <code className="font-mono text-muted">{error.digest}</code>
          </p>
        ) : null}
      </div>
    </main>
  );
}
