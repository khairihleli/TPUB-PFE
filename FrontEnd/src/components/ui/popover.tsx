"use client";

import { Popover as RadixPopover } from "radix-ui";
import { type ComponentPropsWithoutRef, forwardRef } from "react";

import { cx } from "@/lib/cx";

/** Radix Popover root (`open`, `onOpenChange`, `modal`). */
export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverAnchor = RadixPopover.Anchor;
export const PopoverClose = RadixPopover.Close;

export type PopoverContentProps = ComponentPropsWithoutRef<typeof RadixPopover.Content>;

/** Opaque surface (no blur), portal, collision-aware, focus returns to the trigger on close. */
export const PopoverContent = forwardRef<HTMLDivElement, PopoverContentProps>(
  function PopoverContent({ className, sideOffset = 8, align = "start", ...props }, ref) {
    return (
      <RadixPopover.Portal>
        <RadixPopover.Content
          ref={ref}
          sideOffset={sideOffset}
          align={align}
          collisionPadding={12}
          className={cx(
            "z-(--z-modal) max-w-[calc(100vw-1.5rem)] animate-fade-in rounded-card border border-line-strong bg-surface-2 p-3 text-ink shadow-lift focus:outline-none",
            className,
          )}
          {...props}
        />
      </RadixPopover.Portal>
    );
  },
);
