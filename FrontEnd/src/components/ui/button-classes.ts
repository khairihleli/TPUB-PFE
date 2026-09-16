/**
 * Button class builder. Kept out of the "use client" button module so server components
 * (e.g. a styled <Link>) can call it during prerender.
 *
 * Ladder (UX-PLAN §4.7): primary (one per region) · secondary · ghost/link · danger (inside a
 * destructive confirmation or overflow menus). `brand`, `outline` and `glass` are marketing-only.
 */
import { cx } from "@/lib/cx";

export type ButtonVariant =
  "brand" | "primary" | "secondary" | "ghost" | "danger" | "link" | "glass" | "outline";
export type ButtonSize = "sm" | "md" | "lg";
/** "control" = 12px radius (app default) · "pill" = fully rounded (chips, marketing). "rounded" = legacy alias of control. */
export type ButtonShape = "control" | "rounded" | "pill";

export interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  fullWidth?: boolean;
  /** Allows long labels to wrap on narrow screens (default: single line). */
  wrap?: boolean;
  className?: string;
}

const BASE =
  "group/btn relative inline-flex select-none items-center justify-center gap-2 font-label font-semibold leading-none tracking-[0.005em] transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-200 ease-smooth focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue-text disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed data-[disabled-reason]:opacity-55 data-[disabled-reason]:hover:translate-y-0 [&_svg]:size-[1.1em] [&_svg]:shrink-0";

const VARIANT: Record<ButtonVariant, string> = {
  brand:
    "btn-sheen bg-grad-brand text-on-brand shadow-brand hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:brightness-95",
  primary:
    "bg-brand-blue text-on-brand shadow-blue hover:-translate-y-0.5 hover:bg-brand-blue-600 active:translate-y-0",
  secondary:
    "border border-line-strong bg-surface-2 text-ink hover:border-muted-2 hover:bg-surface-3 active:bg-surface-2",
  ghost: "text-ink-soft hover:bg-overlay-hover hover:text-ink-strong active:bg-overlay-strong",
  danger:
    "border border-danger/40 bg-danger/10 text-danger hover:border-danger/70 hover:bg-danger/18 active:bg-danger/25",
  link: "h-auto! min-h-0! px-0! text-brand-blue-text underline-offset-4 hover:underline",
  glass:
    "glass-light text-ink-strong hover:-translate-y-0.5 hover:border-line-strong hover:bg-overlay-strong",
  outline:
    "border border-orange-line bg-orange-soft text-brand-orange-text hover:border-brand-orange hover:bg-brand-orange hover:text-on-orange",
};

const SIZE: Record<ButtonSize, string> = {
  /** 36px visual, 44px hit area below sm (FFA-18). */
  sm: "hit-area min-h-9 px-3.5 text-[0.8125rem]",
  md: "min-h-touch px-5 text-[0.875rem]",
  lg: "min-h-13 px-7 text-[0.9375rem]",
};

export function buttonClasses({
  variant = "secondary",
  size = "md",
  shape = "control",
  fullWidth = false,
  wrap = false,
  className,
}: ButtonClassOptions): string {
  return cx(
    BASE,
    wrap ? "py-2.5 text-center leading-snug whitespace-normal" : "whitespace-nowrap",
    VARIANT[variant],
    SIZE[size],
    variant !== "link" && (shape === "pill" ? "rounded-full" : "rounded-control"),
    fullWidth && "w-full",
    className,
  );
}
