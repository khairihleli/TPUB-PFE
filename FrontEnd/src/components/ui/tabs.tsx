"use client";

import { Tabs as RadixTabs } from "radix-ui";
import {
  type ComponentPropsWithoutRef,
  forwardRef,
  type MutableRefObject,
  type Ref,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { cx } from "@/lib/cx";

/** Radix Tabs root (controlled via value/onValueChange or uncontrolled via defaultValue). */
export const Tabs = RadixTabs.Root;

function setRefs<T>(value: T, ...refs: (Ref<T> | undefined)[]) {
  for (const ref of refs) {
    if (typeof ref === "function") ref(value);
    else if (ref && typeof ref === "object") (ref as MutableRefObject<T>).current = value;
  }
}

/**
 * Pill tab list with scroll-snap and an overflow fade on the side(s) that hide tabs (FFA-23).
 * The active tab is scrolled into view on mount and when it changes.
 */
export const TabsList = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof RadixTabs.List>>(
  function TabsList({ className, ...props }, ref) {
    const innerRef = useRef<HTMLDivElement | null>(null);
    const [overflow, setOverflow] = useState<{ start: boolean; end: boolean }>({
      start: false,
      end: false,
    });

    const measure = useCallback(() => {
      const el = innerRef.current;
      if (!el) return;
      const max = el.scrollWidth - el.clientWidth;
      const next = { start: el.scrollLeft > 2, end: max - el.scrollLeft > 2 };
      setOverflow((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
    }, []);

    useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      measure();
      const active = el.querySelector<HTMLElement>('[data-state="active"]');
      if (
        active &&
        el.scrollWidth > el.clientWidth &&
        typeof active.scrollIntoView === "function"
      ) {
        active.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      el.addEventListener("scroll", measure, { passive: true });
      let ro: ResizeObserver | null = null;
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(measure);
        ro.observe(el);
      }
      const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(measure) : null;
      mo?.observe(el, { attributes: true, subtree: true, attributeFilter: ["data-state"] });
      return () => {
        el.removeEventListener("scroll", measure);
        ro?.disconnect();
        mo?.disconnect();
      };
    }, [measure]);

    const mask =
      overflow.start && overflow.end
        ? "[mask-image:linear-gradient(90deg,transparent,#000_28px,#000_calc(100%-28px),transparent)]"
        : overflow.start
          ? "[mask-image:linear-gradient(90deg,transparent,#000_28px)]"
          : overflow.end
            ? "[mask-image:linear-gradient(90deg,#000_calc(100%-28px),transparent)]"
            : undefined;

    return (
      <RadixTabs.List
        ref={(node) => {
          innerRef.current = node;
          setRefs(node, ref);
        }}
        data-overflow-start={overflow.start || undefined}
        data-overflow-end={overflow.end || undefined}
        className={cx(
          "no-scrollbar relative -mx-1 flex max-w-full snap-x snap-proximity scroll-px-3 items-center gap-1 overflow-x-auto rounded-full border border-line bg-surface/70 p-1",
          mask,
          className,
        )}
        {...props}
      />
    );
  },
);

export interface TabsTriggerProps extends ComponentPropsWithoutRef<typeof RadixTabs.Trigger> {
  /** Optional counter shown after the label. */
  count?: number;
  icon?: ReactNode;
}

export const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(function TabsTrigger(
  { className, children, count, icon, ...props },
  ref,
) {
  return (
    <RadixTabs.Trigger
      ref={ref}
      className={cx(
        "group/tab inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-full px-4 font-label text-[0.8125rem] font-semibold whitespace-nowrap text-muted transition-colors duration-200 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-text data-[state=active]:bg-surface-3 data-[state=active]:text-ink-strong data-[state=active]:shadow-lift sm:min-h-10 [&_svg]:size-4",
        className,
      )}
      {...props}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
      {typeof count === "number" ? (
        <span className="rounded-full bg-overlay-strong px-1.5 py-px text-xs tabular text-muted group-data-[state=active]/tab:bg-orange-soft group-data-[state=active]/tab:text-brand-orange-text">
          {count}
        </span>
      ) : null}
    </RadixTabs.Trigger>
  );
});

export const TabsContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixTabs.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <RadixTabs.Content
      ref={ref}
      // No class merging here: a consumer margin (`mt-0` in a gap layout) replaces the default
      // instead of losing to it in the stylesheet order.
      className={cx(
        !/(^|\s)(max-\w+:|\w+:)?m[ty]?-/.test(className ?? "") && "mt-6",
        "focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
});
