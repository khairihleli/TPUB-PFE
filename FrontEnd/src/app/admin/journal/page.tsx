import type { Metadata } from "next";

import { JournalView } from "@/components/admin/journal-view";

export const metadata: Metadata = {
  title: "Journal",
};

export default function Page() {
  return <JournalView />;
}
