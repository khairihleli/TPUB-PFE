/**
 * Terms that usually trigger a manual review (FLOW-05). Used as a live, non-blocking hint under
 * the campaign objective. Accent/case-insensitive, with word forms.
 */

export interface ReviewTrigger {
  /** Canonical term: « gratuit » or « garanti ». */
  term: string;
  /** The text as typed (« Gratuite »). */
  match: string;
  /** Index in the original text. */
  index: number;
}

const RULES: readonly { term: string; pattern: RegExp }[] = [
  { term: "gratuit", pattern: /gratuit(?:es|e|s)?/giu },
  { term: "garanti", pattern: /garanti(?:es|e|s)?/giu },
];

const WORD = /[\p{L}\p{N}]/u;

/** Accent-stripped copy with the SAME length (so indexes map back to the original). */
function fold(text: string): string {
  let out = "";
  for (const ch of text) {
    const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    out += base.length === ch.length ? base : ch;
  }
  return out;
}

/** `detectReviewTriggers("Entrée GRATUITE")` → [{ term: "gratuit", match: "GRATUITE", index: 7 }]. */
export function detectReviewTriggers(text: string | null | undefined): ReviewTrigger[] {
  if (!text) return [];
  const folded = fold(text);
  const found: ReviewTrigger[] = [];
  for (const { term, pattern } of RULES) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(folded)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      const before = start > 0 ? folded[start - 1] : "";
      const after = end < folded.length ? folded[end] : "";
      // Whole words only: « garantie » yes, « garantissons » / « ingratuit » no.
      if ((before && WORD.test(before)) || (after && WORD.test(after))) continue;
      found.push({ term, match: text.slice(start, end), index: start });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/** Distinct canonical terms, in order of first appearance. */
export function reviewTriggerTerms(text: string | null | undefined): string[] {
  return [...new Set(detectReviewTriggers(text).map((t) => t.term))];
}

/** French hint shown under the objective for the first detected term. */
export function reviewTriggerHint(term: string): string {
  if (term === "gratuit") {
    return "Le terme « gratuit » déclenche généralement un examen manuel ; précisez la condition (ex. « entrée gratuite pour les moins de 12 ans »).";
  }
  return `Le terme « ${term} » déclenche généralement un examen manuel ; précisez ce qui est garanti et à quelles conditions.`;
}
