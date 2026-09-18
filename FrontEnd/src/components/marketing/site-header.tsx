"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as RadixDialog } from "radix-ui";
import { useEffect, useState } from "react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { HEADER_ACTIONS, MAIN_NAV } from "@/content/nav";
import { CONTACT } from "@/content/site";
import { cx } from "@/lib/cx";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const MOBILE_EXTRA = [
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
] as const;

/**
 * Marketing header: transparent at the top, frosted glass once scrolled.
 * It overlays the first section (negative bottom margin): the first section of every
 * marketing page must reserve `var(--header-h)` of top space (PageHero does).
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setScrolled(window.scrollY > 24);
    };
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  // Close the mobile menu on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header
      className={cx(
        "sticky top-0 z-(--z-header) -mb-(--header-h) h-(--header-h) transition-[background-color,border-color,backdrop-filter] duration-300 ease-smooth",
        scrolled || open
          ? "border-b border-line bg-bg/75 backdrop-blur-[14px] backdrop-saturate-125"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="container-site flex h-full items-center justify-between gap-6">
        <Logo href="/" subline priority size="md" className="enter" />

        <nav aria-label="Navigation principale" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {MAIN_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "group/nav relative inline-flex min-h-10 items-center rounded-full px-3.5 font-label text-[0.8125rem] font-medium tracking-[0.01em] transition-colors duration-200",
                      active
                        ? "bg-[linear-gradient(180deg,var(--color-orange-soft),transparent)] text-ink-strong shadow-[inset_0_0_0_1px_var(--color-orange-line)]"
                        : "text-muted hover:text-ink-strong",
                    )}
                  >
                    {item.label}
                    {!active ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-3.5 bottom-1.5 h-[1.5px] origin-left scale-x-0 rounded-full bg-grad-brand transition-transform duration-300 ease-expo group-hover/nav:scale-x-100"
                      />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Button asChild variant="ghost" size="sm" shape="pill">
            <Link href={HEADER_ACTIONS.login.href}>{HEADER_ACTIONS.login.label}</Link>
          </Button>
          <Button asChild variant="brand" size="sm" shape="pill">
            <Link href={HEADER_ACTIONS.register.href}>{HEADER_ACTIONS.register.label}</Link>
          </Button>
        </div>

        <RadixDialog.Root open={open} onOpenChange={setOpen}>
          <RadixDialog.Trigger
            aria-label="Ouvrir le menu"
            className="glass-light inline-flex size-11 items-center justify-center rounded-full text-ink-strong transition-colors hover:border-orange-line lg:hidden"
          >
            <Menu aria-hidden="true" className="size-5" />
          </RadixDialog.Trigger>
          <RadixDialog.Portal>
            <RadixDialog.Content
              aria-describedby={undefined}
              className="fixed inset-0 z-(--z-modal) flex animate-fade-in flex-col overflow-y-auto bg-bg/97 backdrop-blur-xl focus:outline-none"
            >
              <RadixDialog.Title className="sr-only">Menu</RadixDialog.Title>
              <div aria-hidden="true" className="hairline-tricolor absolute inset-x-0 top-0" />
              <div className="container-site flex h-(--header-h) shrink-0 items-center justify-between">
                <Logo href="/" subline size="md" />
                <RadixDialog.Close
                  aria-label="Fermer le menu"
                  className="glass-light inline-flex size-11 items-center justify-center rounded-full text-ink-strong"
                >
                  <X aria-hidden="true" className="size-5" />
                </RadixDialog.Close>
              </div>

              <nav aria-label="Navigation mobile" className="container-site flex-1 pt-6">
                <ul className="flex flex-col">
                  {[...MAIN_NAV, ...MOBILE_EXTRA].map((item, i) => {
                    const active = isActive(pathname, item.href);
                    return (
                      <li
                        key={item.href}
                        className="enter border-b border-line"
                        style={{ ["--enter-delay" as string]: `${60 + i * 45}ms` }}
                      >
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setOpen(false)}
                          className={cx(
                            "flex min-h-14 items-center justify-between font-display text-xl font-semibold transition-colors",
                            active
                              ? "text-brand-orange-text"
                              : "text-ink-strong hover:text-brand-orange-text",
                          )}
                        >
                          {item.label}
                          <ArrowRight aria-hidden="true" className="size-5 text-muted" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              <div className="container-site flex flex-col gap-3 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
                <Button asChild variant="brand" size="lg" fullWidth>
                  <Link href={HEADER_ACTIONS.register.href} onClick={() => setOpen(false)}>
                    {HEADER_ACTIONS.register.label}
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" fullWidth>
                  <Link href={HEADER_ACTIONS.login.href} onClick={() => setOpen(false)}>
                    {HEADER_ACTIONS.login.label}
                  </Link>
                </Button>
                <p className="mt-3 text-center text-[0.8125rem] text-muted">
                  <a href={`mailto:${CONTACT.email}`} className="underline-slide text-ink-soft">
                    {CONTACT.email}
                  </a>{" "}
                  · {CONTACT.phone}
                </p>
              </div>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        </RadixDialog.Root>
      </div>
    </header>
  );
}
