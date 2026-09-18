"use client";

import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ElementType,
  type ReactNode,
  useEffect,
  useRef,
} from "react";

import { cx } from "@/lib/cx";

export type RevealVariant = "up" | "left" | "right" | "zoom" | "blur" | "fade";

export type RevealProps<T extends ElementType = "div"> = {
  as?: T;
  variant?: RevealVariant;
  /** Animate direct children one after another (70 ms step) instead of the block. */
  stagger?: boolean;
  /** Delay in ms (block mode). */
  delay?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children" | "style">;

/**
 * Reveal-on-scroll. Server HTML is fully visible without JS; CSS hides it only when
 * scripting is enabled, and reduced motion always shows it (see globals.css).
 * IntersectionObserver threshold 0 + rootMargin -10% bottom, reveals once.
 */
export function Reveal<T extends ElementType = "div">({
  as,
  variant = "up",
  stagger = false,
  delay,
  className,
  style,
  children,
  ...rest
}: RevealProps<T>) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (!root.hasAttribute("data-reveal-ready")) root.setAttribute("data-reveal-ready", "");

    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.setAttribute("data-in", "");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-in", "");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0, rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Tag: ElementType = as ?? "div";
  return (
    <Tag
      ref={ref}
      data-variant={variant}
      className={cx(stagger ? "reveal-stagger" : "reveal", className)}
      style={delay ? { ...style, ["--reveal-delay" as string]: `${delay}ms` } : style}
      {...rest}
    >
      {children}
    </Tag>
  );
}
