"use client";

import { SectionError } from "@/components/shell/section-pages";

/** Runtime error inside the admin shell: ErrorState, « Réessayer » (reset), section home, digest. */
export default function SectionErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <SectionError section="admin" error={error} reset={reset} />;
}
