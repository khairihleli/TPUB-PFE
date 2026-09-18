"use client";

import {
  Bell,
  BookOpen,
  CircleHelp,
  ExternalLink,
  Keyboard,
  LogOut,
  Mail,
  MessageCircleQuestion,
  UserRound,
} from "lucide-react";
import { DropdownMenu as RadixMenu } from "radix-ui";

import { useNavigationGuard } from "@/components/shell/navigation-guard";
import { useSession } from "@/components/shell/session-provider";
import { useShortcutsHelp } from "@/components/shell/shortcuts";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ADMIN_ACCOUNT_NAV } from "@/content/nav";
import { CONTACT } from "@/content/site";
import { ROLE_LABEL } from "@/lib/campaign-status";
import { cx } from "@/lib/cx";
import { initials } from "@/lib/format";
import { routes } from "@/lib/routes";

function NewTabHint() {
  return <span className="sr-only"> (nouvel onglet)</span>;
}

/**
 * Account menu (UX-PLAN §3.2): Profil (espace), « Aide & raccourcis », « Voir le site ZELQANE »
 * (new tab), « Se déconnecter ». Trigger shows avatar, name and e-mail.
 */
export function AccountMenu({
  variant,
  compact = false,
  onNavigate,
}: {
  variant: "espace" | "admin";
  /** Avatar only (topbar on small screens). */
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const { user, role, logout, loggingOut } = useSession();
  const guard = useNavigationGuard();
  const { openHelp } = useShortcutsHelp();

  return (
    <RadixMenu.Root>
      <RadixMenu.Trigger
        aria-label={compact ? `Compte : ${user.nom}` : undefined}
        title={`${user.nom} · ${user.email}`}
        className={cx(
          "flex items-center gap-3 rounded-card text-left transition-colors hover:bg-overlay-hover focus-visible:outline-2 focus-visible:outline-brand-blue-text data-[state=open]:bg-overlay-hover",
          compact
            ? "size-11 justify-center rounded-full"
            : "w-full border border-line bg-overlay-inset p-2.5",
        )}
      >
        <span
          aria-hidden="true"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-grad-brand font-label text-[0.8125rem] font-bold text-on-brand"
        >
          {initials(user.nom)}
        </span>
        {compact ? null : (
          <span className="min-w-0 flex-1">
            <span className="block font-label text-[0.8125rem] font-semibold break-words text-ink-strong">
              {user.nom}
            </span>
            <span className="block truncate text-xs text-muted">{user.email}</span>
          </span>
        )}
      </RadixMenu.Trigger>
      <DropdownMenuContent
        align={compact ? "end" : "start"}
        side={compact ? "bottom" : "top"}
        className="w-64"
      >
        <div className="px-3 pt-2 pb-2">
          <p className="font-label text-sm font-semibold break-words text-ink-strong">{user.nom}</p>
          <p className="text-xs break-all text-muted">{user.email}</p>
          <p className="mt-1 text-xs text-muted">{ROLE_LABEL[role]}</p>
        </div>
        <DropdownMenuSeparator />
        {variant === "espace" ? (
          <DropdownMenuItem
            onSelect={() => {
              onNavigate?.();
              void guard.confirmNavigation(routes.espace.profile());
            }}
          >
            <UserRound aria-hidden="true" />
            Profil
          </DropdownMenuItem>
        ) : (
          ADMIN_ACCOUNT_NAV.map((item) => (
            <DropdownMenuItem
              key={item.href}
              onSelect={() => {
                onNavigate?.();
                void guard.confirmNavigation(item.href);
              }}
            >
              {item.icon === "notifications" ? (
                <Bell aria-hidden="true" />
              ) : (
                <UserRound aria-hidden="true" />
              )}
              {item.label}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuItem onSelect={() => openHelp()}>
          <Keyboard aria-hidden="true" />
          Aide & raccourcis
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={routes.home()} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden="true" />
            Voir le site ZELQANE
            <NewTabHint />
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          tone="danger"
          disabled={loggingOut}
          onSelect={() => {
            void guard.confirmAction(() => void logout());
          }}
        >
          <LogOut aria-hidden="true" />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </RadixMenu.Root>
  );
}

/** Help menu « ? » (topbar). */
export function HelpMenu() {
  const { openHelp } = useShortcutsHelp();
  return (
    <RadixMenu.Root>
      <RadixMenu.Trigger
        aria-label="Aide"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-overlay-hover data-[state=open]:bg-overlay-hover"
      >
        <CircleHelp aria-hidden="true" className="size-5" />
      </RadixMenu.Trigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onSelect={() => openHelp()}>
          <Keyboard aria-hidden="true" />
          Raccourcis clavier
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/fonctionnement" target="_blank" rel="noopener noreferrer">
            <BookOpen aria-hidden="true" />
            Comment ça marche
            <NewTabHint />
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/faq" target="_blank" rel="noopener noreferrer">
            <MessageCircleQuestion aria-hidden="true" />
            FAQ
            <NewTabHint />
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`mailto:${CONTACT.email}`}>
            <Mail aria-hidden="true" />
            Contacter ZELQANE
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={routes.home()} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden="true" />
            Voir le site ZELQANE
            <NewTabHint />
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </RadixMenu.Root>
  );
}
