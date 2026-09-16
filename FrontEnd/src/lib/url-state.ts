"use client";

/**
 * URL-synced list state (UX-PLAN §3.5, §11.5). History policy: **replace** for filters, search,
 * sort, tabs, map view; **push** for overlays that look like pages (`?porteur=`, `?examen=`).
 * Consumers must render under a <Suspense> boundary (useSearchParams).
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export interface ParamCodec<V> {
  /** Raw query value (null when absent) → typed value. Never throws. */
  parse(raw: string | null): V;
  /** Typed value → raw value; null removes the param (use for defaults). */
  serialize(value: V): string | null;
}

export type UrlSchema = Record<string, ParamCodec<unknown>>;
export type UrlStateOf<S extends UrlSchema> = {
  [K in keyof S]: S[K] extends ParamCodec<infer V> ? V : never;
};

export type HistoryMode = "replace" | "push";

/** Ready-made codecs. Defaults are omitted from the URL. */
export const param = {
  string(defaultValue = ""): ParamCodec<string> {
    return {
      parse: (raw) => (raw === null ? defaultValue : raw),
      serialize: (v) => (v === defaultValue || v === "" ? null : v),
    };
  },
  /** Positive integer ids (`?campagne=12`); anything else → null. */
  id(): ParamCodec<number | null> {
    return {
      parse: (raw) => {
        if (raw === null || !/^\d+$/.test(raw)) return null;
        const n = Number(raw);
        return Number.isSafeInteger(n) && n > 0 ? n : null;
      },
      serialize: (v) => (v === null ? null : String(v)),
    };
  },
  /** One of `values`; `legacy` maps old spellings; unknown → default. */
  enum<T extends string>(
    values: readonly T[],
    defaultValue: T,
    legacy: Readonly<Record<string, T>> = {},
  ): ParamCodec<T> {
    return {
      parse: (raw) => {
        if (raw !== null && (values as readonly string[]).includes(raw)) return raw as T;
        if (raw !== null && raw in legacy) return legacy[raw] as T;
        return defaultValue;
      },
      serialize: (v) => (v === defaultValue ? null : v),
    };
  },
  /** Optional enum (absent = null). */
  optionalEnum<T extends string>(values: readonly T[]): ParamCodec<T | null> {
    return {
      parse: (raw) =>
        raw !== null && (values as readonly string[]).includes(raw) ? (raw as T) : null,
      serialize: (v) => v,
    };
  },
  boolean(): ParamCodec<boolean> {
    return {
      parse: (raw) => raw === "1" || raw === "true",
      serialize: (v) => (v ? "1" : null),
    };
  },
} as const;

/** Pure: reads typed state from query params. */
export function readUrlState<S extends UrlSchema>(
  schema: S,
  params: URLSearchParams | { get(name: string): string | null },
): UrlStateOf<S> {
  const out: Record<string, unknown> = {};
  for (const [name, codec] of Object.entries(schema)) out[name] = codec.parse(params.get(name));
  return out as UrlStateOf<S>;
}

/** Pure: applies a partial update to a copy of `params` (other params are kept). */
export function writeUrlState<S extends UrlSchema>(
  schema: S,
  params: URLSearchParams,
  partial: Partial<UrlStateOf<S>>,
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const [name, value] of Object.entries(partial)) {
    const codec = schema[name];
    if (!codec) continue;
    const raw = codec.serialize(value);
    if (raw === null || raw === "") next.delete(name);
    else next.set(name, raw);
  }
  return next;
}

export function hrefWithParams(pathname: string, params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * `const [state, setState] = useUrlState({ statut: param.enum(VALUES, "toutes"), q: param.string() });`
 * `setState({ q: "marsa" })` replaces the URL; `setState({ examen: 3 }, { history: "push" })` pushes.
 */
export function useUrlState<S extends UrlSchema>(
  schema: S,
  opts: { history?: HistoryMode } = {},
): [UrlStateOf<S>, (partial: Partial<UrlStateOf<S>>, o?: { history?: HistoryMode }) => void] {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const defaultHistory = opts.history ?? "replace";

  // Schema objects are usually declared inline: key the memo on the query string only.
  const qs = searchParams?.toString() ?? "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const state = useMemo(() => readUrlState(schema, new URLSearchParams(qs)), [qs]);

  const setState = useCallback(
    (partial: Partial<UrlStateOf<S>>, o: { history?: HistoryMode } = {}) => {
      // Read the live URL so consecutive updates in one tick don't overwrite each other.
      const current =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams(qs);
      const next = writeUrlState(schema, current, partial);
      const href = hrefWithParams(pathname ?? "", next);
      if ((o.history ?? defaultHistory) === "push") router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname, router, defaultHistory, qs],
  );

  return [state, setState];
}

// ---------------------------------------------------------------------------
// Table sort (`?tri=colonne` asc, `?tri=-colonne` desc)
// ---------------------------------------------------------------------------

export type SortDirection = "asc" | "desc";
export interface SortState {
  key: string;
  dir: SortDirection;
}

export function parseSortParam(
  raw: string | null | undefined,
  allowedKeys?: readonly string[],
): SortState | null {
  if (!raw) return null;
  const desc = raw.startsWith("-");
  const key = desc ? raw.slice(1) : raw;
  if (!key || !/^[a-z0-9-]+$/i.test(key)) return null;
  if (allowedKeys && !allowedKeys.includes(key)) return null;
  return { key, dir: desc ? "desc" : "asc" };
}

export function serializeSort(sort: SortState | null): string | null {
  if (!sort) return null;
  return sort.dir === "desc" ? `-${sort.key}` : sort.key;
}

/** Header click: same key toggles asc ↔ desc, a new key starts ascending. */
export function nextSort(current: SortState | null, key: string): SortState {
  if (current && current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: "asc" };
}

export interface TableSortOptions {
  /** Sort applied when the param is absent (not written to the URL). */
  defaultSort?: SortState;
  allowedKeys?: readonly string[];
}

/**
 * `const { sort, setSort } = useTableSort("tri", { defaultSort: { key: "debut", dir: "asc" } });`
 * then `<DataTable sort={sort} onSortChange={setSort} … />`. Uses replace history.
 */
export function useTableSort(
  paramName = "tri",
  { defaultSort, allowedKeys }: TableSortOptions = {},
): { sort: SortState | null; setSort: (sort: SortState | null) => void; isDefault: boolean } {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const raw = searchParams?.get(paramName) ?? null;
  const parsed = parseSortParam(raw, allowedKeys);
  const sort = parsed ?? defaultSort ?? null;

  const setSort = useCallback(
    (next: SortState | null) => {
      const params =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams(searchParams?.toString() ?? "");
      const isDefaultValue =
        next !== null &&
        defaultSort !== undefined &&
        next.key === defaultSort.key &&
        next.dir === defaultSort.dir;
      const value = isDefaultValue ? null : serializeSort(next);
      if (value === null) params.delete(paramName);
      else params.set(paramName, value);
      router.replace(hrefWithParams(pathname ?? "", params), { scroll: false });
    },
    [defaultSort, paramName, pathname, router, searchParams],
  );

  return { sort, setSort, isDefault: parsed === null };
}
