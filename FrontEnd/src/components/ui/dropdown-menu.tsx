"use client";

import Link from "next/link";
import { DropdownMenu as RadixMenu } from "radix-ui";
import { type ComponentPropsWithoutRef, forwardRef, type ReactNode } from "react";

import { cx } from "@/lib/cx";

/** One entry of an overflow/account/help menu (UX-PLAN §11.2). */
export interface MenuAction {
  label: string;
  /** Called on select (keyboard or pointer). */
  onSelect?: () => void;
  /** Internal link (next/link) or external URL (with `external`). */
  href?: string;
  /** Opens in a new tab with rel="noopener noreferrer". */
  external?: boolean;
  icon?: ReactNode;
  /** Destructive items are always rendered last, after a separator. */
  tone?: "danger";
  disabled?: boolean;
  /** Short secondary line. */
  description?: string;
}

export const DropdownMenuRoot = RadixMenu.Root;
export const DropdownMenuTrigger = RadixMenu.Trigger;
export const DropdownMenuGroup = RadixMenu.Group;

export const DropdownMenuContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixMenu.Content>
>(function DropdownMenuContent(
  { className, sideOffset = 6, align = "end", onCloseAutoFocus, ...props },
  ref,
) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        collisionPadding={12}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          // An item that opened a dialog (« Supprimer », « Dupliquer ») must not pull focus back
          // to the « … » trigger: the dialog's focus trap would bounce it onto its close icon
          // instead of the safe initial target the dialog chose.
          if (
            !event.defaultPrevented &&
            document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"]')
          ) {
            event.preventDefault();
          }
        }}
        className={cx(
          "z-(--z-modal) min-w-[220px] max-w-[calc(100vw-1.5rem)] animate-fade-in rounded-card border border-line-strong bg-surface-2 p-1.5 shadow-lift focus:outline-none",
          className,
        )}
        {...props}
      />
    </RadixMenu.Portal>
  );
});

export const MENU_ITEM_CLASS =
  "flex min-h-11 w-full cursor-pointer select-none items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm text-ink-soft outline-none transition-colors data-[highlighted]:bg-overlay-hover data-[highlighted]:text-ink-strong data-[disabled]:pointer-events-none data-[disabled]:opacity-50 sm:min-h-10 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted";

export const DropdownMenuItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixMenu.Item> & { tone?: "danger" }
>(function DropdownMenuItem({ className, tone, ...props }, ref) {
  return (
    <RadixMenu.Item
      ref={ref}
      className={cx(
        MENU_ITEM_CLASS,
        tone === "danger" &&
          "text-danger data-[highlighted]:bg-danger/12 data-[highlighted]:text-danger [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
});

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <RadixMenu.Separator className={cx("my-1 h-px bg-line", className)} />;
}

export function DropdownMenuLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <RadixMenu.Label className={cx("px-3 pt-2 pb-1 text-xs font-medium text-muted", className)}>
      {children}
    </RadixMenu.Label>
  );
}

/** Non-destructive items first, destructive items last (stable order otherwise). */
export function orderMenuActions(items: readonly MenuAction[]): {
  regular: MenuAction[];
  danger: MenuAction[];
} {
  return {
    regular: items.filter((i) => i.tone !== "danger"),
    danger: items.filter((i) => i.tone === "danger"),
  };
}

function ActionItem({ item }: { item: MenuAction }) {
  const content = (
    <>
      {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block">{item.label}</span>
        {item.description ? (
          <span className="block text-xs text-muted">{item.description}</span>
        ) : null}
      </span>
    </>
  );
  if (item.href) {
    return (
      <DropdownMenuItem asChild tone={item.tone} disabled={item.disabled} onSelect={item.onSelect}>
        {item.external ? (
          <a href={item.href} target="_blank" rel="noopener noreferrer">
            {content}
            <span className="sr-only"> (nouvel onglet)</span>
          </a>
        ) : (
          <Link href={item.href}>{content}</Link>
        )}
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem tone={item.tone} disabled={item.disabled} onSelect={item.onSelect}>
      {content}
    </DropdownMenuItem>
  );
}

export interface DropdownMenuProps {
  /** A focusable element (usually <Button> or an icon button); rendered with asChild. */
  trigger: ReactNode;
  items: readonly MenuAction[];
  align?: "start" | "center" | "end";
  /** Optional heading inside the menu. */
  label?: ReactNode;
  /** Extra content above the items (e.g. account identity). */
  header?: ReactNode;
  contentClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * `<DropdownMenu trigger={<Button variant="ghost" aria-label="Plus d'actions">…</Button>}
 *   items={[{ label: "Dupliquer", onSelect }, { label: "Supprimer", tone: "danger", onSelect }]} />`
 */
export function DropdownMenu({
  trigger,
  items,
  align = "end",
  label,
  header,
  contentClassName,
  open,
  onOpenChange,
}: DropdownMenuProps) {
  const { regular, danger } = orderMenuActions(items);
  return (
    <RadixMenu.Root open={open} onOpenChange={onOpenChange}>
      <RadixMenu.Trigger asChild>{trigger}</RadixMenu.Trigger>
      <DropdownMenuContent align={align} className={contentClassName}>
        {header}
        {label ? <DropdownMenuLabel>{label}</DropdownMenuLabel> : null}
        {regular.map((item) => (
          <ActionItem key={`${item.label}-${item.href ?? ""}`} item={item} />
        ))}
        {danger.length > 0 && regular.length > 0 ? <DropdownMenuSeparator /> : null}
        {danger.map((item) => (
          <ActionItem key={`${item.label}-${item.href ?? ""}`} item={item} />
        ))}
      </DropdownMenuContent>
    </RadixMenu.Root>
  );
}
