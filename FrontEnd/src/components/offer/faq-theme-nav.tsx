"use client";

import { useEffect, useRef, useState } from "react";

import { cx } from "@/lib/cx";

export interface FaqThemeLink {
  id: string;
  title: string;
  count: number;
}

export interface FaqThemeNavProps {
  themes: readonly FaqThemeLink[];
  className?: string;
}

/**
 * In-page index of the FAQ themes. Plain anchor links (work without JS); after mount a
 * scroll-spy marks the theme currently read with aria-current="location" and, on phones where
 * the index is a horizontal chip row, brings the active chip into view.
 */
export function FaqThemeNav({ themes, className }: FaqThemeNavProps) {
  const [active, setActive] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections = themes
      .map((t) => document.getElementById(t.id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const visible = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = themes.find((t) => visible.has(t.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: 0 },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [themes]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || !active || list.scrollWidth <= list.clientWidth) return;
    const chip = list.querySelector<HTMLElement>(`a[href="#${active}"]`)?.parentElement;
    if (!chip) return;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Horizontal only: scrollIntoView would also move the page vertically.
    const left = chip.offsetLeft - (list.clientWidth - chip.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(0, left), behavior: reduce ? "auto" : "smooth" });
  }, [active]);

  return (
    <nav aria-label="Thèmes de la FAQ" className={className}>
      <ol
        ref={listRef}
        className="no-scrollbar relative -mx-[clamp(16px,3.6vw,56px)] flex gap-2 overflow-x-auto px-[clamp(16px,3.6vw,56px)] lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0"
      >
        {themes.map((theme, i) => {
          const isActive = active === theme.id;
          return (
            <li key={theme.id} className="shrink-0">
              <a
                href={`#${theme.id}`}
                aria-current={isActive ? "location" : undefined}
                className={cx(
                  "group/theme relative flex min-h-touch items-center gap-3 rounded-full border px-4 py-2 text-[0.875rem] whitespace-nowrap transition-[border-color,background-color,color] duration-200 ease-smooth",
                  "lg:rounded-control lg:border-transparent lg:px-4 lg:py-2.5 lg:whitespace-normal",
                  isActive
                    ? "border-orange-line bg-orange-soft text-ink-strong lg:border-orange-line"
                    : "border-line-strong text-ink-soft hover:border-muted-2 hover:text-ink-strong lg:hover:border-line lg:hover:bg-white/[0.03]",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    "font-label text-[0.6875rem] font-semibold tracking-[0.16em] tabular",
                    isActive ? "text-brand-orange-text" : "text-muted-2",
                  )}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-label font-semibold lg:flex-1">{theme.title}</span>
                <span className="text-xs text-muted-2 tabular">
                  {theme.count}
                  <span className="sr-only"> questions</span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
