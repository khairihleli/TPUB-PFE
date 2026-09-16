import { cx } from "@/lib/cx";

export interface SectionTocProps {
  items: readonly { label: string; href: string }[];
  label?: string;
  className?: string;
}

/** In-page anchor nav pinned at the bottom of a hero (horizontal scroller on mobile). */
export function SectionToc({ items, label = "Sur cette page", className }: SectionTocProps) {
  return (
    <nav
      aria-label={label}
      className={cx("enter enter-4 border-t border-line bg-bg/40 backdrop-blur-md", className)}
    >
      <div className="container-site">
        {/* Right-edge fade on narrow screens signals that the list scrolls horizontally. */}
        <ol className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto py-3 pr-10 [mask-image:linear-gradient(90deg,black_calc(100%-48px),transparent)] md:pr-0 md:[mask-image:none]">
          {items.map((item, i) => (
            <li key={item.href} className="shrink-0">
              <a
                href={item.href}
                className="group/toc inline-flex min-h-touch items-center gap-2.5 rounded-full px-3.5 text-[0.875rem] text-muted transition-colors duration-200 hover:bg-white/5 hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text"
              >
                <span
                  aria-hidden="true"
                  className="font-label text-[0.6875rem] font-semibold text-brand-orange-text tabular"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                {item.label}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
