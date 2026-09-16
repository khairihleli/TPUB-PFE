import type { Metadata } from "next";

import { ProfileView } from "@/components/espace/profile-view";

export const metadata: Metadata = {
  title: "Profil",
};

export default function Page() {
  return <ProfileView />;
}
