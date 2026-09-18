import type { Metadata } from "next";

import { NetworkAdminView } from "@/components/admin/network-admin-view";
import { networkPageState } from "@/components/admin/network-map-model";

export const metadata: Metadata = {
  title: "Réseau",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { onglet, vue, porteur, panneau } = await searchParams;
  const state = networkPageState({ onglet, vue, porteur, panneau });
  return (
    <NetworkAdminView
      initialTab={state.tab}
      initialView={state.view}
      initialSupportId={state.supportId}
      initialPanel={state.panel}
    />
  );
}
