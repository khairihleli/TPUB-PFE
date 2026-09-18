"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { useToast } from "@/components/ui/toast";

/** Query flag added by middleware/layouts when a role opens the other section (IA-24). */
export const ACCESS_PARAM = "acces";
export const ACCESS_RESERVED = "reserve";

export function accessNoticeMessage(variant: "espace" | "admin"): string {
  // The user landed in their own section after trying the other one.
  return variant === "espace"
    ? "Cette section est réservée à l'équipe ZELQANE."
    : "Cette section est réservée aux comptes annonceurs.";
}

/** Shows the info toast once, then strips `?acces=reserve` with replaceState. */
export function AccessNotice({ variant }: { variant: "espace" | "admin" }) {
  const { toast } = useToast();
  const pathname = usePathname();

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get(ACCESS_PARAM) !== ACCESS_RESERVED) return;
    toast({ title: accessNoticeMessage(variant), variant: "info" });
    url.searchParams.delete(ACCESS_PARAM);
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [pathname, toast, variant]);

  return null;
}
