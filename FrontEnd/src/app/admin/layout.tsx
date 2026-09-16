import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { SessionProvider } from "@/components/shell/session-provider";
import { getSession, isStaffRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Back-office", template: "%s — Back-office — TPUB" },
  robots: { index: false, follow: false },
};

/** Staff gate (ADMINISTRATEUR | SUPERVISEUR | OPERATEUR) + admin shell. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/connexion?next=/admin");
  if (!isStaffRole(user.role)) redirect("/espace?acces=reserve");

  return (
    <SessionProvider user={user}>
      <AppShell variant="admin">{children}</AppShell>
    </SessionProvider>
  );
}
