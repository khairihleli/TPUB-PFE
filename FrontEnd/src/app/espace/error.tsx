"use client";

import { SectionError } from "@/components/shell/section-pages";

/** Runtime error inside the espace shell: ErrorState, « Réessayer » (reset), section home, digest. */
export default function SectionErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SectionError section="espace" error={error} reset={reset} />;
}
