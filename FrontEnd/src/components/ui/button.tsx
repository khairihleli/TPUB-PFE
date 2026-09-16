"use client";

import { Slot } from "radix-ui";
import {
  type ButtonHTMLAttributes,
  forwardRef,
  type MouseEvent,
  type ReactNode,
  useId,
} from "react";

import {
  type ButtonShape,
  type ButtonSize,
  buttonClasses,
  type ButtonVariant,
} from "@/components/ui/button-classes";
import { Spinner } from "@/components/ui/spinner";

export {
  buttonClasses,
  type ButtonShape,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui/button-classes";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * primary = blue (the one main action of a region) · secondary = surface + hairline ·
   * ghost = transparent · danger = destructive · link = inline text link.
   * brand / outline / glass = marketing only (forbidden in /espace and /admin).
   */
  variant?: ButtonVariant;
  /** sm keeps a 36px visual with a 44px hit area below sm. */
  size?: ButtonSize;
  /** "control" (default, 12px radius) · "pill" for chips/marketing · "rounded" legacy alias. */
  shape?: ButtonShape;
  /** Keeps the label (accessible name), adds a spinner, aria-busy, swallows clicks. */
  loading?: boolean;
  /** Screen-reader text announced while loading. */
  loadingLabel?: string;
  /**
   * Gate an action without removing it from the tab order (FFA-17): sets aria-disabled and an
   * accessible description with this reason; clicks call `onDisabledClick` instead of `onClick`.
   */
  disabledReason?: string | null;
  /** e.g. scroll to and highlight the blocking message. */
  onDisabledClick?: () => void;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  /** Allows long labels to wrap on narrow screens. */
  wrap?: boolean;
  /** Render the child element (e.g. next/link) with button styles. */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    shape = "control",
    loading = false,
    loadingLabel = "Chargement en cours",
    disabledReason,
    onDisabledClick,
    iconLeft,
    iconRight,
    fullWidth = false,
    wrap = false,
    asChild = false,
    className,
    children,
    type,
    onClick,
    ...rest
  },
  ref,
) {
  const reasonId = useId();
  const classes = buttonClasses({ variant, size, shape, fullWidth, wrap, className });

  if (asChild) {
    return (
      <Slot.Root ref={ref} className={classes} {...rest}>
        {children}
      </Slot.Root>
    );
  }

  const gated = Boolean(disabledReason);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (gated) {
      e.preventDefault();
      onDisabledClick?.();
      return;
    }
    onClick?.(e);
  };

  const describedBy =
    [rest["aria-describedby"], gated ? reasonId : null].filter(Boolean).join(" ") || undefined;

  return (
    <>
      <button
        ref={ref}
        type={type ?? "button"}
        className={classes}
        {...rest}
        aria-busy={loading || undefined}
        aria-disabled={loading || gated || rest["aria-disabled"] || undefined}
        aria-describedby={describedBy}
        data-disabled-reason={gated ? "" : undefined}
        title={rest.title ?? (gated ? (disabledReason ?? undefined) : undefined)}
        onClick={handleClick}
      >
        {loading ? <Spinner size="sm" /> : iconLeft}
        {children}
        {!loading && iconRight ? (
          <span
            aria-hidden="true"
            className="inline-flex transition-transform duration-200 ease-smooth group-hover/btn:translate-x-0.5"
          >
            {iconRight}
          </span>
        ) : null}
        {loading ? <span className="sr-only"> — {loadingLabel}</span> : null}
      </button>
      {gated ? (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      ) : null}
    </>
  );
});
