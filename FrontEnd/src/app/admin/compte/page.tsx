import type { Metadata } from "next";

import { AccountView } from "@/components/account/account-view";

export const metadata: Metadata = {
  title: "Mon compte",
};

export default function Page() {
  return <AccountView />;
}
