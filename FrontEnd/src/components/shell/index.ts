export { AccessNotice, accessNoticeMessage } from "@/components/shell/access-notice";
export {
  AppShell,
  type AppShellProps,
  type AppShellVariant,
  createCtaMode,
} from "@/components/shell/app-shell";
export {
  type Breadcrumb,
  BreadcrumbProvider,
  defaultTrail,
  trailParent,
  useBreadcrumbs,
  useDocumentTitle,
  useTrail,
} from "@/components/shell/breadcrumbs";
export {
  type Command,
  CommandPalette,
  CommandPaletteProvider,
  type RecentItem,
  useCommandPalette,
  useRecordRecent,
  useRegisterCommands,
} from "@/components/shell/command-palette";
export { AccountMenu, HelpMenu } from "@/components/shell/menus";
export {
  MobileTabBar,
  type MobileTabBarProps,
  tabBarVisible,
} from "@/components/shell/mobile-tab-bar";
export { badgeAriaLabel, type NavBadges, useNavBadges } from "@/components/shell/nav-badges";
export {
  GuardedLink,
  type NavigateOptions,
  NavigationGuardProvider,
  useNavigationGuard,
  useUnsavedChangesGuard,
} from "@/components/shell/navigation-guard";
export { SectionError, SectionNotFound } from "@/components/shell/section-pages";
export { SessionExpiredListener } from "@/components/shell/session-expired-listener";
export {
  reloginHref,
  SessionExpiredDialog,
  SessionExpiryBanner,
} from "@/components/shell/session-expiry";
export {
  SessionProvider,
  useOptionalSession,
  useSession,
  type SessionContextValue,
} from "@/components/shell/session-provider";
export {
  TopbarCtaProvider,
  useDemoteTopbarCta,
  useTopbarCtaDemoted,
} from "@/components/shell/topbar-cta";
export {
  type ShortcutOptions,
  ShortcutsDialog,
  ShortcutsProvider,
  useShortcut,
  useShortcutsHelp,
} from "@/components/shell/shortcuts";
