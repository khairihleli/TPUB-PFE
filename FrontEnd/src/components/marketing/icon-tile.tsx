import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export interface IconTileProps {
  icon: ReactNode;
  tone?: "orange" | "blue" | "red" | "success" | "neutral";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const TONE = {
  orange: "border-orange-line bg-orange-soft text-brand-orange-text",
  blue: "border-blue-line bg-blue-soft text-brand-blue-text",
  red: "border-red-line bg-red-soft text-brand-red-text",
  success: "border-success/30 bg-success/10 text-success",
  neutral: "border-line bg-surface-2 text-ink-soft",
} as const;

const SIZE = {
  sm: "size-9 rounded-[10px] [&_svg]:size-4.5",
  md: "size-11 rounded-control [&_svg]:size-5",
  lg: "size-14 rounded-card [&_svg]:size-6",
} as const;

/** Decorative tinted icon square (12% fill + 30% border recipe). */
export function IconTile({ icon, tone = "orange", size = "md", className }: IconTileProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 items-center justify-center border",
        TONE[tone],
        SIZE[size],
        className,
      )}
    >
      {icon}
    </span>
  );
}
