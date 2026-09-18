"use client";

import { Info } from "lucide-react";
import { Tooltip as RadixTooltip } from "radix-ui";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

/** Hover/focus tooltip. The trigger child must be focusable (button, link). */
export function Tooltip({ content, children, side = "top", className }: TooltipProps) {
  return (
    <RadixTooltip.Provider delayDuration={200}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={6}
            className={cx(
              "z-(--z-toast) max-w-xs animate-fade-in rounded-[10px] border border-line-strong bg-surface-2 px-3 py-2 text-[0.8125rem] leading-snug text-ink-soft shadow-lift",
              className,
            )}
          >
            {content}
            <RadixTooltip.Arrow className="fill-surface-2" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}

/** Small « i » button with a tooltip, e.g. next to « Estimation indicative ». */
export function InfoTip({ label, content }: { label: string; content: ReactNode }) {
  return (
    <Tooltip content={content}>
      <button
        type="button"
        aria-label={label}
        className="inline-flex size-6 items-center justify-center rounded-full text-muted transition-colors hover:text-ink focus-visible:text-ink"
      >
        <Info aria-hidden="true" className="size-3.5" />
      </button>
    </Tooltip>
  );
}
