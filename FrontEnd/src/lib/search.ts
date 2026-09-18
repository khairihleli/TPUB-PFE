/**
 * Client-side search helpers (command palette, list filters). No backend search is claimed
 * (api-contract §7.10): everything filters already-loaded data.
 */

/** Lowercase, accents stripped, apostrophes unified, spaces collapsed: « Été » matches « ete ». */
export function normalizeSearch(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Match quality: 3 prefix · 2 word start · 1 substring · 0 no match. */
export function matchScore(text: string, query: string): number {
  const q = normalizeSearch(query);
  if (!q) return 1;
  const t = normalizeSearch(text);
  if (!t) return 0;
  if (t.startsWith(q)) return 3;
  if (t.split(/[\s'’\-–—·/,.()#]+/).some((w) => w.startsWith(q))) return 2;
  return t.includes(q) ? 1 : 0;
}

export interface Searchable {
  label: string;
  keywords?: readonly string[];
}

/** Best score over label (full weight) and keywords (never above word-start). */
export function scoreItem(item: Searchable, query: string): number {
  let best = matchScore(item.label, query);
  for (const k of item.keywords ?? []) best = Math.max(best, Math.min(2, matchScore(k, query)));
  return best;
}

/**
 * Filters and ranks: prefix, then word start, then substring; stable within a rank.
 * Empty query → the first `limit` items unchanged.
 */
export function rankItems<T extends Searchable>(
  items: readonly T[],
  query: string,
  limit = 8,
): T[] {
  if (!normalizeSearch(query)) return items.slice(0, limit);
  return items
    .map((item, index) => ({ item, index, score: scoreItem(item, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.item);
}
