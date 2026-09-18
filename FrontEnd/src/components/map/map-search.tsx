"use client";

import { CircleDashed, Search, X } from "lucide-react";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import type { SupportResponse, ZoneResponse } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { searchNetwork, type SearchResult } from "@/lib/network/filters";
import { PORTEUR_TYPES } from "@/lib/network/porteur";

import { TONE_BG_SOFT, TONE_TEXT } from "@/components/map/porteur-visuals";

export interface MapSearchProps {
  zones: ZoneResponse[];
  supports: SupportResponse[];
  onSelect: (result: SearchResult) => void;
  className?: string;
  placeholder?: string;
}

/** WAI-ARIA combobox (list autocomplete) over zones and Porteurs. */
export function MapSearch({
  zones,
  supports,
  onSelect,
  className,
  placeholder = "Zone, Porteur, adresse…",
}: MapSearchProps) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const results = useMemo(() => searchNetwork(query, zones, supports, 8), [query, zones, supports]);
  const expanded = open && query.trim().length > 0;

  const choose = (result: SearchResult | undefined) => {
    if (!result) return;
    onSelect(result);
    setQuery(result.label);
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setOpen(true);
        setActiveIndex((i) => (results.length === 0 ? -1 : (i + 1) % results.length));
        break;
      case "ArrowUp":
        e.preventDefault();
        setOpen(true);
        setActiveIndex((i) => (results.length === 0 ? -1 : i <= 0 ? results.length - 1 : i - 1));
        break;
      case "Enter":
        if (expanded) {
          e.preventDefault();
          choose(results[activeIndex >= 0 ? activeIndex : 0]);
        }
        break;
      case "Escape":
        if (expanded || query) {
          e.preventDefault();
          e.stopPropagation();
          if (expanded) setOpen(false);
          else setQuery("");
          setActiveIndex(-1);
        }
        break;
      default:
        break;
    }
  };

  return (
    <div className={cx("relative", className)}>
      <div className="zelqane-map-surface flex h-11 items-center gap-2 rounded-[14px] pr-1 pl-3 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-brand-blue-text">
        <Search aria-hidden="true" className="size-4 shrink-0 text-muted" />
        <label htmlFor={`${id}-input`} className="sr-only">
          Rechercher sur la carte
        </label>
        <input
          ref={inputRef}
          id={`${id}-input`}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={
            expanded && activeIndex >= 0 ? `${id}-opt-${activeIndex}` : undefined
          }
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-2 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            aria-label="Effacer la recherche"
            onClick={() => {
              setQuery("");
              setActiveIndex(-1);
              inputRef.current?.focus();
            }}
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted hover:bg-overlay-hover hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-brand-blue-text"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>

      <ul
        id={listId}
        role="listbox"
        aria-label="Résultats de recherche"
        hidden={!expanded}
        className="zelqane-map-surface absolute inset-x-0 top-full z-40 mt-1.5 max-h-80 overflow-y-auto rounded-card p-1"
      >
        {results.length === 0 ? (
          <li role="presentation" className="px-3 py-3 text-xs text-muted">
            Aucun résultat pour « {query.trim()} »
          </li>
        ) : (
          results.map((r, i) => {
            const tone = r.kind === "support" ? PORTEUR_TYPES[r.type].tone : null;
            return (
              <li
                key={`${r.kind}-${r.id}`}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                // mousedown keeps focus in the input (blur would close the list before click)
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(r);
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={cx(
                  "flex min-h-touch cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-2",
                  i === activeIndex ? "bg-brand-blue/30" : "hover:bg-overlay-hover",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    "grid size-7 shrink-0 place-items-center rounded-full border font-display text-xs font-bold",
                    tone
                      ? cx(TONE_BG_SOFT[tone], TONE_TEXT[tone])
                      : "border-orange-line bg-orange-soft text-brand-orange-text",
                  )}
                >
                  {r.kind === "support" ? r.type : <CircleDashed className="size-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink">{r.label}</span>
                  <span className="block truncate text-[0.75rem] text-muted">{r.detail}</span>
                </span>
              </li>
            );
          })
        )}
      </ul>
      <p className="sr-only" aria-live="polite">
        {expanded
          ? results.length === 0
            ? "Aucun résultat"
            : `${results.length} résultat${results.length > 1 ? "s" : ""}`
          : ""}
      </p>
    </div>
  );
}
