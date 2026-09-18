import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { default: "Écran de diffusion", template: "%s — ZELQANE" },
  robots: { index: false, follow: false },
};

/** Bare full-screen player: no header, no footer, black ground. */
export default function EcranLayout({ children }: { children: ReactNode }) {
  return (
    <main id="contenu" className="relative min-h-dvh overflow-hidden bg-black text-ink">
      {children}
    </main>
  );
}
