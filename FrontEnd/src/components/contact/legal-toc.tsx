"use client";

import { useEffect, useState } from "react";

import { cx } from "@/lib/cx";

export interface LegalTocItem {
  id: string;
  title: string;
}

/** Table of contents with a light scroll-spy (no scroll hijacking, native anchors). */
export function LegalToc({ items }: { items: readonly LegalTocItem[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;
    const visible = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting);
        const first = items.find((i) => visible.get(i.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);

  return (
    <nav aria-label="Sommaire du document">
      <p className="font-label text-[0.75rem] font-semibold tracking-[0.18em] text-muted uppercase">
        Sommaire
      </p>
      <ol className="mt-4 grid grid-cols-1 gap-0.5 sm:grid-cols-2 lg:grid-cols-1">
        {items.map((item, i) => {
          const isActive = active === item.id;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={isActive ? "location" : undefined}
                className={cx(
                  "group/toc relative flex min-h-10 items-baseline gap-3 rounded-[10px] py-2 pr-2 pl-3 text-[0.875rem] leading-snug transition-colors duration-200 ease-smooth",
                  isActive ? "bg-white/5 text-ink-strong" : "text-muted hover:text-ink",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    "absolute top-2 bottom-2 left-0 w-[2px] rounded-full transition-colors",
                    isActive ? "bg-brand-orange" : "bg-transparent",
                  )}
                />
                <span
                  aria-hidden="true"
                  className={cx(
                    "font-label text-[0.6875rem] font-semibold tabular",
                    isActive ? "text-brand-orange-text" : "text-muted-2",
                  )}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{item.title}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
