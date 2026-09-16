import type { ComponentPropsWithoutRef, ElementType } from "react";

type VisuallyHiddenProps<T extends ElementType> = {
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, "as">;

/** Content for assistive technologies only. Becomes visible when focused if focusable. */
export function VisuallyHidden<T extends ElementType = "span">({
  as,
  className,
  ...rest
}: VisuallyHiddenProps<T>) {
  const Tag: ElementType = as ?? "span";
  return <Tag className={className ? `sr-only ${String(className)}` : "sr-only"} {...rest} />;
}
