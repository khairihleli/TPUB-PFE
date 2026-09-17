import type { Metadata } from "next";

import { UsersView } from "@/components/admin/users-view";

export const metadata: Metadata = {
  title: "Utilisateurs",
};

export default function Page() {
  return <UsersView />;
}
