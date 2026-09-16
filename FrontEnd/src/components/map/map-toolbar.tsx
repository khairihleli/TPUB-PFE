"use client";

import { forwardRef, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";

import { cx } from "@/lib/cx";

export interface MapToolButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  /** Accessible name + tooltip text (French). */
  label: string;
  icon: ReactNode;
  /** Toggle state (aria-pressed). */
  active?: boolean;
  /** Keyboard shortcut shown in the tooltip, e.g. "M". */
  shortcut?: string;
  /** Small counter badge (e.g. active filters). */
  badge?: number;
  /** Tooltip side on desktop. */
  tooltipSide?: "left" | "right" | "bottom";
  /** Render the label next to the icon (mobile sheet). */
  showLabel?: boolean;
}

/** Square 44 px tool button with an accessible name and a CSS tooltip (works in fullscreen). */
export const MapToolButton = forwardRef<HTMLButtonElement, MapToolButtonProps>(
  function MapToolButton(
    {
      label,
      icon,
      active,
      shortcut,
      badge,
      tooltipSide = "left",
      showLabel = false,
      className,
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        aria-pressed={active}
        aria-keyshortcuts={shortcut}
        data-map-tool=""
        className={cx(
          "group/tool relative inline-flex min-h-touch cursor-pointer items-center gap-2.5 rounded-[12px] text-ink-soft transition-[background-color,color,box-shadow] duration-200 ease-smooth hover:bg-overlay-hover hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-blue-text disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:size-[1.15rem] [&_svg]:shrink-0",
          showLabel ? "w-full justify-start px-3 text-left" : "size-touch justify-center",
          active &&
            "bg-brand-blue/80 text-on-brand shadow-blue hover:bg-brand-blue hover:text-on-brand",
          className,
        )}
        {...props}
      >
        <span aria-hidden="true" className="contents">
          {icon}
        </span>
        {showLabel ? (
          <span aria-hidden="true" className="font-label text-[0.8125rem] font-semibold">
            {label}
          </span>
        ) : (
          <span
            aria-hidden="true"
            className={cx(
              "pointer-events-none absolute z-20 hidden rounded-[8px] border border-line-strong bg-surface-2 px-2 py-1 font-label text-[0.75rem] font-medium whitespace-nowrap text-ink-soft opacity-0 shadow-lift transition-opacity duration-150 group-hover/tool:opacity-100 group-focus-visible/tool:opacity-100 md:block",
              tooltipSide === "left" && "top-1/2 right-full mr-2.5 -translate-y-1/2",
              tooltipSide === "right" && "top-1/2 left-full ml-2.5 -translate-y-1/2",
              tooltipSide === "bottom" && "top-full left-1/2 mt-2 -translate-x-1/2",
            )}
          >
            {label}
            {shortcut ? (
              <kbd className="ml-2 rounded border border-line-strong px-1 font-sans text-[0.75rem] text-muted">
                {shortcut}
              </kbd>
            ) : null}
          </span>
        )}
        {badge ? (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-brand-orange px-1 font-label text-[0.75rem] leading-4 font-bold text-on-orange"
          >
            {badge}
          </span>
        ) : null}
      </button>
    );
  },
);

export interface MapToolbarProps {
  label: string;
  children: ReactNode;
  orientation?: "vertical" | "horizontal";
  /** No surface container (inside a panel). */
  bare?: boolean;
  className?: string;
}

/** Glass toolbar with arrow-key navigation between its tool buttons. */
export function MapToolbar({
  label,
  children,
  orientation = "vertical",
  bare = false,
  className,
}: MapToolbarProps) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
    const prev = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
    if (![next, prev, "Home", "End"].includes(e.key)) return;
    const buttons = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-map-tool]:not(:disabled)"),
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;
    e.preventDefault();
    const target =
      e.key === "Home"
        ? buttons[0]
        : e.key === "End"
          ? buttons[buttons.length - 1]
          : buttons[(index + (e.key === next ? 1 : -1) + buttons.length) % buttons.length];
    target?.focus();
  };

  return (
    <div
      role="toolbar"
      aria-label={label}
      aria-orientation={orientation}
      onKeyDown={onKeyDown}
      className={cx(
        bare ? "flex gap-0.5" : "tpub-map-surface flex gap-0.5 rounded-[16px] p-1",
        orientation === "vertical" ? "flex-col" : "flex-row flex-wrap",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Hairline separator between tool groups. */
export function MapToolDivider({
  orientation = "vertical",
}: {
  orientation?: "vertical" | "horizontal";
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "shrink-0 bg-line-strong",
        orientation === "vertical" ? "mx-2 my-0.5 h-px" : "mx-0.5 my-2 w-px",
      )}
    />
  );
}
