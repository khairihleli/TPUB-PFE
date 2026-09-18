"use client";

import { type ReactNode, useSyncExternalStore } from "react";

import { cx } from "@/lib/cx";
import { isApplePlatform, keyLabels, keysAriaLabel } from "@/lib/shortcuts";

export interface KbdProps {
  /** Shortcut string ("mod+k", "g d", "shift+?"). Rendered with platform-aware labels. */
  keys?: string;
  /** Free content instead of `keys` (e.g. « Entrée »). */
  children?: ReactNode;
  /** "auto" detects Apple after hydration (server renders « Ctrl »). */
  platform?: "auto" | "apple" | "other";
  size?: "sm" | "md";
  className?: string;
}

const noopSubscribe = () => () => undefined;

function usePlatformApple(platform: KbdProps["platform"]): boolean {
  const detected = useSyncExternalStore(noopSubscribe, isApplePlatform, () => false);
  if (platform === "apple") return true;
  if (platform === "other") return false;
  return detected;
}

const KEY_CLASS =
  "inline-flex min-w-[1.6em] items-center justify-center rounded-[6px] border border-line-strong border-b-2 bg-surface-2 px-1.5 font-label font-semibold text-ink-soft tabular";

/** `<Kbd keys="mod+k" />` → « ⌘ K » on Apple, « Ctrl K » elsewhere. Sequences read « G puis D ». */
export function Kbd({ keys, children, platform = "auto", size = "sm", className }: KbdProps) {
  const apple = usePlatformApple(platform);
  const sizeClass = size === "sm" ? "h-5 text-xs" : "h-6 text-[0.8125rem]";

  if (!keys) {
    return <kbd className={cx(KEY_CLASS, sizeClass, className)}>{children}</kbd>;
  }

  const strokes = keyLabels(keys, apple);
  return (
    <span className={cx("inline-flex items-center gap-1", className)}>
      <span className="sr-only">{keysAriaLabel(keys, apple)}</span>
      <span aria-hidden="true" className="inline-flex items-center gap-1">
        {strokes.map((stroke, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            {i > 0 ? <span className="text-xs text-muted">puis</span> : null}
            {stroke.map((label, j) => (
              <kbd key={j} className={cx(KEY_CLASS, sizeClass)}>
                {label}
              </kbd>
            ))}
          </span>
        ))}
      </span>
    </span>
  );
}
