import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { SessionProvider } from "@/components/shell/session-provider";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Espace annonceur", template: "%s — Espace annonceur — ZELQANE" },
  robots: { index: false, follow: false },
};

/** Session gate (middleware already filters) + shell mounted once for every /espace page. */
export default async function EspaceLayout({ children }: { children: ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/connexion?next=/espace");
  if (user.role !== "ANNONCEUR") redirect("/admin?acces=reserve");

  return (
    <SessionProvider user={user}>
      <AppShell variant="espace">{children}</AppShell>
    </SessionProvider>
  );
}
