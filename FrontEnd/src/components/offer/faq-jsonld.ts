import type { FaqTheme } from "@/components/offer/faq-content";

interface FaqPageJsonLd {
  "@context": "https://schema.org";
  "@type": "FAQPage";
  inLanguage: "fr";
  mainEntity: {
    "@type": "Question";
    name: string;
    acceptedAnswer: { "@type": "Answer"; text: string };
  }[];
}

export function buildFaqJsonLd(themes: readonly FaqTheme[]): FaqPageJsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: "fr",
    mainEntity: themes.flatMap((theme) =>
      theme.entries.map((entry) => ({
        "@type": "Question" as const,
        name: entry.question,
        acceptedAnswer: { "@type": "Answer" as const, text: entry.answer },
      })),
    ),
  };
}

/**
 * JSON for a `<script type="application/ld+json">` text child. `<`, `>` and `&` are escaped as
 * unicode sequences so the payload can never close the script element.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
