import type { Metadata } from "next";

import { AiQualityView } from "@/components/admin/ai-quality-view";

export const metadata: Metadata = {
  title: "Qualité de l'IA",
};

export default function Page() {
  return <AiQualityView />;
}
