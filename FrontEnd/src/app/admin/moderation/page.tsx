import type { Metadata } from "next";

import { ModerationView } from "@/components/admin/moderation-view";

export const metadata: Metadata = {
  title: "Modération",
};

export default function Page() {
  return <ModerationView />;
}
