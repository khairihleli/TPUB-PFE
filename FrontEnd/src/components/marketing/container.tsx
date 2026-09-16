import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

import { cx } from "@/lib/cx";

export type ContainerSize = "default" | "narrow" | "wide" | "full";

export type ContainerProps<T extends ElementType = "div"> = {
  as?: T;
  /** default 1240px · narrow 820px · wide 1440px · full = gutters only */
  size?: ContainerSize;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

const SIZE: Record<ContainerSize, string> = {
  default: "container-site",
  narrow: "container-narrow",
  wide: "mx-auto w-full max-w-[1440px] px-[clamp(16px,3.6vw,56px)]",
  full: "w-full px-[clamp(16px,3.6vw,56px)]",
};

export function Container<T extends ElementType = "div">({
  as,
  size = "default",
  className,
  children,
  ...rest
}: ContainerProps<T>) {
  const Tag: ElementType = as ?? "div";
  return (
    <Tag className={cx(SIZE[size], className)} {...rest}>
      {children}
    </Tag>
  );
}
