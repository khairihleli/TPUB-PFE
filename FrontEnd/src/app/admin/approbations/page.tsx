import type { Metadata } from "next";

import { ApprovalsView } from "@/components/approvals/approvals-view";

export const metadata: Metadata = {
  title: "Approbations",
};

export default function Page() {
  return <ApprovalsView />;
}
