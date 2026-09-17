import type { Metadata } from "next";

import { AiRulesView } from "@/components/admin/ai-rules-view";

export const metadata: Metadata = {
  title: "Règles IA",
};

export default function Page() {
  return <AiRulesView />;
}
