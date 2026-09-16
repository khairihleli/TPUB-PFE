"use client";

/**
 * NavigationGuardProvider (UX-PLAN §7.1): while a form registered with useUnsavedChangesGuard is
 * dirty, internal link clicks (capture phase) and shell navigation (sidebar, tab bar, palette,
 * back control, trail) ask « Quitter sans enregistrer ? ».
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ComponentPropsWithoutRef,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  hasUnsavedChanges,
  shouldInterceptLinkClick,
  suspendUnsavedGuards,
  unsavedChangesMessage,
} from "@/lib/forms/unsaved-guard";

export { useUnsavedChangesGuard } from "@/lib/forms/unsaved-guard";

export interface NavigateOptions {
  replace?: boolean;
  /** Opens a new tab (never guarded: the current page stays). */
  newTab?: boolean;
}

interface NavigationGuardValue {
  /** Navigates now when nothing is dirty, else after « Quitter ». Resolves true when navigated. */
  confirmNavigation: (href: string, options?: NavigateOptions) => Promise<boolean>;
  /** Runs `action` now or after confirmation (e.g. logout). */
  confirmAction: (action: () => void) => Promise<boolean>;
}

const NavigationGuardContext = createContext<NavigationGuardValue | null>(null);

/** Attribute to opt a link out of interception: `<a data-guard="off">`. */
export const GUARD_OPT_OUT_ATTR = "data-guard";

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, setPending] = useState<{ run: () => void; message: string } | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const stayRef = useRef<HTMLButtonElement>(null);

  const ask = useCallback((run: () => void): Promise<boolean> => {
    if (!hasUnsavedChanges()) {
      run();
      return Promise.resolve(true);
    }
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setPending({ run, message: unsavedChangesMessage() });
    });
  }, []);

  const navigate = useCallback(
    (href: string, options: NavigateOptions = {}) => {
      if (options.replace) router.replace(href);
      else router.push(href);
    },
    [router],
  );

  const confirmNavigation = useCallback(
    (href: string, options: NavigateOptions = {}) => {
      if (options.newTab) {
        window.open(href, "_blank", "noopener");
        return Promise.resolve(true);
      }
      return ask(() => navigate(href, options));
    },
    [ask, navigate],
  );

  const confirmAction = useCallback((action: () => void) => ask(action), [ask]);

  // Capture-phase interception of same-origin links (runs before next/link's handler).
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!hasUnsavedChanges()) return;
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = shouldInterceptLinkClick(
        event,
        {
          href: anchor.getAttribute("href") ?? "",
          target: anchor.target,
          hasDownload: anchor.hasAttribute("download"),
          optOut: anchor.getAttribute(GUARD_OPT_OUT_ATTR) === "off",
        },
        window.location,
      );
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      void ask(() => navigate(href));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [ask, navigate]);

  const close = (ok: boolean) => {
    const current = pending;
    setPending(null);
    resolver.current?.(ok);
    resolver.current = null;
    if (ok && current) {
      suspendUnsavedGuards();
      current.run();
    }
  };

  const value = useMemo(
    () => ({ confirmNavigation, confirmAction }),
    [confirmNavigation, confirmAction],
  );

  return (
    <NavigationGuardContext.Provider value={value}>
      {children}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) close(false);
        }}
      >
        <DialogContent
          title="Quitter sans enregistrer ?"
          description={pending?.message}
          size="sm"
          onOpenAutoFocus={(e) => {
            // Safe default: Enter keeps the user on the form.
            e.preventDefault();
            stayRef.current?.focus();
          }}
          footer={
            <>
              <Button variant="ghost" className="text-danger" onClick={() => close(true)}>
                Quitter
              </Button>
              <Button ref={stayRef} variant="primary" onClick={() => close(false)}>
                Rester
              </Button>
            </>
          }
        />
      </Dialog>
    </NavigationGuardContext.Provider>
  );
}

/** next/link that routes plain clicks through `confirmNavigation` (sidebar, trail, back control). */
export function GuardedLink({
  href,
  onClick,
  children,
  ...rest
}: ComponentPropsWithoutRef<typeof Link> & { href: string }) {
  const guard = useNavigationGuard();
  return (
    <Link
      href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        ) {
          return;
        }
        e.preventDefault();
        void guard.confirmNavigation(href);
      }}
    >
      {children}
    </Link>
  );
}

/**
 * `const { confirmNavigation } = useNavigationGuard();` — outside the provider it navigates
 * directly (tests, marketing).
 */
export function useNavigationGuard(): NavigationGuardValue {
  const ctx = useContext(NavigationGuardContext);
  const router = useRouter();
  return useMemo(
    () =>
      ctx ?? {
        confirmNavigation: (href: string, options: NavigateOptions = {}) => {
          if (options.newTab) window.open(href, "_blank", "noopener");
          else if (options.replace) router.replace(href);
          else router.push(href);
          return Promise.resolve(true);
        },
        confirmAction: (action: () => void) => {
          action();
          return Promise.resolve(true);
        },
      },
    [ctx, router],
  );
}
