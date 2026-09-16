import type { Metadata } from "next";

import { EmergencyView } from "@/components/admin/emergency-view";

export const metadata: Metadata = {
  title: "Messages prioritaires",
};

export default function Page() {
  return <EmergencyView />;
}
